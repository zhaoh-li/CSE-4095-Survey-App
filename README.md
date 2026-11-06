# Classroom Survey

A web app for quick in-class understanding checks. The instructor prepares a survey, activates it and shows a QR code; students scan it and answer on their phones without logging in; the instructor watches responses arrive and reviews the results.

- **Live app:** <https://cse-4095-survey.gustluff.workers.dev>
- **Repository:** <https://github.com/zhaoh-li/CSE-4095-Survey-App>
- **Course:** CSE 4095 – Agentic Programming

## Trying it out

- **As a student:** activate a survey (below), then scan its QR code or open the link shown under it. No account is needed.
- **As the instructor:** use the **Instructor Login** button on the home page. Public sign-ups are turned off, so the login for a grader account is submitted privately through HuskyCT and is never stored in this repository (DECISIONS.md D6).

## Features

**Instructor** (signed in)

- Dashboard of all surveys with status badges, response counts, title search, status filter and date filter.
- Survey editor for multiple-choice and true/false questions: add, reorder and delete questions and choices; only drafts can be edited.
- Activate a survey (only one is active at a time; activating another asks first), close it, reopen it, archive it, duplicate it, delete it.
- Present page for the projector: large QR code, readable link, response count that refreshes every 5 seconds, PNG download, full-screen mode.
- Results page: count and percentage per choice, bar charts, and CSV export.

**Student** (no login)

- Open the active survey from the QR code or link, answer every question, submit, and see a confirmation.
- Repeat submissions from the same browser are refused ("You have already submitted a response to this survey."), and closed or unknown surveys show a clear message.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router |
| Charts and QR codes | Recharts, `qrcode` |
| Database and login | Supabase (PostgreSQL, Row Level Security, Supabase Auth) |
| Hosting | Cloudflare (Workers static assets), deployed from GitHub |
| Tests | Vitest, PGlite, Playwright with axe |

## How it works

The browser talks to Supabase directly with the public ("anon") key; there is no separate server.

- **Instructors** sign in with Supabase Auth. Row Level Security lets signed-in users read and change all five tables.
- **Students** have no table access at all. They can only call two database functions: `get_public_survey` (loads one active survey by its link) and `submit_survey_response` (checks and stores one response in a single transaction).
- **Instructor actions** that must follow rules run as database functions: `activate_survey`, `close_survey`, `save_survey_draft`, `duplicate_survey` and `get_survey_results`. Database triggers also enforce the status and editing rules, so they hold even if the frontend has a bug.

```text
surveys ─┬─ questions ── choices
         └─ responses ── answers (each answer points to a question and a choice)
```

Design decisions that go beyond the provided specifications are recorded in [DECISIONS.md](DECISIONS.md).

## Local setup

Requirements: Node.js 22 or newer and a Supabase account (the free plan is enough).

```bash
git clone https://github.com/zhaoh-li/CSE-4095-Survey-App.git
cd CSE-4095-Survey-App
npm install
cp .env.example .env    # then fill in the two values (see below)
npm run dev             # opens on http://localhost:5173
```

`.env` needs the Supabase project's URL and **public** key, from the project's **Connect** panel or **Project Settings → API Keys**:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # or the legacy "anon public" key
```

The names must start with `VITE_`. Never use the `secret` / `service_role` key: it bypasses all security rules. `.env` is ignored by git.

## Database setup (Supabase)

1. Create a Supabase project.
2. In **SQL Editor**, run each file in [`supabase/migrations/`](supabase/migrations) **in filename order**:
   1. `20261101000000_initial_schema.sql` – tables, indexes, Row Level Security, triggers, `get_public_survey`, `submit_survey_response`, `activate_survey`, `close_survey`
   2. `20261102000000_duplicate_survey.sql` – `duplicate_survey`
   3. `20261102100000_editor_and_results.sql` – `save_survey_draft`, `get_survey_results`
3. **Authentication → Sign In / Providers:** turn off "Allow new users to sign up" (keep the Email provider on).
4. **Authentication → Users → Add user → Create new user:** create the instructor account with **Auto Confirm User** checked. Create a separate account the same way for a grader.

## Deployment (Cloudflare)

1. In Cloudflare, create an application from Git (**Workers & Pages → Create**) and connect this GitHub repository.
2. Build settings: build command `npm run build`, output directory `dist`, production branch `main`. Node 22 is selected by `.nvmrc`.
3. Add the build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (as plain text) with the main Supabase project's values. Vite builds them into the site, so changing them needs a new deployment.
4. Deploy. Every push to `main` deploys again.
5. In Supabase, **Authentication → URL Configuration**: set **Site URL** to the deployed address and add `<address>/**` to **Redirect URLs**.

Direct links such as `/s/abc123` work without extra configuration, and the security headers (including a Content Security Policy) come from [`public/_headers`](public/_headers). Details are in DECISIONS.md D28.

## Tests

| Command | What it checks |
|---|---|
| `npm test` | Unit tests: editor logic, CSV export, error messages, the student token |
| `npm run test:db` | Database tests: runs every migration in PGlite and checks RLS, all functions and the status rules as a student and as an instructor |
| `npm run test:e2e` | Browser tests in Chromium, Firefox, WebKit and two phone sizes: full workflow, editor, dashboard, unauthorized access, accessibility (axe) and security headers. Needs a separate Supabase test project in `.env.test` |
| `E2E_BASE_URL=<live address> npm run test:e2e:prod` | Read-only browser tests against the deployed site |

Also: `npm run lint`, `npm run build`, `npm run format:check`. Setup steps, manual checks and the latest results are in [TESTING.md](TESTING.md).

## Project structure

```text
src/
  pages/        one component per page (dashboard, editor, present, results, student survey, …)
  components/   shared pieces (survey card, question editor, dialogs, layout, charts)
  lib/          Supabase calls, editor logic, CSV export, error messages, helpers
supabase/
  migrations/   the SQL to run in Supabase, in order
  tests/        database tests (PGlite)
e2e/            Playwright browser tests
public/         static files, including _headers (security headers)
```

## Documents

| File | Contents |
|---|---|
| [Classroom_Survey_Web_App_Specification.md](Classroom_Survey_Web_App_Specification.md) | Provided: overall requirements |
| [DATABASE.md](DATABASE.md) | Provided: database design |
| [API.md](API.md) | Provided: data access |
| [UI.md](UI.md) | Provided: screens and navigation |
| [TODO.md](TODO.md) | Provided: implementation tasks, checked off as completed |
| [DECISIONS.md](DECISIONS.md) | Design decisions D1–D28, which take precedence over the specifications where they differ |
| [TESTING.md](TESTING.md) | How to run each test suite, manual checks and results |

## Security

- No secrets are committed: `.env` and `.env.test` are ignored by git, and the example files contain placeholders only.
- Only the public key is used in the browser; what it can do is limited by Row Level Security and function permissions.
- Students cannot read any table, insert rows directly or call instructor functions. This is checked by the database tests and, against the live site, by the browser tests.
