# Testing

How to run each test suite, and the manual checks that complete TODO.md Phase 14.

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Unit tests | `npm test` | Nothing | Editor logic and checks, CSV building, error messages, the student token |
| Database tests | `npm run test:db` | Nothing | Tables, Row Level Security, all database functions, status rules, results, duplicate protection |
| End-to-end tests | `npm run test:e2e` | One-time setup below | The full workflow in real browsers, phone screen sizes, unauthorized access, accessibility |
| Manual checks | — | A browser | Keyboard-only use, database inspection, a real phone |

Before committing, also run `npm run lint` and `npm run build`.

---

## 1. Unit tests

```bash
npm test
```

Runs the Vitest tests in `src/**/*.test.ts`. No network or database is used.

## 2. Database tests

```bash
npm run test:db
```

Runs every file in `supabase/migrations/` in PGlite (Postgres in WebAssembly) and checks the rules as an anonymous student and as a signed-in instructor. No Supabase project is used.

---

## 3. End-to-end tests (Playwright)

The tests drive real browsers through the app: Chromium, Firefox and WebKit on desktop, plus Pixel 7 and iPhone 14 screen sizes.

| File | Changes data? | Runs against |
|---|---|---|
| `e2e/public.spec.ts` | No | `.env.test` if it exists, otherwise `.env` |
| `e2e/workflow.spec.ts` | **Yes** | Only the test project in `.env.test`; skipped otherwise |

### One-time setup

**a. Download the browsers** (stored inside `node_modules`, about 600 MB):

```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium firefox webkit
```

**b. Install the system libraries the browsers need** (Linux/WSL only, needs your password):

```bash
sudo env "PATH=$PATH" npx playwright install-deps
```

**c. Create a separate Supabase test project.** The workflow tests create, activate, close and delete surveys, and activating closes whatever survey is active, so never point them at the real project.

1. In Supabase, create a second project, e.g. `classroom-survey-test`.
2. In its SQL Editor, run each file in `supabase/migrations/` **in filename order**.
3. Authentication → Sign In / Providers: turn off "Allow new users to sign up".
4. Authentication → Users → Add user → Create new user, with **Auto Confirm User** checked.
5. Copy `.env.test.example` to `.env.test` and fill in the test project's URL and public key and that user's email and password. `.env.test` is ignored by git.

### Running

```bash
npm run test:e2e                                   # everything, all 5 browser setups
npm run test:e2e -- --project=chromium             # one browser only (fastest)
npm run test:e2e -- e2e/workflow.spec.ts           # one file
npm run test:e2e -- -g "full workflow"             # tests whose name matches
npm run test:e2e -- --project=chromium --headed    # watch the browser (needs WSLg on WSL)
```

Tests run one at a time, because only one survey can be active at once. Test surveys are named `E2E …` and are deleted before and after each run.

### When a test fails

1. Read the failure in the terminal: it shows the step, what was expected and what was found.
2. Open the HTML report: `npx playwright show-report`
3. Open the trace (every step, with DOM snapshots and network calls):
   `npx playwright show-trace test-results/<test-folder>/trace.zip`
   A screenshot of the failure is in the same folder.
4. An "accessibility problems" failure lists each axe rule and the element it found, e.g. `color-contrast: Elements must meet minimum color contrast ratio thresholds (#main > p)`.

---

## 4. Manual checks

### Keyboard only

Put the mouse away and use Tab, Shift+Tab, Enter, Space, the arrow keys and Escape.

| Check | Expected |
|---|---|
| Log in | Every field and button is reachable; a visible ring shows where focus is |
| On the dashboard, press Tab once | "Skip to main content" appears; Enter jumps past the header |
| Open a dialog (e.g. Archive) | Focus starts on Cancel, Tab stays inside the dialog, Escape cancels |
| In the editor, press "+ Add Question" | Focus moves to the new question's text box |
| Delete a question with text | After confirming, focus moves to "+ Add Question" |
| Activate with blank fields | Focus moves to the first field with an error |
| Student page: choose answers with arrow keys, submit with Enter | "Thank you!" is announced/focused |
| Present page | Full Screen works; Escape leaves full screen |

### Database verification (TODO.md Phase 14)

After running the workflow by hand (create a survey, add questions and choices, activate, submit as a student), check the rows in the Supabase **SQL Editor**:

```sql
-- 1. Find the survey
select id, title, status, created_at from surveys order by created_at desc limit 5;

-- 2. Count its rows (paste the id in both places)
select
  (select count(*) from questions where survey_id = 'PASTE-ID') as questions,
  (select count(*) from choices c join questions q on q.id = c.question_id
     where q.survey_id = 'PASTE-ID') as choices,
  (select count(*) from responses where survey_id = 'PASTE-ID') as responses,
  (select count(*) from answers a join responses r on r.id = a.response_id
     where r.survey_id = 'PASTE-ID') as answers;

-- 3. The same numbers the Results page shows
select get_survey_results('PASTE-ID');
```

Then refresh the app and confirm the survey and its results are still there.

### Real phone

After deployment (TODO.md Phase 15), scan a Present page QR code with a phone, answer, and confirm the count updates and the layout fits the screen.

---

## Results log

| Date | Suite | Result | Notes |
|---|---|---|---|
| 2026-11-05 | `npm test` | 38 passed | |
| 2026-11-05 | `npm run test:db` | 45 passed | |
| 2026-11-05 | `npm run test:e2e` | 53 passed, 12 skipped | Skipped = API checks, which run in chromium only. All 5 browser setups pass. |
| 2026-11-05 | Keyboard only | Passed | All 8 checks |
| 2026-11-05 | Database verification | Passed | Main project; counts match the Results page |
| | Real phone | | |
