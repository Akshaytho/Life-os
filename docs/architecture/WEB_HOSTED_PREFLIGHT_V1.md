# Web Hosted Preflight V1

Status: reviewed development verification boundary

## Purpose

Verify the externally hosted Life OS web origin after deployment without authenticating, mutating Life OS state, or exposing personal data.

This preflight is intentionally separate from the authenticated API hosted preflight. The web check proves the phone-facing shell is the reviewed live deployment before a user signs in.

## Command

From the repository root:

```bash
LIFE_OS_WEB_PREFLIGHT_BASE_URL=https://<web-service-origin> \
LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION=dormant \
npm run hosted:preflight --workspace @life-os/web
```

`LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION` accepts only:

- `dormant` — initial phone deployment before Direction browser activation
- `enabled` — after the Direction database/server/browser activation sequence is complete

If omitted, the expectation is `dormant`.

## Read-only checks

The command issues exactly four GET requests:

1. `GET /health/live`
   - requires HTTP 200
   - requires `{ "status": "ok" }`

2. `GET /health/ready`
   - requires HTTP 200
   - requires `status = ready`
   - requires `mode = live`
   - requires the exact expected Direction state

3. `GET /capture`
   - requires HTTP 200
   - requires `X-Robots-Tag` to contain `noindex`, `nofollow`, `noarchive`, `nosnippet`
   - requires `Referrer-Policy: no-referrer`
   - requires `X-Content-Type-Options: nosniff`

4. `GET /robots.txt`
   - requires HTTP 200
   - requires `User-Agent: *`
   - requires `Disallow: /`

The command does not follow redirects.

## Authority and privacy

The preflight:

- has no POST/PUT/PATCH/DELETE branch
- sends no Supabase session
- reads no canonical Life OS rows
- receives no database credentials
- receives no service-role/secret Supabase key
- does not print the web origin in its receipt
- sanitizes provider/network failures
- never prints page HTML or personal content

The success receipt contains only check names, outcomes, request count and zero write attempts.

## Initial phone deployment sequence

1. Merge the reviewed web deployment code.
2. Create the separate Railway web service from repository root.
3. Configure only browser-safe public web variables.
4. Keep `NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED=false`.
5. Generate the web HTTPS domain.
6. Add only that exact web origin to API `LIFE_OS_CORS_ALLOWED_ORIGINS`.
7. Redeploy the API and require ordinary API hosted preflight READY.
8. Run this web hosted preflight with expected Direction `dormant`.
9. Only after both preflights pass, perform a real phone sign-in and verify Capture/Review/Trace/Calendar/Today.
10. Activate Direction later using its separate migration/role/server/read-only preflight sequence, then rebuild/redeploy the web with the browser Direction flag enabled and rerun this preflight with expected Direction `enabled`.

## Not proven by this command

This command does not prove:

- a user can sign in
- CORS permits the final web origin
- authenticated Capture or canonical reads succeed
- Direction writes succeed
- mobile browser ergonomics on a physical device

Those require the authenticated API preflight and final phone verification. This command deliberately does not broaden its authority to prove them.
