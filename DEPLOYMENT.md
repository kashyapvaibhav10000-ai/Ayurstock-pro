# Deployment

## Required environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `JWT_SECRET` | At least 32 characters. The app refuses to start in production otherwise. Rotating it logs everyone out. |
| `PIN_HASH_KEY` | At least 32 characters, required in production. POS PINs are HMACs under this key, so changing it invalidates every PIN. |
| `AI_ENCRYPTION_KEY` | 32 bytes (64 hex chars). Encrypts AI provider keys stored in the database. |
| `SUPER_ADMIN_USER_IDS` | Comma-separated `User.id`s of ADMIN users who manage Settings > AI. |
| `TRUST_PROXY` | `cloudflare` behind Cloudflare Tunnel (see below), else empty. |
| `AI_DAILY_CALLS_PER_SHOP` | Optional, default 200 AI provider calls per shop per UTC day. |
| `APP_ORIGINS` | Optional. Extra origins (e.g. `https://shop.example.com`) allowed to make POST/PUT/PATCH/DELETE API calls. The request's own Host is always allowed; set this only if something in front rewrites Host. |

Generate secrets with `openssl rand -hex 32`.

## Cloudflare Tunnel

Behind the tunnel every request reaches the app from `127.0.0.1`, so the
client address comes from the `CF-Connecting-IP` header, which Cloudflare
always overwrites. That header is only trustworthy if nothing but the tunnel
can reach the app:

- Run the app bound to loopback: `next start -H 127.0.0.1` (set this in the
  systemd unit's `ExecStart`).
- Point `cloudflared` at `http://127.0.0.1:3000`.
- Set `TRUST_PROXY=cloudflare`.

`X-Forwarded-For` is never read; clients can set it to anything.

## Request protections in `proxy.ts`

Every `/api` request passes the proxy:

- State-changing methods with a foreign `Origin` (or `Sec-Fetch-Site: cross-site`) get 403 (CSRF).
- Bodies over 20 MB get 413 before any route reads them.

Sessions live only in the httpOnly `auth-token` cookie; the API ignores
`Authorization: Bearer` headers. Security headers (CSP, HSTS, frame-ancestors
'none', nosniff, Referrer-Policy, Permissions-Policy) are set in
`next.config.js`. If you add a third-party script or API to the browser side,
add its origin to the CSP there.

## Deploying the security-hardening release (migration `20261101000000_security_hardening`)

1. Make sure no two users share an email, even across shops. The migration
   lowercases emails and stops with a list of duplicates if any remain:
   ```sql
   SELECT lower(trim(email)), count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1;
   ```
2. Set `PIN_HASH_KEY`, `SUPER_ADMIN_USER_IDS` and `TRUST_PROXY` in `.env`, and
   remove `SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_USERNAMES`.
3. Deploy (`scripts/deploy.sh` runs `prisma migrate deploy` and the build).
4. Convert existing plaintext PINs once: `npm run hash-pins`. It clears any
   PIN shared by two users of one shop and lists those users.
5. Rotate `JWT_SECRET`. Sessions issued before this release have no token
   version and are already rejected, so everyone signs in again either way.
6. Pair each POS terminal: Settings > POS Devices > Pair device, then on the
   terminal's login screen choose "Pair this device" and enter the code.
   PIN login works only on paired devices.

## Tests

The tests run route handlers against a real, disposable Postgres. **Every run
wipes the database**, so never point them at real data:

```bash
docker run -d --name ayur-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=ayur_test \
  -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
export TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/ayur_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
npm test
```

## Migration `20261102000000_login_history_unknown_users`

Makes `LoginHistory.userId` optional and adds `shopId`, so failed logins for
unknown usernames/emails and wrong POS PINs are recorded. No data changes;
`scripts/deploy.sh` applies it.
