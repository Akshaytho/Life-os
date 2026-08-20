import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import { allPrivateTables, userScopeFunction } from "./private-database-contract";

const restrictedApiRoles = ["anon", "authenticated", "service_role"] as const;
const everyTablePrivilege = "SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER";

const productionSecurityReadinessSql = `
WITH required_table(name) AS (
  VALUES ${allPrivateTables.map((name) => `('${name}')`).join(", ")}
), private_table AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  FROM required_table required
  LEFT JOIN pg_namespace n ON n.nspname = current_schema()
  LEFT JOIN pg_class c
    ON c.relnamespace = n.oid
   AND c.relname = required.name
   AND c.relkind IN ('r', 'p')
), scope_function AS (
  SELECT p.oid, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.proname = '${userScopeFunction}'
    AND pg_get_function_identity_arguments(p.oid) = ''
), restricted_role AS (
  SELECT oid FROM pg_roles WHERE rolname IN (${restrictedApiRoles.map((name) => `'${name}'`).join(", ")})
)
SELECT
  count(private_table.oid)::int AS table_count,
  count(private_table.oid) FILTER (
    WHERE private_table.relrowsecurity AND private_table.relforcerowsecurity
  )::int AS protected_table_count,
  count(private_table.oid) FILTER (
    WHERE ${restrictedApiRoles.map((role) =>
      `NOT has_table_privilege('${role}', private_table.oid, '${everyTablePrivilege}')`
    ).join("\n      AND ")}
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(private_table.relacl, acldefault('r', private_table.relowner))) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
      )
  )::int AS api_inaccessible_table_count,
  (
    SELECT count(*) = 1
      AND bool_and(NOT sf.prosecdef)
      AND bool_and(sf.provolatile = 's')
      AND bool_and(COALESCE(sf.proconfig, '{}'::text[]) @> ARRAY['search_path=""'])
      AND bool_and(has_function_privilege(current_user, sf.oid, 'EXECUTE'))
      AND NOT EXISTS (
        SELECT 1
        FROM scope_function function_acl
        CROSS JOIN LATERAL aclexplode(
          COALESCE(function_acl.proacl, acldefault('f', function_acl.proowner))
        ) acl
        WHERE acl.privilege_type = 'EXECUTE'
          AND (acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM restricted_role))
      )
    FROM scope_function sf
  ) AS scope_function_safe,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    WHERE defaults.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      AND defaults.defaclrole IN (SELECT DISTINCT relowner FROM private_table WHERE relowner IS NOT NULL)
      AND defaults.defaclobjtype IN ('r', 'S', 'f')
      AND (acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM restricted_role))
  ) AS future_objects_private
FROM private_table
`;

/**
 * Production starts only when every shipped private table is protected, browser/API
 * provider roles have no direct SQL access, the user-scope function is hardened, and
 * the migration owner cannot auto-grant future objects back to those roles.
 */
export function createProductionDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const result = await database.query(productionSecurityReadinessSql);
      if (result.rows.length !== 1) return false;
      const row = result.rows[0];
      return (
        row.table_count === allPrivateTables.length
        && row.protected_table_count === allPrivateTables.length
        && row.api_inaccessible_table_count === allPrivateTables.length
        && row.scope_function_safe === true
        && row.future_objects_private === true
      );
    },
  };
}
