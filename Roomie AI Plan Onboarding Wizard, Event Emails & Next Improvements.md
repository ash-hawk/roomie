# Roomie AI Plan: Onboarding Wizard, Event Emails & Next Improvements

Nov 6, 2026 · @michael bertoldo

## Summary

Build in three steps: a shared AI module, then the onboarding wizard, then event emails behind a per-user toggle. Both features need one migration (`0003`) and follow the pattern Roomie already uses: the AI drafts, the user confirms, and the existing guarded endpoints do the writing.

| Decision | Recommendation | Why |
| --- | --- | --- |
| Can the AI write to the database? | No. It returns drafts; the user edits and confirms; existing `POST` routes create the rows. | Every write keeps `withHousehold`, `assertActiveMembers` and validation. Nothing new to secure. |
| Does the wizard need AI to work? | No. Static starter templates are the fallback. | The demo works with no API key, a timeout, or the 6-calls-per-hour limit. |
| What counts as a party? | The existing `hosting` event category. | No new category or schema change for that. |
| How fast do emails go out? | Seconds after the event is saved, via `waitUntil`. The daily cron retries failures. | Vercel Hobby cron runs once a day at most, so cron alone would be up to 24 hours late. |
| Where is the toggle? | Per user (Profile → Email notifications, off until turned on) plus a per-event "Email roommates" checkbox. | Users choose what they get; creators can skip one-off events. |
| Email provider | Resend, called with plain `fetch`. | Free tier: 100 emails/day, 3,000/month. It needs a domain we own and verify. |
| Blocker before any email goes out | Turn on Neon Auth email verification. | Today anyone can sign up with anyone's address, so Roomie could be used to email strangers. |

## What we build on

Most of the plumbing is already there. Both features copy patterns from slices (c)–(e) instead of inventing new ones.

| Piece | Where | What we reuse |
| --- | --- | --- |
| Onboarding screen | `src/pages/onboarding.js` (41 lines) | Join-with-code and create-household forms. The wizard wraps these as step 2. |
| AI call | `api/_lib/home.ts` | Flag + key check, `claude-haiku-5-5`, 15s timeout, snapshot built on the server, roommate text inside `<snapshot>` tags, output cleaned and shown with `textContent`. |
| Notifications in the same transaction | `api/_lib/calendar.ts` → `tagRoommates` | Email outbox rows get queued right beside the notification rows. |
| Daily cron | `/api/cron/chores` at 14:00 UTC, already sends event reminders | Add an outbox retry step. Hobby allows only once a day. |
| Route guards | `api/_lib/routes.ts`, `tests/guards.test.ts` | New routes go in the one table (12-function cap). A guard test fails on any unwrapped handler. |
| Profile save | `PATCH /me` | Wizard step 1 (name, phone, photo, payment apps). |
| Schema gaps | `db/schema.sql` | `users.email` exists. There is no onboarding state, no notification preferences and no email log, so migration `0003` adds them. |

## Feature 1: AI onboarding wizard

The one join/create screen becomes a six-step wizard. The AI does one job, in step 3: it turns a few answers about the house into draft chores, a house-rules note and starter wishlist items. The user edits them and confirms.

### Steps

| # | Step | Who sees it | What happens | Writes through |
| --- | --- | --- | --- | --- |
| 1 | Your profile | Everyone | First/last name, photo, phone, preferred payment app (Venmo, Zelle, Apple Cash) | `PATCH /me` |
| 2 | Your household | Everyone | Join with a code, or create a household (name, address, timezone) | `POST /households/join`, `POST /households` |
| 3 | Set up your house (AI) | Creator, or anyone in a house with no chores yet | Answer 5 quick questions, tap Suggest a setup, edit the draft, tap Add to my house | Existing `POST .../chores`, `.../board` (pinned), `.../wishlist` |
| 3b | How your house runs | People joining a house that is already set up | AI welcome brief: current chores, rotation, pinned rules, who to pay how. Read only. | Nothing (reuses `homeSnapshot`) |
| 4 | Invite roommates | Creator | Join code with Copy and Share buttons, plus a ready-to-send text | Nothing |
| 5 | Notifications | Everyone | Email toggles from Feature 2, with one line on what each one sends | `PUT /me/notification-settings` (new) |
| 6 | Quick tour | Everyone | 3–4 skippable tips on Home, Chores, Finances, Events | `POST .../onboarding/complete` (new) |

