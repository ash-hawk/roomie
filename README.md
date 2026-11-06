# Roomie

IS 401 Team 4-06.

- Heidi Barlow
- Michael Bertoldo
- Frankie Cappello
- Ashlynne Hawkins

A shared-house app for roommates: chores, costs, calendar, and a message board in one place.

## App Summary

College students who move in with new or unrelated roommates rarely sit down and agree on how the house will run. Expectations go unspoken, so everyone assumes someone else will take out the trash, buy the paper towels, or ask before hosting friends. The group text where these things get sorted out is quickly buried under memes and plans, so a request from Tuesday is lost by Thursday. Chores and money then turn into tension because nobody can see who did what or who owes whom.

Roomie gives each household one shared place to coordinate: a chore chart with one-time or repeating chores that are assigned or rotated, with swap and skip requests when life gets in the way. It splits shared purchases to the exact cent, shows who owes whom, and lets recipients confirm repayment made through Venmo, Zelle, or Apple Cash. A shared calendar, household message board, wish list, and personal activity panel keep everyone on the same page.

The product requirements are documented in [docs/requirements.csv](docs/requirements.csv).

## ERD

![Roomie ERD](docs/erd.png)

Every table also has `created_at` and `updated_at` columns, which are not shown in the diagram. The schema is in [db/schema.sql](db/schema.sql).

## Tech Stack

| Layer | What we use | Purpose |
|---|---|---|
| Frontend | Vite, plain JavaScript, and CSS | Builds the frontend into static files served by Vercel. |
| Backend | Vercel serverless functions in `api/` using TypeScript | Handles API requests, with shared authentication and household-access checks through `withUser` and `withHousehold`. |
| Database | Neon Postgres | Stores application data. Separate development and production database branches support isolated testing. |
| Sign-in | Neon Auth | Manages accounts and sessions without storing passwords in application code. |
| Data access | Drizzle ORM | Provides typed database queries. Run `npm run db:pull` to introspect the database schema. |

## How to Get It Running

### Use the live app

Open **https://roomie-mockup.vercel.app**, choose **Create an account**, sign up, and join the demo household with code **`MAPLE412`**.

### Run it from a fresh clone

You need Node.js 22 or newer, Git, and a [Neon](https://neon.tech) account.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/michaelbertoldo/roomie.git
   cd roomie
   npm install
   ```

2. Create a Neon project using Postgres 17. From the project dashboard, copy both the **pooled** and **direct**, non-pooled connection strings. The connection-pooling toggle switches between them.

3. Enable **Neon Auth** in the Neon console and copy its **Auth URL**. Check that `http://localhost:5173` is allowed as a trusted origin.

4. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

   Fill in the following values:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Pooled database connection string. |
   | `DATABASE_URL_UNPOOLED` | Direct database connection string. |
   | `NEON_AUTH_URL` | Neon Auth URL from step 3. |
   | `ROOMIE_DB_BRANCH` | `dev` for the development database. |
   | `CRON_SECRET` | A random string of at least 32 characters for the scheduled chore job. Leave empty if the job is disabled. |

   `.env.local` is Git-ignored. Never commit it. Use development database credentials for local testing.

5. Create the tables by running [db/schema.sql](db/schema.sql) in the Neon **SQL Editor**.

   Alternatively, if `psql` is installed and `DATABASE_URL_UNPOOLED` is exported in your terminal:

   ```bash
   psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql
   ```

   Then run `db/migrations/0002_lock_set_updated_at.sql` the same way. Migration `0001` removes an old prototype from the team's database and is not required for a fresh project.

6. Load the sample data:

   ```bash
   npm run db:seed
   ```

   Optionally, check row counts:

   ```bash
   npm run db:counts
   ```

7. Start the backend and frontend in two separate terminals, both opened in the repository folder.

   **Terminal 1 — backend:**

   ```bash
   npm run dev:api
   ```

   The API runs at `http://localhost:3001`.

   **Terminal 2 — frontend:**

   ```bash
   npm run dev
   ```

   The frontend runs at `http://localhost:5173`.

8. Open **http://localhost:5173**, create an account, and join the seeded household with code `MAPLE412`.

### Common Local Setup Issues

- **`ENOENT: package.json` or “not a Git repository”:** Your terminal is in the wrong folder. Change into the cloned repository containing `package.json` before running commands.
- **`/api/auth/get-session` returns `ECONNREFUSED`:** Confirm the backend is running with `npm run dev:api` in a separate terminal.
- **Missing environment configuration:** Create `.env.local` from `.env.example` and supply authorized development credentials.

## Project Structure

- `src/main.js` — Application entry point, routing, and navigation order.
- `src/pages/` — Page rendering and page-specific interactions.
- `src/styles.css` — Shared styling and responsive layouts.
- `api/` — Backend API routes and handlers.
- `db/` — Database schema and migrations.
- `shared/` — Logic shared between the frontend and backend.

## Testing and Validation

Run these commands from the repository folder:

| Command | Purpose |
|---|---|
| `npm run build` | Create the production frontend build. |
| `npm run typecheck` | Check TypeScript types. |
| `npm test` | Run unit tests. |
| `npm run test:security` | Run live API and access-rule checks using an authorized development database. |
| `git diff --check` | Check changes for whitespace errors and conflict markers. |

Security tests require the development environment configuration. A check that cannot run is blocked, not passed.

### Verify Chore Completion End-to-End

This workflow demonstrates a vertical slice: the UI sends a request to the backend, the backend updates the database, and the UI reads the saved result.

Use a development household for testing.

1. Sign in and join the seeded household with code `MAPLE412`.
2. Open **Chores**.
3. Click **Add chore**.
4. Enter a name such as `Test chore`, choose **One time**, and set the date to today.
5. Under **Who does it?**, choose **One person** and select yourself.
6. Save the chore.
7. Find it on the schedule and use its completion control to mark it done.
8. Confirm the chore displays as completed.
9. Refresh the browser or sign out and back in. Confirm the completed status persists.

To inspect the saved record, open the `chore_assignment` table in Neon and find the assignment for your test chore:

- `is_completed` should be `true`.
- `completed_at` should contain the completion timestamp.
- `updated_at` should reflect the update.

Use the completion control again to mark the chore incomplete.

## Development Workflow

1. Pull the latest `main` branch before starting new work.
2. Create a branch for the change.
3. Run the app locally and verify the affected workflows on desktop and mobile.
4. Run `npm run build`, `npm run typecheck`, and `npm test`.
5. Run `npm run test:security` when required, using an authorized development database.
6. Open a pull request describing the change and its validation.
7. After merging, verify the affected workflows on the deployed application.

Keep environment secrets in `.env.local` and never commit them. Record change-specific test results and blocked checks in the pull request.

