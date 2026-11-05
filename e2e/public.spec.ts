// Tests that never change data, so they can run against any project.

import { expect } from '@playwright/test'
import { expectAccessible, supabaseKey, supabaseUrl, test } from './helpers'

test.describe('public pages', () => {
  test('landing page links to the instructor login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Classroom Survey')
    await page.getByRole('link', { name: 'Instructor Login' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Instructor Login' })).toBeVisible()
    await expectAccessible(page)
  })

  test('an unknown survey link shows "Survey not found."', async ({ page }) => {
    await page.goto('/s/nope00')
    await expect(page.getByRole('heading', { name: 'Survey not found.' })).toBeVisible()
    await expectAccessible(page)
  })

  test('an unknown page shows "Page not found."', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible()
  })
})

test.describe('unauthorized access', () => {
  for (const path of [
    '/dashboard',
    '/surveys/new',
    '/surveys/123/results',
    '/surveys/123/present',
  ]) {
    test(`signed-out visitors are sent from ${path} to login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  // Direct API calls with the public key, as a student (or anyone) could make.
  // They don't use a browser, so they run once instead of once per browser.
  test.beforeEach(({ request: _request }, testInfo) => {
    const isApiTest = testInfo.title.startsWith('the public key')
    test.skip(isApiTest && testInfo.project.name !== 'chromium', 'API checks run in chromium only')
  })

  const headers = () => ({
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  })

  test('the public key cannot read any table', async ({ request }) => {
    for (const table of ['surveys', 'questions', 'choices', 'responses', 'answers']) {
      const response = await request.get(`${supabaseUrl}/rest/v1/${table}?select=*`, {
        headers: headers(),
      })
      expect(response.ok(), `${table} should be refused`).toBe(false)
      expect(await response.text()).toContain('permission denied')
    }
  })

  test('the public key cannot insert responses directly', async ({ request }) => {
    const response = await request.post(`${supabaseUrl}/rest/v1/responses`, {
      headers: headers(),
      data: { survey_id: '00000000-0000-0000-0000-000000000000', anonymous_token: 'x' },
    })
    expect(response.ok()).toBe(false)
    expect(await response.text()).toContain('permission denied')
  })

  test('the public key cannot call instructor functions', async ({ request }) => {
    for (const fn of [
      'activate_survey',
      'close_survey',
      'duplicate_survey',
      'get_survey_results',
    ]) {
      const response = await request.post(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        headers: headers(),
        data: { p_survey_id: '00000000-0000-0000-0000-000000000000' },
      })
      expect(response.ok(), `${fn} should be refused`).toBe(false)
      expect(await response.text()).toContain('permission denied')
    }
  })
})
