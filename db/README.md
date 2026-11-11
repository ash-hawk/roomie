# Roomie database

Neon project `roomie` (id royal-dawn-21099610), Postgres 17, database `neondb`. Two branches:

| Branch | Endpoint | Used by | Env file |
|---|---|---|---|
| **dev** (`br-shiny-snow-b4dfvo7y`) | `ep-bitter-paper-b4o50os5` | local development, **every test suite**, **Vercel Preview deploys**, drizzle-kit | `.env.local` |
| **main** (`br-lingering-meadow-b4mxxgy5`) | `ep-lingering-wave-b4harozg` | **production and the demo only** (Vercel Production env) | `.env.production.local` |

Each branch has its own Neon Auth instance (its own users and its own `NEON_AUTH_URL`). dev was created from main, so it started with a copy of main's data; they have diverged since and are independent.

## Rules
- Nothing except production touches **main**. `.env.local` points at dev, so `npm run ...` is safe by default.
- `.env.production.local` is only for deliberate production work (`db:seed:prod`, `db:migrate:prod`). Never source it for tests or local dev.
- The guard in `scripts/lib/db-guard.ts` enforces this. It asks the connected database for its `neon.endpoint_id` and compares it to `branches.json`. Every test, sweep and fixture refuses to run unless it is on dev and `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_AUTH_URL` all point at dev. Seed, unseed and migrate default to dev and need `--production` plus the production env file for main.
- Vercel: **Preview** env vars point at dev, **Production** env vars point at main.

## Roles
- `neondb_owner` owns all 21 tables and is the role in every `DATABASE_URL` (both branches). `/api` uses it. It bypasses RLS, and there is no RLS.
- `authenticated` and `anonymous` (the Data API roles) have zero privileges on every table. The Neon Data API is OFF on both branches.

## Files
- `schema.sql` is the source of truth (v5, 21 tables). `migrations/` holds numbered changes since; migration `0003_onboarding_email_ai.sql` adds onboarding, email and AI usage tables, `0004_verified_notification_channels.sql` adds verified notification channels, and `0005_add_bulletin_message_resolution.sql` adds resolved-announcement status. `archive/` is the old RLS prototype, never run. `branches.json` holds the branch and endpoint ids (no secrets).

## Changing the schema
1. Write the next numbered file in `migrations/` and get it reviewed.
2. `npm run db:migrate -- db/migrations/000N_name.sql` (applies to **dev** in one transaction).
3. `npm run db:pull` (refreshes `api/_lib/schema.ts` and `relations.ts` from dev), then `npm run typecheck`.
4. `npm test && npm run test:security && npm run test:seed`.
5. Only after review: `npm run db:migrate:prod -- db/migrations/000N_name.sql` (applies to **main**), then update `schema.sql`.

## Seed data (join code `MAPLE412`)
- `npm run db:seed` / `db:unseed` act on dev. `npm run db:seed:prod` / `db:unseed:prod` act on main (the demo). Both are loaded today.
- Users are `maple.*@example.com`. The seed only ever deletes and recreates its own rows. Real people who joined the seed household keep their account and just lose that membership on a reset.

## Environment (see `.env.example`)
`DATABASE_URL` (pooled, for `/api`), `DATABASE_URL_UNPOOLED` (migrations, drizzle-kit, tests), `NEON_AUTH_URL`, `ROOMIE_DB_BRANCH` (`dev` or `main`).

## Vercel
- Auth is proxied through our own domain by `api/auth-proxy.ts`. Every origin that serves the app must be a trusted origin of the matching Neon Auth branch. Today: `https://roomie-is401-preview.vercel.app` on both. See `docs/demo-access.md`.

## Weekly household activity

Migration `0006_household_activity.sql` adds `app_event`. The chore-completion
transaction records the first successful completion per user and assignment.
An undo followed by another completion of the same assignment by the same user
keeps the original event. Demo household and fixture accounts are excluded at
write time. For a development smoke test, use a regular account in a separate
development household.

Run this query in the database console with your household ID and the first
local date of the reporting week. The bounds use the household's timezone.

```sql
WITH report AS (
    SELECT 123::bigint AS household_id, DATE '2026-11-09' AS week_start
)
SELECT count(DISTINCT e.user_id) AS active_users
FROM report r
JOIN household h ON h.household_id = r.household_id
LEFT JOIN app_event e ON e.household_id = h.household_id
    AND e.occurred_at >= (r.week_start::timestamp AT TIME ZONE h.timezone)
    AND e.occurred_at < ((r.week_start + 7)::timestamp AT TIME ZONE h.timezone);
```