Step 3 asks about: chores the house cares about (chips: trash, dishes, bathroom, vacuuming, kitchen wipe-down, recycling), how clean is clean enough (3 levels), quiet hours, guest policy, and shared supplies. Free text is capped at 300 characters.

### How the AI part works

1. `POST /households/:id/onboarding/suggest` (wrapped in `withHousehold`). The body holds only the answers. The server adds first names of current members and the timezone from the database, never from the request.
2. The server calls Claude with one **forced tool** (`tool_choice` set to that tool). The tool's `input_schema` is the draft shape, so the reply is always JSON in that shape.
3. A new `validateDraft()` runs the same rules chore creation uses: name length, `weekly`/`monthly`/`once`, day 0–6, `HH:MM` time. The server maps first names to user ids, so the model never sees or returns ids. Invalid items are dropped, with a cap of 10 chores.
4. The reply is `{ source: 'ai' | 'template', chores, rulesNote, wishlist }`. Nothing is saved yet.
5. Fallback: `shared/onboarding-templates.ts` picks a starter set from the same answers. It runs when the flag is off, on timeout, at the rate limit, or when validation leaves nothing. The screen looks the same either way.
6. On confirm, the client calls the existing endpoints one by one with a progress line. If one fails, it shows which and offers Retry. That's simpler than a new all-in-one transaction route, and every write keeps today's checks.

Flag: `ONBOARDING_AI_ENABLED=1` plus `ANTHROPIC_API_KEY`. Limit: 3 suggestions per user per hour.

### Schema and frontend

- `household_member.onboarded_at TIMESTAMPTZ` (null = not done). It's per membership, so joining a second house gets the short path. The migration backfills existing members to `now()` so current users never see the wizard.
- `GET /me` (or the households list) returns `onboardedAt` per household. `src/main.js` shows the wizard when there is no household, or when the current membership has `onboardedAt = null`.
- Rewrite `src/pages/onboarding.js` as a wizard with the step kept in `S` and in `sessionStorage`, so a refresh keeps your place. A Back button and a step counter ("Step 3 of 6") go on every screen.

### Tests

- `tests/onboarding.test.ts`: template picker, `validateDraft` (bad day, unknown roommate, 40 chores in → 10 out, names cut to length).
- Security tests: `suggest` on someone else's household → 404. A model reply holding fake ids or extra fields is ignored.
- UI test: a new account walks all steps; an existing account goes straight to Home.

## Feature 2: Email roommates when a party or event is created

When someone saves an event, Roomie emails the roommates who turned that email type on. Tagged approvers get "approve or request changes." Everyone else gets a heads-up. The email goes out seconds after the save, and the daily cron retries anything that failed.

### The toggles

| Level | Control | Default |
| --- | --- | --- |
| Per user, per household | Profile → Email notifications: **New parties / hosting**, **Other new events**, **Requests that need my approval** | All off. Wizard step 5 asks; nothing is pre-checked. |
| Per event | "Email roommates about this" checkbox on Add event (`calendar.js`) | Checked |
| Whole app | `EVENT_EMAIL_ENABLED=1` server flag | Off until the blockers below are cleared |

An email goes out only if all three say yes. The creator never gets one, and neither does anyone who moved out (`left_date` set) or anyone whose email isn't verified.

### Schema (in migration `0003`)

- `notification_setting (user_id, household_id, channel, kind, enabled)`, primary key on the first four. `channel` is `'email'` now; `'push'` later covers S-06. `kind` is one of `event_hosting`, `event_other`, `approval_request`. A missing row means off.
- `event.email_roommates BOOLEAN NOT NULL DEFAULT true`.
- `email_outbox (email_id, user_id, household_id, kind, source_type, source_id, status, attempts, last_error, provider_id, sent_at, created_at, updated_at)`. `status` is `pending`, `sent`, `failed` or `skipped`. `UNIQUE (user_id, kind, source_type, source_id)` means re-running never double-sends.
- No grants to `authenticated` or `anonymous`. Run `npm run test:security` after migrating.

