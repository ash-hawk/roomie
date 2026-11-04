# Roomie

IS 401 Team 4-06. 
- Heidi Barlow
- Michael Bertoldo
- Frankie Cappello
- Ashlynne Hawkins <br> <br>
A shared-house app for roommates: chores, costs, calendar and a message board in one place.

## App Summary

College students who move in with new or unrelated roommates rarely sit down and agree on how the house will run. Expectations go unspoken, so everyone assumes someone else will take out the trash, buy the paper towels, or ask before hosting friends. The group text where these things get sorted out is quickly buried under memes and plans, so a request from Tuesday is lost by Thursday. Chores and money then turn into tension, because nobody can see who did what or who owes whom. Roomie gives each household one shared place to fix this: a chore chart with one-time or repeating chores that are assigned or rotated, with swap and skip requests when life gets in the way. It splits shared purchases to the exact cent, shows who owes whom, and lets the person who gets paid confirm repayment through Venmo, Zelle or Apple Cash. A shared calendar, a sticky-note board for checking in before hosting, a wish list and a notification dashboard keep everyone on the same page, and the features come from [docs/requirements.csv](docs/requirements.csv).

## ERD

![Roomie ERD](docs/erd.png)

Every table also has `created_at` and `updated_at` columns (not shown in the diagram). The schema is in [db/schema.sql](db/schema.sql).

## Tech Stack

| Layer | What we use | Why it fits our team |
|---|---|---|
| Frontend | Vite, plain JavaScript and CSS | Fast to start, no framework to learn mid-semester, and it builds to static files Vercel serves for free. |
| Backend | Vercel serverless functions in `api/` (TypeScript) | Free on the Hobby plan, deploys with the frontend, and every route passes through one shared security check (`withUser` / `withHousehold`) so no one has to remember to protect a new endpoint. |
| Database | Neon Postgres | Free tier, and real SQL tables we can open and inspect in Neon's table editor. This is what the ERD describes. It has separate `dev` and `main` branches, so testing never touches the demo data. |
| Sign-in | Neon Auth | Handles accounts and sessions so we do not store passwords ourselves. It lives next to the database, on the same free plan. |
| Data access | Drizzle ORM | Typed queries generated from the live tables (`npm run db:pull`), so a schema change shows up as a compile error rather than a runtime bug. We keep the SQL close to the surface instead of hiding it. |

## How to Get It Running

### Use the live app

Open **https://roomie-mockup.vercel.app**, choose **Create an account**, sign up, then join the demo household with code **`MAPLE412`**.

### Run it from a fresh clone

