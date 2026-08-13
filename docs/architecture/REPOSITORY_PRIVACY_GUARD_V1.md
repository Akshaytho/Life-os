# Life OS — Repository Privacy Guard V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + EXTENSION  
**Repository visibility when introduced:** public

## Purpose

Life OS will eventually contain highly private personal data and hosted credentials, while the source repository is currently public. `.gitignore` is necessary but insufficient: a file can still be force-added, and a credential can be pasted directly into tracked source or documentation.

V1 adds a second, CI-enforced guard over the **tracked repository**.

It does not replace GitHub secret scanning, platform secret stores, code review or proper environment isolation. It provides an immediate project-specific fail-closed check before merge.

## File/path rules

The guard rejects tracked files that should not exist in this repository, including:

- `.env` and `.env.*` except `.env.example`;
- private-key / keystore formats such as `.pem`, `.key`, `.p12`, `.pfx`, `.jks`;
- database backup formats such as `.dump`, `.backup`, `.sqlite`, `.sqlite3`;
- directories explicitly named for private/personal/raw exported data;
- obvious ChatGPT/Life OS/personal export archive filenames.

Normal migrations (`.sql`), synthetic fixtures and architecture documentation remain allowed.

## High-confidence content rules

The guard scans tracked text files up to 5 MB and detects recognizable live credential formats such as:

- PEM private-key material;
- OpenAI live API key format;
- Supabase `sb_secret_...` keys;
- GitHub PAT formats;
- AWS access-key IDs;
- Stripe live secret keys;
- a populated Supabase service-role JWT assignment;
- credential-bearing remote Supabase PostgreSQL URLs.

It deliberately does **not** flag generic words such as `secret`, `password`, `token` or `private`, because Life OS security tests and documentation legitimately use those words with fake data.

## Secret-safe failure output

When a violation is found, CI prints only:

```text
<file path>: <rule name>
```

It never prints the matched secret value or source line. A scanner must not become a credential exfiltration mechanism in CI logs.

## Self-test

The scanner contains a small self-test that dynamically constructs fake key-shaped values and verifies the important rules without embedding a literal secret-like credential in tracked source.

The workflow runs the self-test before scanning the repository.

## CI

`.github/workflows/privacy-guard.yml` runs on pull requests and pushes to `main`.

It requires no third-party security action and no repository secret. It uses only checkout, Node 20 and the local scanner.

## Hosted-development rule

Before any real Supabase/Railway/OpenAI credential is created for Life OS:

1. keep credentials in the hosting platform/environment secret store only;
2. never copy them into GitHub issues, PR bodies, screenshots or test fixtures;
3. keep real Life OS user exports outside this repository;
4. retain fake/synthetic CI fixtures;
5. let this guard fail if a tracked file crosses the repository privacy boundary.

## Scope limitations

V1 intentionally favors high-confidence detection. It cannot recognize every possible secret format and cannot determine whether arbitrary prose is genuinely personal information.

Future layers may include GitHub secret scanning / push protection, dependency review, a dedicated secret-scanning tool, and deployment-environment policy once hosted resources exist.

## Not introduced

- external secret-scanning vendor;
- repository secret;
- access to user Life OS data;
- real credential fixture;
- hosted Supabase/Railway resource;
- production analytics;
- automatic deletion or rewriting of files.

The guard only reports and fails CI; humans/agents must make an explicit reviewed correction.