### Flow

1. **Queue.** Inside `createEvent`'s transaction, right after `tagRoommates`, `queueEventEmails(tx, ...)` picks recipients and inserts `pending` outbox rows. This follows the rule that roommate notifications go in the same transaction as the action.
2. **Send right away.** In `handlers/events.ts`, after the commit, call `waitUntil(deliverOutbox({ sourceType: 'event', sourceId }))` from `@vercel/functions` (new dependency). The user gets their response immediately while the send keeps running. `scripts/dev-server.ts` just runs it and logs errors.
3. **Deliver.** `deliverOutbox` locks the pending rows (`FOR UPDATE SKIP LOCKED`), renders the email, and POSTs to Resend's API with `Idempotency-Key = email_id`. It then marks each row `sent` or `failed` and bumps `attempts`.
4. **Retry.** The daily cron gets `retryOutbox()`: rows that are `pending` or `failed`, with fewer than 3 attempts, no older than 2 days. Rows for events that already started become `skipped`.
5. **Delete.** Deleting an event marks its pending rows `skipped`. Emails for edits and time changes come in v2.

### What the email says

- Subject: `Sam is hosting Game Night · Fri, Nov 14, 8 PM`.
- Body: when (household timezone), where, description, approval status, and one button deep-linking to the event (`/#/calendar/<eventId>`). Approvers get the Approve button.
- Footer: why you got this, plus a one-click unsubscribe link. Also send `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- Attach an `.ics` file so it drops into Google or Apple Calendar. It's cheap, and it covers part of C-02.

### Where the AI fits

The workflow itself is deterministic; the AI only writes the friendly part. Behind `EVENT_EMAIL_AI_ENABLED`, Claude writes a 1–2 sentence intro plus one heads-up line, for example "Quiet hours start at 11, and the kitchen wipe-down is due that morning." That text is generated **once per event**, not once per recipient. Date, time, place and buttons always come from the database template, so a model mistake can't change when the party is. The output is escaped into the HTML, and a template sentence is used on any failure. For a bigger AI role in email, see the weekly digest in the next section.

### Unsubscribe without signing in

- The link carries a token signed with `jose` (already a dependency), HS256 with `EMAIL_LINK_SECRET`. Claims: user id, household id, kind; expires in 60 days. No email address goes in the token.
- `GET /email/unsubscribe?t=...` shows a confirm page; the POST flips the setting. This needs a new `withSignedLink` wrapper in `context.ts`, allow-listed in `guards.test.ts` the same way `withCron` is.

### Blockers and limits

- [ ] **Email verification.** CLAUDE.md says it's off in Neon Auth, and anyone can register any email. Turn it on, and only queue for users whose token says the email is verified. Without this, Roomie can be used to send mail to strangers.
- [ ] **Domain.** Resend only delivers to arbitrary addresses from a verified domain (DNS records), and a `vercel.app` subdomain can't be verified. Someone has to buy or bring a domain. Open question: who.
- [ ] **Volume.** The free tier allows 100 emails/day. Add a cap of 20 emails per household per day so one busy house or event spam can't burn the quota.
- [ ] **Team sign-off** on sending event text to Anthropic, same as the Home AI line.
- [ ] **Env vars,** server only and never `VITE_`: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET`, `APP_ORIGIN`, `EVENT_EMAIL_ENABLED`, `RESEND_BASE_URL` (a mock for tests, like `ANTHROPIC_BASE_URL`). Set them in Preview first.

### Tests

- Pure `pickEventRecipients()` in `shared/` with unit tests: creator excluded, moved-out excluded, setting off excluded, unverified excluded, `email_roommates = false` means nobody, and approvers get the approval kind.
- Template escapes roommate text (a `<script>` event name renders as text). Tampered or expired tokens are rejected.
- Security: you can't change another user's settings. Creating an event with `RESEND_BASE_URL` pointed at a mock sends exactly the expected messages, and creating it again sends none (unique key).

