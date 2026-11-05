import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

export const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
export const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const email = process.env.E2E_EMAIL ?? ''
const password = process.env.E2E_PASSWORD ?? ''

/** Every survey created by these tests starts with this, so cleanup can find them. */
export const TEST_PREFIX = 'E2E '

/** Reads a variable from .env without loading it, to compare projects. */
function mainProjectUrl(): string | null {
  try {
    const match = readFileSync('.env', 'utf8').match(/^VITE_SUPABASE_URL=(.*)$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

/**
 * Why the full workflow tests can't run, or null if they can. They change
 * data (and close any active survey), so they only run against a separate
 * test project configured in .env.test.
 */
export function workflowSkipReason(): string | null {
  if (!email || !password) {
    return 'Set E2E_EMAIL and E2E_PASSWORD in .env.test to run the workflow tests (see TESTING.md).'
  }
  if (supabaseUrl && supabaseUrl === mainProjectUrl()) {
    return '.env.test points at the same Supabase project as .env. Use a separate test project.'
  }
  return null
}

export async function logIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** Fails on serious or critical accessibility problems found by axe. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
  expect(serious, 'accessibility problems').toEqual([])
}

/** A Supabase client signed in as the test instructor, for setup and cleanup. */
async function instructorClient() {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Test login failed: ${error.message}`)
  return client
}

/** Creates a closed survey with one True/False question. Returns its ID. */
export async function seedClosedSurvey(title: string): Promise<string> {
  const client = await instructorClient()
  const { data: id, error } = await client.rpc('save_survey_draft', {
    p_survey_id: null,
    p_title: title,
    p_description: null,
    p_questions: [{ question_text: 'Seeded question', question_type: 'true_false' }],
  })
  if (error) throw error
  for (const fn of ['activate_survey', 'close_survey']) {
    const { error: statusError } = await client.rpc(fn, { p_survey_id: id })
    if (statusError) throw statusError
  }
  await client.auth.signOut()
  return id as string
}

/** Deletes every test survey (including "Copy of …" duplicates), closing active ones first. */
export async function deleteTestSurveys(): Promise<void> {
  const client = await instructorClient()

  const { data, error } = await client
    .from('surveys')
    .select('id, status')
    .like('title', `%${TEST_PREFIX}%`)
  if (error) throw error

  for (const survey of data) {
    if (survey.status === 'active') {
      const { error: closeError } = await client.rpc('close_survey', { p_survey_id: survey.id })
      if (closeError) throw closeError
    }
    const { error: deleteError } = await client.from('surveys').delete().eq('id', survey.id)
    if (deleteError) throw deleteError
  }
  await client.auth.signOut()
}
