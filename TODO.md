# Classroom Survey Web App — TODO

## Purpose

This roadmap breaks the implementation into small, testable phases ordered from foundational work to advanced features.

---

# Phase 1 — Project Setup

- [x] Create a new React + TypeScript project with Vite.
- [x] Add Tailwind CSS.
- [x] Add React Router.
- [x] Add Supabase JavaScript client.
- [x] Add Recharts.
- [x] Add QR code generation package.
- [x] Create the initial project folder structure.
- [x] Add `.env.example` with Supabase environment variable names.
- [x] Configure ESLint and formatting.
- [x] Create a basic home page.
- [x] Verify the project builds successfully.

---

# Phase 2 — Supabase Project and Database

- [ ] Create a Supabase project.
- [ ] Create the `surveys` table.
- [ ] Create the `questions` table.
- [ ] Create the `choices` table.
- [ ] Create the `responses` table.
- [ ] Create the `answers` table.
- [ ] Add foreign-key constraints.
- [ ] Add database indexes.
- [ ] Add timestamps.
- [ ] Add survey-status validation.
- [ ] Create Row Level Security policies.
- [ ] Create the `get_public_survey(p_slug)` function (see DECISIONS.md, D2).
- [ ] Create the `submit_survey_response` function with all validation checks (D3, D5, D7, D15).
- [ ] Create the `activate_survey` and `close_survey` functions, with activation checks (D8, D10).
- [ ] Do not create anonymous read or insert policies; students use only the two public functions (D5).
- [ ] Disable public sign-ups in Supabase Auth (D6).
- [ ] Create the instructor account manually in the Supabase dashboard (D6).
- [ ] Verify students cannot read survey results.
- [ ] Verify students cannot insert directly into `responses` or `answers`.
- [ ] Verify anonymous students can load active surveys through `get_public_survey`.
- [ ] Verify `get_public_survey` returns only a status for closed surveys and nothing for unknown slugs.
- [ ] Verify anonymous students can submit responses through `submit_survey_response`.
- [ ] Verify authenticated instructors have full access.

---

# Phase 3 — Instructor Authentication

- [ ] Create the instructor login page.
- [ ] Connect login to Supabase Auth.
- [ ] Add logout.
- [ ] Create an authentication context/provider.
- [ ] Create a protected-route component.
- [ ] Redirect unauthenticated users to login.
- [ ] Show the logged-in instructor in the dashboard.

---

# Phase 4 — Instructor Dashboard

- [ ] Create the dashboard layout.
- [ ] Load surveys from Supabase.
- [ ] Display survey title, status, and creation date.
- [ ] Add status badges for Draft, Active, Closed, and Archived.
- [ ] Add a New Survey button.
- [ ] Add Edit action.
- [ ] Add Duplicate action.
- [ ] Add Delete action.
- [ ] Add Archive action.
- [ ] Add View Results action.
- [ ] Add Activate action.
- [ ] Add Close action.
- [ ] Add Unarchive action (D9).
- [ ] Show only the actions allowed for each status (D9).
- [ ] Confirm before activating when another survey is active (D11).
- [ ] Add search by survey title.
- [ ] Add filtering by status.
- [ ] Add From/To date filters on `created_at` (D16).

---

# Phase 5 — Survey Editor

- [ ] Create a survey editor page.
- [ ] Add survey title field.
- [ ] Add optional description field.
- [ ] Add questions dynamically.
- [ ] Support Multiple Choice questions.
- [ ] Support True / False questions.
- [ ] Auto-create read-only "True" and "False" choices for True/False questions (D13).
- [ ] Confirm before changing a question's type when it already has choices (D13).
- [ ] Block activation of incomplete surveys and show errors next to the fields (D10).
- [ ] Make the editor's Activate button save first, then activate and open the Present page (D17).
- [ ] Add answer choices dynamically.
- [ ] Reorder questions.
- [ ] Reorder choices.
- [ ] Delete questions.
- [ ] Delete choices.
- [ ] Validate required fields.
- [ ] Save a survey as Draft.
- [ ] Load an existing survey for editing.
- [ ] Allow editing only Draft surveys (see DECISIONS.md, D4).

---

# Phase 6 — Survey Activation

- [ ] Add activation logic.
- [ ] Ensure at most one survey is Active.
- [ ] Automatically close the previously active survey.
- [ ] Generate a public survey slug (see DECISIONS.md, D1).
- [ ] Generate the public survey URL.
- [ ] Generate a QR code from the public URL.
- [ ] Create a Present Survey page.
- [ ] Display survey title and QR code.
- [ ] Display a readable fallback URL.
- [ ] Add a Close Survey button.
- [ ] Add a Download QR Code button.
- [ ] Show the number of submitted responses on the Present page.
- [ ] Refresh the response count every 5 seconds while the Present page is open (D12).

---

# Phase 7 — Student Survey Page

- [ ] Create the public route `/s/:slug`.
- [ ] Load the survey through `get_public_survey`.
- [ ] Show an error if the survey does not exist.
- [ ] Show a message if the survey is closed.
- [ ] Render survey title and description.
- [ ] Render Multiple Choice questions.
- [ ] Render True / False questions.
- [ ] Require an answer to every question, in the frontend and in the submission function (see DECISIONS.md, D3).
- [ ] Add Submit button.
- [ ] Store response and answers in Supabase.
- [ ] Show a submission confirmation page.
- [ ] Make the entire experience mobile friendly.

---

# Phase 8 — Duplicate Submission Protection

