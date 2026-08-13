import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const secretRules = [
  { name: "private-key-material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "openai-live-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "supabase-secret-key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: "github-classic-pat", pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "github-fine-grained-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "stripe-live-secret", pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  {
    name: "supabase-service-role-jwt-assignment",
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?eyJ[A-Za-z0-9_-]{40,}/,
  },
  {
    name: "remote-supabase-postgres-credential",
    pattern: /postgres(?:ql)?:\/\/[^\s/:]+:[^\s/@]+@[^\s/]*(?:supabase\.co|supabase\.com)/i,
  },
];

function normalizedPath(path) {
  return path.replaceAll("\\", "/");
}

function forbiddenPathRule(path) {
  const value = normalizedPath(path);
  const basename = value.split("/").at(-1) ?? value;

  if (basename === ".env.example") return undefined;
  if (basename === ".env" || basename.startsWith(".env.")) return "tracked-env-file";
  if (/\.(?:pem|key|p12|pfx|jks)$/i.test(basename)) return "private-key-or-keystore-file";
  if (/\.(?:dump|backup|sqlite|sqlite3)$/i.test(basename)) return "database-backup-file";
  if (/(^|\/)(?:private-data|personal-data|user-data|raw-exports|personal-exports)(\/|$)/i.test(value)) {
    return "private-data-directory";
  }
  if (/(?:chatgpt|life-os|personal)[-_ ]?(?:export|archive)\.(?:zip|json|html|csv)$/i.test(basename)) {
    return "personal-export-file";
  }
  return undefined;
}

function looksBinary(buffer) {
  const inspected = buffer.subarray(0, Math.min(buffer.length, 8192));
  return inspected.includes(0);
}

export function inspectTrackedFile(path) {
  const violations = [];
  const pathRule = forbiddenPathRule(path);
  if (pathRule) violations.push({ path, rule: pathRule });

  const stats = statSync(path);
  if (!stats.isFile() || stats.size > MAX_TEXT_FILE_BYTES) return violations;

  const buffer = readFileSync(path);
  if (looksBinary(buffer)) return violations;
  const text = buffer.toString("utf8");

  for (const rule of secretRules) {
    if (rule.pattern.test(text)) violations.push({ path, rule: rule.name });
  }
  return violations;
}

export function inspectTrackedRepository() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  const paths = output.split("\0").filter(Boolean);
  return paths.flatMap(inspectTrackedFile);
}

function selfTest() {
  assert.equal(forbiddenPathRule(".env.local"), "tracked-env-file");
  assert.equal(forbiddenPathRule(".env.example"), undefined);
  assert.equal(forbiddenPathRule("secrets/signing.pem"), "private-key-or-keystore-file");
  assert.equal(forbiddenPathRule("personal-data/export.json"), "private-data-directory");
  assert.equal(forbiddenPathRule("docs/security.md"), undefined);

  const constructedOpenAiKey = ["sk", "proj", "A".repeat(24)].join("-");
  const constructedSupabaseKey = `sb_${"secret"}_${"B".repeat(24)}`;
  const constructedGithubPat = `ghp_${"C".repeat(30)}`;

  assert.equal(secretRules.find((rule) => rule.name === "openai-live-key").pattern.test(constructedOpenAiKey), true);
  assert.equal(secretRules.find((rule) => rule.name === "supabase-secret-key").pattern.test(constructedSupabaseKey), true);
  assert.equal(secretRules.find((rule) => rule.name === "github-classic-pat").pattern.test(constructedGithubPat), true);
  assert.equal(secretRules.some((rule) => rule.pattern.test("OPENAI_API_KEY=\nSUPABASE_SERVICE_ROLE_KEY=\n")), false);
  assert.equal(secretRules.some((rule) => rule.pattern.test("postgres://lifeos:lifeos@127.0.0.1:5432/lifeos_test")), false);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  console.log("Repository privacy guard self-test passed");
} else {
  const violations = inspectTrackedRepository();
  if (violations.length > 0) {
    console.error("Repository privacy guard failed. Secret values are intentionally not printed.");
    for (const violation of violations) console.error(`- ${violation.path}: ${violation.rule}`);
    process.exitCode = 1;
  } else {
    console.log("Repository privacy guard passed");
  }
}
