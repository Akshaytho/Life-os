import type { Pool, PoolClient } from "pg";

export class PostgresUserScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresUserScopeError";
  }
}

export class PostgresUserScope {
  constructor(private readonly pool: Pool) {}

  async run<T>(authenticatedUserId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (typeof authenticatedUserId !== "string" || !authenticatedUserId.trim()) {
      throw new PostgresUserScopeError("authenticatedUserId is required for a private database transaction");
    }

    const client = await this.pool.connect();
    let discardClient = false;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('lifeos.user_id', $1, true)", [authenticatedUserId]);

      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  }
}