- [ ] Generate an anonymous browser token.
- [ ] Store the token in local storage.
- [ ] Save the token with each response.
- [ ] Prevent the same token from submitting twice to the same survey.
- [ ] Show a friendly message if a duplicate submission is attempted.
- [ ] Add a database uniqueness constraint if appropriate.
- [ ] Reject submissions without a token in `submit_survey_response` with `MISSING_TOKEN` (D7, D15).

---

# Phase 9 — Results Dashboard

- [ ] Create a results page for each survey.
- [ ] Show total response count.
- [ ] Aggregate answers by question.
- [ ] Show counts for each choice.
- [ ] Show percentages for each choice.
- [ ] Add bar charts using Recharts.
- [ ] Clearly label questions with no responses yet.
- [ ] Add Refresh Results button.
- [ ] Add link back to the main dashboard.
- [ ] Show the Present QR action only for Active surveys.

---

# Phase 10 — Historical Results

- [ ] Allow viewing results for Closed surveys.
- [ ] Allow viewing results for Archived surveys.
- [ ] Add filtering by date (dashboard From/To filters, D16).
- [ ] Add filtering by survey title.
- [ ] Preserve all historical response data.

---

# Phase 11 — CSV Export

- [ ] Add Export CSV button.
- [ ] Export survey metadata.
- [ ] Export one row per response.
- [ ] Use the CSV columns, headers and file name from DECISIONS.md (D14).
- [ ] Include submission timestamp.
- [ ] Include each question and answer.
- [ ] Create safe CSV escaping.
- [ ] Test export with spreadsheet applications.

---

# Phase 12 — Survey Duplication

- [ ] Duplicate survey title and description.
- [ ] Duplicate questions.
- [ ] Duplicate answer choices.
- [ ] Create the copy in Draft state.
- [ ] Add "Copy of ..." naming.
- [ ] Redirect to the editor after duplication.

---

# Phase 13 — UI Polish

- [ ] Add consistent page layouts.
- [ ] Improve mobile responsiveness.
- [ ] Add loading states.
- [ ] Add empty states.
- [ ] Add error messages.
- [ ] Add confirmation dialogs for destructive actions.
- [ ] Improve QR-code presentation for classroom projection.
- [ ] Test accessibility and keyboard navigation.
- [ ] Improve color contrast.

---

# Phase 14 — Testing

- [ ] Test instructor login.
- [ ] Test survey creation.
- [ ] Test survey editing.
- [ ] Test activation.
- [ ] Test closing surveys.
- [ ] Test QR-code links.
- [ ] Test student submissions.
- [ ] Test duplicate-submission prevention.
- [ ] Test results calculations.
- [ ] Test CSV export.
- [ ] Test mobile layout.
- [ ] Test with at least two browsers.
- [ ] Test unauthorized access attempts.
- [ ] Test database Row Level Security.
- [ ] Run the full workflow locally: instructor creates a survey, adds questions and choices, activates it; student opens it and submits; responses are saved; instructor views results.

### Database Verification (inspect in the Supabase Table Editor or SQL Editor)

- [ ] Creating a survey stores a row in `surveys`.
- [ ] Adding questions and choices creates rows in `questions` and `choices`.
- [ ] Student submissions create rows in `responses` and `answers`.
- [ ] Survey results can be retrieved from the database and match the Results page.
- [ ] Data is still present after refreshing the application.

---

# Phase 15 — Deployment

- [ ] Push the project to GitHub.
- [ ] Create the Cloudflare Pages site.
- [ ] Connect Cloudflare Pages to the GitHub repository.
- [ ] Configure production environment variables.
- [ ] Deploy the application.
- [ ] Configure SPA routing.
- [ ] Verify production login.
- [ ] Verify QR codes point to the production URL.
- [ ] Test student submissions in production.
- [ ] Test instructor results in production.
- [ ] Run the full workflow again in production.

---

# Assignment Deliverables

- [ ] Commit the database schema/migration SQL to `supabase/`. It must implement DATABASE.md as modified by DECISIONS.md (no anonymous read/insert policies; include `get_public_survey`, `submit_survey_response`, `activate_survey`, `close_survey`).
- [ ] Write README.md with setup and deployment instructions.
- [x] Record design decisions in DECISIONS.md.
- [ ] Commit all five provided documents with their original file names (Classroom_Survey_Web_App_Specification.md, TODO.md, DATABASE.md, API.md, UI.md), plus DECISIONS.md.
- [x] Add `.env` to `.gitignore` before the first commit that includes environment files.
- [ ] Create a separate grader test account; submit its login privately through HuskyCT, not in the repo (D6).
- [ ] Confirm no secrets (service-role key, passwords) are committed.
- [ ] Take database screenshots: tables, a survey with questions, stored responses, results in the app. Use made-up test submissions only — no real student information.
- [ ] Write the 1–2 page development summary.
- [ ] Export the AI conversation history or write a Markdown summary.
- [ ] Test on a real mobile device.

---

# Phase 16 — Post-MVP Enhancements

- [ ] Add live updating results with Supabase Realtime.
- [ ] Add question bank.
- [ ] Add survey import/export as JSON.
- [ ] Add Markdown import.
- [ ] Add short-answer questions.
- [ ] Add checkbox questions.
- [ ] Add rating-scale questions.
- [ ] Add numeric questions.
- [ ] Add AI-assisted question generation.
- [ ] Add LMS integration.
- [ ] Add multiple instructors.
- [ ] Add course and semester organization.
- [ ] Add analytics across multiple surveys.
