// The full instructor and student workflow (TODO.md Phase 14). These tests
// create, activate, close and delete surveys, so they only run against the
// separate test project in .env.test (see TESTING.md).

import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  TEST_PREFIX,
  deleteTestSurveys,
  expectAccessible,
  logIn,
  seedClosedSurvey,
  workflowSkipReason,
} from './helpers'

const skipReason = workflowSkipReason()
test.skip(skipReason !== null, skipReason ?? '')

test.beforeAll(deleteTestSurveys) // leftovers from an interrupted run
test.afterAll(deleteTestSurveys)

const uniqueTitle = (testInfo: TestInfo, label: string) =>
  `${TEST_PREFIX}${label} ${testInfo.project.name} ${Date.now()}`

/** A separate browser (own storage and token) with the same screen size as the project. */
async function newStudent(browser: Browser, testInfo: TestInfo, url: string): Promise<Page> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  })
  const page = await context.newPage()
  await page.goto(url)
  return page
}

const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })
const submit = (page: Page) => page.getByRole('button', { name: 'Submit' }).click()

/** The results table row for a choice, as [choice, count, percent]. */
const resultRow = (page: Page, choice: string) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: choice, exact: true }) })
    .getByRole('cell')

test('full workflow: create, activate, answer, results, export, close, delete', async ({
  page,
  browser,
}, testInfo) => {
  const title = uniqueTitle(testInfo, 'Workflow')
  await logIn(page)
  await expectAccessible(page)

  // --- Create the survey -------------------------------------------------
  await page.getByRole('link', { name: 'New Survey' }).click()
  await expect(page).toHaveURL(/\/surveys\/new$/)
  await page.getByLabel('Survey Title').fill(title)
  await page.getByLabel('Description (optional)').fill('Created by an automated test')
  await page.getByLabel('Question text').fill('What is required for recursion?')
  await page.getByLabel('Question 1, Choice 1').fill('A base case')
  await page.getByLabel('Question 1, Choice 2').fill('A loop')
  await page.getByRole('button', { name: '+ Add Choice' }).click()
  await page.getByLabel('Question 1, Choice 3').fill('A pointer')

  await page.getByRole('button', { name: '+ Add Question' }).click()
  const secondQuestion = page.getByLabel('Question text').nth(1)
  await expect(secondQuestion).toBeFocused() // focus moves to the new question
  await secondQuestion.fill('Recursion needs a stopping condition.')
  await page.getByLabel('Type', { exact: true }).nth(1).selectOption('true_false')
  await expect(page.getByLabel('Question 2, Choice 1')).toHaveValue('True')
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/surveys\/[0-9a-f-]{36}\/edit$/)
  const surveyId = page.url().split('/surveys/')[1].split('/')[0]

  // --- Activate ----------------------------------------------------------
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  // If another survey is active in the test project, confirm closing it (D11).
  const confirm = page.getByRole('dialog', { name: 'Activate survey?' })
  await expect(page.getByRole('heading', { name: title }).or(confirm)).toBeVisible()
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: 'Activate' }).click()
  await expect(page).toHaveURL(new RegExp(`/surveys/${surveyId}/present$`))

  // --- Present page ------------------------------------------------------
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const qr = page.getByRole('img', { name: /^QR code for / })
  await expect(qr).toBeVisible()
  const slug = (await qr.getAttribute('alt'))!.split('/s/')[1]
  expect(slug).toMatch(/^[a-z0-9]{6}$/)
  await expect(page.getByRole('status')).toHaveText(/Responses:\s*0/)
  await expectAccessible(page)
  const studentUrl = `${new URL(page.url()).origin}/s/${slug}`

  // --- Student 1: required answers, submit, duplicate protection ---------
  const student1 = await newStudent(browser, testInfo, studentUrl)
  await expect(student1.getByRole('heading', { name: title })).toBeVisible()
  await expectAccessible(student1)

  await radio(student1, 'A base case').check()
  await submit(student1)
  await expect(student1.getByText('Please answer this question.')).toHaveCount(1)
  await expect(radio(student1, 'True')).toBeFocused() // jumps to the unanswered question

  await radio(student1, 'True').check()
  await submit(student1)
  const thanks = student1.getByRole('heading', { name: 'Thank you!' })
  await expect(thanks).toBeVisible()
  await expect(thanks).toBeFocused()

  const already = 'You have already submitted a response to this survey.'
  await student1.reload()
  await expect(student1.getByRole('heading', { name: already })).toBeVisible()

  // Forget the local note but keep the token: the database must still refuse (D7).
  await student1.evaluate(() => localStorage.removeItem('classroom-survey:submitted'))
  await student1.reload()
  await radio(student1, 'A loop').check()
  await radio(student1, 'False').check()
  await submit(student1)
  await expect(student1.getByRole('heading', { name: already })).toBeVisible()

  // --- Student 2 ---------------------------------------------------------
  const student2 = await newStudent(browser, testInfo, studentUrl)
  await radio(student2, 'A loop').check()
  await radio(student2, 'False').check()
  await submit(student2)
  await expect(student2.getByRole('heading', { name: 'Thank you!' })).toBeVisible()

  // The Present count refreshes every 5 seconds (D12).
  await expect(page.getByRole('status')).toHaveText(/Responses:\s*2/, { timeout: 15_000 })

  // --- Results -----------------------------------------------------------
  await page.getByRole('link', { name: 'View Results' }).click()
  await expect(page.getByText('2 responses', { exact: true })).toBeVisible()
  await expect(resultRow(page, 'A base case')).toHaveText(['A base case', '1', '50.0%'])
  await expect(resultRow(page, 'A loop')).toHaveText(['A loop', '1', '50.0%'])
  await expect(resultRow(page, 'A pointer')).toHaveText(['A pointer', '0', '0.0%'])
  await expect(resultRow(page, 'True')).toHaveText(['True', '1', '50.0%'])
  await expect(resultRow(page, 'False')).toHaveText(['False', '1', '50.0%'])
  await expect(page.getByRole('link', { name: 'Present QR' })).toBeVisible()
  await expectAccessible(page)

  // --- CSV export (D14, D26) ---------------------------------------------
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^e2e-workflow-.*_\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.startsWith('﻿')).toBe(true)
  const lines = csv.slice(1).trimEnd().split('\r\n')
  expect(lines[0]).toBe(
    'survey_title,response_id,submitted_at,' +
      'Q1: What is required for recursion?,Q2: Recursion needs a stopping condition.',
  )
  expect(lines.slice(1).map((line) => line.split(',').slice(3).join(','))).toEqual([
    'A base case,True',
    'A loop,False',
  ])

  // --- Close -------------------------------------------------------------
  await page.goto(`/surveys/${surveyId}/present`)
  await page.getByRole('button', { name: 'Close Survey' }).click()
  await page
    .getByRole('dialog', { name: /^Close / })
    .getByRole('button', { name: 'Close Survey' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/surveys/${surveyId}/results$`))
  await expect(page.getByText('Closed', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Present QR' })).toHaveCount(0)

  const closedMessage = 'This survey is no longer accepting responses.'
  const student3 = await newStudent(browser, testInfo, studentUrl)
  await expect(student3.getByRole('heading', { name: closedMessage })).toBeVisible()

  // --- Delete from the dashboard (stronger warning: it has responses) -----
  await page.goto('/dashboard')
  const card = page.getByRole('article').filter({ hasText: title })
  await card.getByRole('button', { name: 'Delete' }).click()
  const dialog = page.getByRole('dialog', { name: /^Delete / })
  await expect(dialog).toContainText('This survey has 2 responses.')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(card).toHaveCount(0)

  for (const student of [student1, student2, student3]) await student.context().close()
})

test('editor: field errors, type change, unsaved changes and logout', async ({
  page,
}, testInfo) => {
  await logIn(page)
  await page.goto('/surveys/new')

  // D10, D23: Activate shows errors next to the fields and focuses the first.
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  await expect(page.getByText('Enter a survey title.')).toBeVisible()
  await expect(page.getByLabel('Survey Title')).toBeFocused()
  await expect(page.getByText('Enter the question text.')).toBeVisible()
  await expect(page.getByText('Enter the choice text.')).toHaveCount(2)

  const title = uniqueTitle(testInfo, 'Editor')
  await page.getByLabel('Survey Title').fill(title)
  await page.getByLabel('Question 1, Choice 1').fill('Something')

  // D13: changing the type asks first when a choice has text.
  await page.getByLabel('Type', { exact: true }).selectOption('true_false')
  const typeDialog = page.getByRole('dialog', { name: 'Change question type?' })
  await typeDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('multiple_choice')
  await expect(page.getByLabel('Question 1, Choice 1')).toHaveValue('Something')

  await page.getByLabel('Type', { exact: true }).selectOption('true_false')
  await typeDialog.getByRole('button', { name: 'Change Type' }).click()
  await expect(page.getByLabel('Question 1, Choice 1')).toHaveValue('True')
  await expect(page.getByLabel('Question 1, Choice 1')).not.toBeEditable()

  // D22: leaving with unsaved changes asks first.
  const leaveDialog = page.getByRole('dialog', { name: 'Leave without saving?' })
  await page.getByRole('link', { name: 'Classroom Survey' }).click()
  await leaveDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/surveys\/new$/)

  // After saving, leaving doesn't ask.
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Classroom Survey' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // D27: Logout with unsaved changes asks first, then signs out.
  await page
    .getByRole('article')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Edit' })
    .click()
  await page.getByLabel('Description (optional)').fill('Unsaved change')
  await page.getByRole('button', { name: 'Logout' }).click()
  await leaveDialog.getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/) // really signed out
})

test('dashboard: search, archive, filters, unarchive and duplicate', async ({ page }, testInfo) => {
  const title = uniqueTitle(testInfo, 'Dashboard')
  await seedClosedSurvey(title)
  await logIn(page)

  await page.getByLabel('Search').fill(title)
  const card = page.getByRole('article').filter({ hasText: title })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Closed')

  // Archive hides it from "All (except archived)" (D21).
  await card.getByRole('button', { name: 'Archive' }).click()
  await page
    .getByRole('dialog', { name: /^Archive / })
    .getByRole('button', { name: 'Archive' })
    .click()
  await expect(card).toHaveCount(0)
  await expect(page.getByText('No surveys match your search.')).toBeVisible()

  await page.getByLabel('Status').selectOption('archived')
  await expect(card).toContainText('Archived')
  await card.getByRole('button', { name: 'Unarchive' }).click()
  await expect(card).toHaveCount(0) // now closed, so not in the Archived filter
  await page.getByLabel('Status').selectOption('closed')
  await expect(card).toContainText('Closed')

  // Date filter (D16): a range in the past hides it.
  await page.getByLabel('Created to').fill('2000-01-01')
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByLabel('Search').fill(title)
  await expect(card).toHaveCount(1)

  // Duplicate opens the editor with an editable copy (D19).
  await card.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page).toHaveURL(/\/surveys\/[0-9a-f-]{36}\/edit$/)
  await expect(page.getByLabel('Survey Title')).toHaveValue(`Copy of ${title}`)
  await expect(page.getByLabel('Question text')).toHaveValue('Seeded question')
})