## Do first: one shared AI module

Before adding two more AI calls, move the Anthropic call out of `home.ts` into `api/_lib/ai.ts`. Also replace the in-memory rate limit, which doesn't hold up on serverless.

- **`ai.ts`** exports `callText()` (today's Home line) and `callTool(schema)` (forced tool use for the wizard and quick-add). It also holds a flag per feature (`home`, `onboarding`, `eventEmail`), shared timeout and model env vars, and a log of token usage.
- **Rate limit.** The current `Map` is per instance and resets on every cold start, and Vercel can run several instances at once. Replace it with a small `ai_usage (user_id, household_id, feature, created_at)` table (in `0003`) and count the last hour. Bonus: you can see which feature costs the most.
- **Prompt safety.** Move the flatten-and-cap helper and the `<snapshot>` data-tag pattern from `shared/home.ts` into a shared helper, so every feature treats roommate-written text as data the same way.
- **Tests.** `ANTHROPIC_BASE_URL` already lets tests point at a mock. Add one test per feature that sends garbage and confirms the fallback kicks in.

## Other AI workflows, ranked

If we swap the event email's AI for something else, do **natural-language quick add**. People would use it daily, the risk is low, and it reuses the wizard's forced-tool and validator code. The **weekly digest** is the better "AI email" if the team wants one, because there the AI does real summarizing instead of just wording.

| # | Workflow | What the user does | Fits | Effort | Main risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Natural-language quick add | Types "Trash every Tue 8pm, rotate me, Sam, Jo" or "Game night Fri 8, ask everyone" and gets a pre-filled Add chore / Add event form to review and save | M-03, M-06 | Small (reuses the wizard) | Low. The user still presses Save. |
| 2 | Weekly house digest email | Opts in and gets a Sunday email: the week's events, your chores, balances, open requests, in 4–5 lines | M-09, S-06 | Small once email exists (reuses `homeSnapshot`, outbox, daily cron) | Low. Opt-in only. |
| 3 | Receipt scan → expense | Snaps a receipt and gets the total, items and a suggested split in the Add expense form | M-01 ("receipt photos" not built) | Medium. Needs file storage such as Vercel Blob; photos are currently base64 in the database, capped at 400 KB. | Money accuracy. The user must confirm, and amounts are checked in cents. |
| 4 | "Make it friendlier" on board notes | Optional button rewrites a blunt note before posting | The app's core problem: unspoken tension | Small | Must stay optional; never auto-rewrites. |
| 5 | Chore fairness check | Monthly note: "Jo did 9 of the last 12 dishes. Rotate?" SQL does the counting; AI writes the sentence. | M-03, C-01 | Medium | Can feel like blame. House-level, opt-in. |
| 6 | Shopping list helper | "We're out of paper towels" becomes a list item plus whose turn it is to buy | S-05 (not built) | Medium (the feature itself is new) | Low |

## Other improvements

The biggest wins are adding CI on pull requests, finishing the two pre-launch security items the email feature makes urgent, and filling the obvious gaps in expenses.

### Product

| Change | Why | Effort |
| --- | --- | --- |
| Expense editing + custom (unequal) splits | Listed as not built in M-01. Rent and uneven grocery runs need them. | Medium |
| Empty states that point to the next step | An empty Chores page says "Add your first chore, or let Roomie suggest some" and reopens wizard step 3. This ties the wizard into the rest of the app. | Small |
| Notification settings page with in-app mute per type | Email toggles need the page anyway; per-type mute is listed as not built. | Small |
| Email on event edit/cancel + `.ics` export | Changed plans are where roommates actually miss things. | Small after Feature 2 |
| Dark mode (C-03) | `styles.css` already keeps colors in `:root` variables (205 `var()` uses), so it's mostly one `prefers-color-scheme: dark` override block. | Small |
| Installable web app (manifest) → web push later | Gets most of S-06 without native apps. | Medium |

### Code and repo

| Change | Why | Effort |
| --- | --- | --- |
| GitHub Actions on every PR: `npm test`, `npm run typecheck`, `npm run build` | A push to `main` is a production deploy, so nothing should merge untested. | Small |
| Fix the local env so `test:security` runs | The README records it as blocked. It's the only wall without row-level security, and both features touch it. | Small |
| Neon Auth email verification + join-code rate limiting | Already on the CLAUDE.md pre-launch list. Email makes verification a hard blocker, and the wizard puts join codes front and center. | Small |
| Move dated QA logs out of README | Put "Visual Critique Follow-up" and "Sprint 1 regression" in `docs/qa/` or a `CHANGELOG.md`. README stays setup + vertical slice. | Small |
| Remove or archive `public/mockup/` | The old plain-file mockup sits next to the real app and confuses new contributors. | Small |
| A test that AI text always renders as text | The frontend builds HTML strings with `esc()`. One missed `esc` on model output becomes an XSS hole. | Small |

## Build plan

Five slices, each on its own feature branch with a Preview deploy, merged to `main` only after review. Slices f1 and f3 can run in parallel once f0 lands.

| Slice | Contents | Done when |
| --- | --- | --- |
| f0 Foundation | Migration `0003` (`onboarded_at` + backfill, `notification_setting`, `event.email_roommates`, `email_outbox`, `ai_usage`), `db:pull`, `api/_lib/ai.ts`, Home line moved onto it | `typecheck`, `npm test`, `test:security` pass on dev; Home AI line behaves the same |
| f1 Wizard, no AI | Steps 1, 2, 3b (static), 4, 5, 6; templates for step 3; `onboarding/complete` route | A new account walks every step, refresh keeps your place, existing accounts go straight to Home |
| f2 Wizard AI | `onboarding/suggest`, forced tool, `validateDraft`, flag, welcome brief for joiners | Bad model output never reaches the screen; another household's id → 404 |
| f3 Event email | Settings UI, per-event checkbox, outbox, Resend, `waitUntil`, cron retry, unsubscribe, `.ics` | A verified test account gets the email; toggle off → none; unsubscribe works signed out; zero `roomie-test-*` rows left |
| f4 Email AI + next pick | AI intro line behind its flag; then quick add (#1) or the digest (#2) | Same tests with the AI flag on and off |

### Before f3 can ship

- [ ] Domain bought and verified in Resend (who buys it?)
- [ ] Neon Auth email verification on, for dev and main
- [ ] Team OK on sending event and household text to Anthropic
- [ ] Env vars set in Vercel Preview first, then Production

### Starter prompt for Claude Code (slice f0)

```markdown
Read CLAUDE.md and db/README.md first. On a new branch `feat/ai-foundation`:
1. Write db/migrations/0003_onboarding_email_ai.sql adding: household_member.onboarded_at TIMESTAMPTZ
   (backfill existing rows to now()); notification_setting(user_id, household_id, channel, kind, enabled,
   PK on first four; channel IN ('email'); kind IN ('event_hosting','event_other','approval_request'));
   event.email_roommates BOOLEAN NOT NULL DEFAULT true; email_outbox (see the plan doc, UNIQUE(user_id, kind,
   source_type, source_id)); ai_usage(user_id, household_id, feature, created_at). No GRANTs. Stop and show me
   the SQL before running it.
2. After I approve: npm run db:migrate -- <file>, npm run db:pull.
3. Create api/_lib/ai.ts with callText() and callTool(schema) using forced tool_choice, per-feature flags,
   a DB-backed hourly limit on ai_usage, and the snapshot/data-tag helper moved from shared/home.ts.
   Move home.ts onto it with no behavior change.
4. Run npm test, npm run typecheck and npm run test:security. Do not push to main.
```

## Sources

- [Vercel: Cron jobs usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) (Hobby = once per day, ±59 min)
- [Vercel: @vercel/functions `waitUntil`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Resend: pricing knowledge-base article](https://resend.com/docs/knowledge-base/what-is-resend-pricing) (free plan 100/day)
- Roomie repo: `CLAUDE.md`, `db/schema.sql`, `api/_lib/home.ts`, `api/_lib/calendar.ts`, `docs/requirements.csv`