You need Node 22 or newer, git, and a free [Neon](https://neon.tech) account.

1. Clone and install:
   ```
   git clone https://github.com/michaelbertoldo/roomie.git
   cd roomie
   npm install
   ```
2. Create a Neon project (any name, Postgres 17). On the project dashboard, copy the **pooled** connection string and the **direct** (non-pooled) one (the "Connection pooling" toggle switches between them).
3. In the Neon console open **Auth** and enable Neon Auth for the project. Copy its **Auth URL**. Under trusted origins make sure `http://localhost:5173` is allowed (localhost is trusted by default).
4. Create your env file and fill it in:
   ```
   cp .env.example .env.local
   ```
   - `DATABASE_URL`: the pooled connection string
   - `DATABASE_URL_UNPOOLED`: the direct connection string
   - `NEON_AUTH_URL`: the Auth URL from step 3
   - `ROOMIE_DB_BRANCH`: leave as `dev`
   - `CRON_SECRET`: any random string of 32+ characters (only needed for the scheduled chore job; leave empty to disable it)

   `.env.local` is git-ignored. Never commit it.
5. Create the tables. Paste the contents of `db/schema.sql` into the Neon **SQL Editor** and run it, or from a terminal with `psql`:
   ```
   psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql
   ```
   Then run `db/migrations/0002_lock_set_updated_at.sql` the same way. (`0001` only removes an old prototype from our own database, so a fresh project does not need it.)
6. Load the sample data (every table gets at least 3 rows):
   ```
   npm run db:seed
   npm run db:counts      # optional: rows per table
   ```
7. Start the app, in two terminals:
   ```
   npm run dev:api        # API on http://localhost:3001
   npm run dev            # app on http://localhost:5173
   ```
8. Open http://localhost:5173, create an account, and join with code `MAPLE412`.

Other useful commands: `npm test` (unit tests), `npm run test:security` (live API and access-rule checks against your database), `npm run typecheck`.

## Verifying the Vertical Slice

The slice is **marking a chore done**: the button sends a request to the backend, the backend updates the database, returns the updated chore, and the page shows it as done. It still shows as done after a refresh because it is read back from the database.

A brand-new account has no chores assigned to it yet (only the person a chore is assigned to can mark it done), so first give yourself one:

1. Sign in and join with code `MAPLE412` if you have not already.
2. Click **Chores** in the navigation.
3. Click **Add chore**. Type a name such as `Test chore`, choose **One time**, leave the date as today, leave **Who does it?** on **One person** with **(you)** selected, and click **Add chore**.
4. Your chore appears on the schedule with a round check button on its left. Click it. A toast says "Nice. Marked done." and the chore now shows a green **Done** chip with today's date.
5. Refresh the browser (or sign out and back in). The chore still shows **Done** with the same date.

To see the row in the database: in the Neon console open **Tables**, pick the `chore_assignment` table, and find the row for your chore. `is_completed` is `true` and `completed_at` holds the time you clicked. The `updated_at` column also changed, set by a database trigger.

To undo it, click the same button again (it marks the chore not done).

## Recent Changes

### Profile and Household
- The header account button opens the signed-in user's editable profile.
- Household is a separate navigation tab with the roommate list and invite code.
- Roommate rows open read-only contact and payment-method profiles.
- Contact and payment details are hidden for former roommates.
- Active-member counts, roles, join dates, and former-roommate history remain visible.

### Profile Editor
- Kept the editable profile form on the dedicated Profile page.
- Displayed first name, last name, phone, and profile-photo controls.
- Restored payment-app fields for Venmo, Zelle, and Apple Cash,
  including a preferred-app selection.
- Reused the existing Save profile handler and PATCH /me endpoint.
- Preserved profile saving and sign out functionality.

### Verification
- Build and typecheck passed locally.
- All 73 unit tests passed locally.
- Verified the deployed profile form appears after refreshing.
- Verified household members load, former roommates expand,
  and the header account button opens Profile.
- Invitation copying was confirmed manually.
- Profile saving and persistence passed on November 4, 2026: a temporary
  first-name edit survived refresh, and the original name was restored and
  verified after a second refresh.
- Security tests were blocked by missing local development
  environment configuration; they were not marked as passed.


## Visual Critique Follow-up (November 4, 2026)

Reviewed the eight findings in Sierra Andreason's October 16 visual critique against current main and the deployed Home, Events, Finances, and Chores pages.

| Finding | Current status and response |
|---|---|
| Empty Home snapshot | Already addressed: Home shows upcoming chores and financial balances. |
| Cluttered mobile calendar filters | Already addressed: Events controls stack in a separate padded block; inspected at 390 × 844. |
| Pinned notes blend in | Already addressed in current code: pinned notes have a distinct background, border, and Pinned label. |
| Small purchase details / unclear clickable rows | Already addressed in current code: 14px purchase details, hover/focus treatment, and a chevron. |
| Household balances outweigh personal balances | This change places Your balances first at full width and makes Who owes who a collapsed native disclosure. |
| Chore tab order disagrees with initial view | Already addressed: Schedule is both first and the initial view. Retained that consistent order rather than moving the active tab. |
| Small chore schedule text | This change sets chore titles to 16px, due-date/schedule text to 14px, and group labels to 13px. |
| Red means both difficulty and overdue | Already addressed: effort badges use neutral styling; overdue keeps its red warning and explicit label. |

Validation: production build, typecheck, and 73 unit tests passed. PR #8 was merged. No database or API behavior changed.

### Deployed UI verification (November 4, 2026)

Checked the signed-in deployed app at https://roomie-mockup.vercel.app.

| Check | Result |
|---|---|
| Finances disclosure | Passed: initially collapsed; mouse click and Space open it, and Enter closes it. |
| Keyboard focus on disclosure | Passed: focused summary has a visible 2px outline. |
| Chore text sizes | Passed: titles render at 16px; schedule/due-date text at 14px with 21px line height; chart metadata renders at 14px. |
| Desktop horizontal overflow | Passed on Finances and Chores schedule at 1440px viewport width. |
| Mobile horizontal overflow | Chores schedule and chart passed at 390px width. A long purchase title previously extended Finances to 866px; the follow-up CSS fix wraps expense titles within their column and keeps amounts from shrinking. Production build passed. Deployed retest passed at 390px: document width is 390px, the long title wraps, and its expense-details dialog opens without horizontal overflow. |
| Lighthouse accessibility — Finances | Passed: 96/100, reported by Frankie on November 4, 2026; exceeds the required 90. |
| Lighthouse accessibility — Chores | Passed: 96/100, reported by Frankie on November 4, 2026; exceeds the required 90. |

Frankie ran Lighthouse for Finances and Chores and reported an accessibility score of 96 for each. Audit exports and device-mode details are not included here. These results meet the accessibility-score requirement; they do not by themselves establish that all Definition of Done criteria are complete.

Profile save/persistence has now passed the deployed regression check below. Live security tests remain blocked: they require authorized dev environment configuration, which is unavailable in this checkout.


### Sprint 1 regression check (November 4, 2026)

- Tested the merged application at commit `b773824` with the signed-in household.
- Saved a temporary first-name edit, refreshed to verify persistence, then restored the original name and refreshed again to verify restoration. Other profile fields were preserved.
- Household displayed 10 active-member profile buttons; former-roommate history expanded correctly.
- Verified Finances has no horizontal overflow at 390px, including the long-title expense details dialog. The expense row still opens its details.
- Chores Just mine filter showed the signed-in user's existing completed assignment. Chore chart opened, and A–Z sorting produced alphabetically ordered chore titles.
- Latest merged code passed production build, typecheck, and all 73 unit tests.
- No new application defect was found in this focused pass. No chores, expenses, payments, or household membership records were changed. Full multi-user, photo-upload, and security testing are outside this recorded pass.
