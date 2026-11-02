// Database tests for the Supabase migration.
//
// Runs the migration in PGlite (Postgres compiled to WebAssembly) and checks
// the rules from DATABASE.md and DECISIONS.md as an anonymous student and as
// a signed-in instructor. Run with: npm run test:db

import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'

const migrationsDir = new URL('../migrations/', import.meta.url)

let db

// Recreate the parts of a fresh Supabase project the migration relies on:
// the `anon` and `authenticated` roles and Supabase's default grants.
const supabaseSetup = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`

/** Run a query as `anon` or `authenticated` and return its rows. */
async function as(role, sql, params = []) {
  await db.exec(`set role ${role}`)
  try {
    const result = await db.query(sql, params)
    return result.rows
  } finally {
    await db.exec('reset role')
  }
}

const anon = (sql, params) => as('anon', sql, params)
const instructor = (sql, params) => as('authenticated', sql, params)

/** Assert that a query fails with a message containing `expected`. */
async function rejects(promise, expected) {
  await assert.rejects(promise, (error) => {
    assert.match(error.message, new RegExp(expected))
    return true
  })
}

async function createSurvey(title = 'Recursion Check') {
  const [survey] = await instructor(`insert into surveys (title) values ($1) returning *`, [title])
  return survey
}

async function addQuestion(surveyId, text, type, position, choices) {
  const [question] = await instructor(
    `insert into questions (survey_id, question_text, question_type, position)
     values ($1, $2, $3, $4) returning *`,
    [surveyId, text, type, position],
  )
  const created = []
  for (const [i, choiceText] of choices.entries()) {
    const [choice] = await instructor(
      `insert into choices (question_id, choice_text, position) values ($1, $2, $3) returning *`,
      [question.id, choiceText, i + 1],
    )
    created.push(choice)
  }
  return { ...question, choices: created }
}

/** A complete survey: one multiple-choice and one True/False question. */
async function createCompleteSurvey(title) {
  const survey = await createSurvey(title)
  const mc = await addQuestion(survey.id, 'What is required for recursion?', 'multiple_choice', 1, [
    'A base case',
    'A pointer',
    'A loop',
  ])
  const tf = await addQuestion(
    survey.id,
    'Recursion needs a stopping condition.',
    'true_false',
    2,
    ['True', 'False'],
  )
  return { survey, mc, tf }
}

const activate = async (id) => (await instructor(`select activate_survey($1) as r`, [id]))[0].r
const close = async (id) => (await instructor(`select close_survey($1) as r`, [id]))[0].r
const getPublic = async (slug) => (await anon(`select get_public_survey($1) as r`, [slug]))[0].r
const submit = async (surveyId, token, answers) =>
  (
    await anon(`select submit_survey_response($1, $2, $3) as r`, [
      surveyId,
      token,
      JSON.stringify(answers),
    ])
  )[0].r

before(async () => {
  db = new PGlite()
  await db.exec(supabaseSetup)
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(new URL(file, migrationsDir), 'utf8'))
  }
})

after(async () => {
  await db.close()
})

describe('student access (D5)', () => {
  test('students cannot read any table', async () => {
    for (const table of ['surveys', 'questions', 'choices', 'responses', 'answers']) {
      await rejects(anon(`select * from ${table}`), 'permission denied')
    }
  })

  test('students cannot insert directly into responses or answers', async () => {
    const { survey } = await createCompleteSurvey('Direct insert check')
    await rejects(
      anon(`insert into responses (survey_id, anonymous_token) values ($1, 'x')`, [survey.id]),
      'permission denied',
    )
    await rejects(
      anon(
        `insert into answers (response_id, question_id) values (gen_random_uuid(), gen_random_uuid())`,
      ),
      'permission denied',
    )
  })

  test('students cannot call instructor functions', async () => {
    const { survey } = await createCompleteSurvey('Function permission check')
    await rejects(anon(`select activate_survey($1)`, [survey.id]), 'permission denied')
    await rejects(anon(`select close_survey($1)`, [survey.id]), 'permission denied')
  })
})

describe('activation (D1, D8, D10)', () => {
  test('a survey with no questions cannot be activated', async () => {
    const survey = await createSurvey('Empty')
    await rejects(activate(survey.id), 'SURVEY_INCOMPLETE')
  })

  test('a multiple-choice question needs at least 2 choices', async () => {
    const survey = await createSurvey('One choice')
    await addQuestion(survey.id, 'Pick one', 'multiple_choice', 1, ['Only option'])
    await rejects(activate(survey.id), 'SURVEY_INCOMPLETE')
  })

  test('blank question or choice text blocks activation', async () => {
    const blankQuestion = await createSurvey('Blank question')
    await addQuestion(blankQuestion.id, '   ', 'multiple_choice', 1, ['A', 'B'])
    await rejects(activate(blankQuestion.id), 'SURVEY_INCOMPLETE')

    const blankChoice = await createSurvey('Blank choice')
    await addQuestion(blankChoice.id, 'Pick one', 'multiple_choice', 1, ['A', ' '])
    await rejects(activate(blankChoice.id), 'SURVEY_INCOMPLETE')
  })

  test('a True/False question needs exactly True and False', async () => {
    const survey = await createSurvey('Bad true/false')
    await addQuestion(survey.id, 'Is it?', 'true_false', 1, ['Yes', 'No'])
    await rejects(activate(survey.id), 'SURVEY_INCOMPLETE')
  })

  test('activation creates a short readable slug', async () => {
    const { survey } = await createCompleteSurvey('Slug check')
    const result = await activate(survey.id)
    assert.equal(result.status, 'active')
    assert.match(result.public_slug, /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/)
    await close(survey.id)
  })

  test('activating a survey closes the one that was active', async () => {
    const first = await createCompleteSurvey('First')
    const second = await createCompleteSurvey('Second')
    await activate(first.survey.id)
    await activate(second.survey.id)

    const active = await instructor(`select id from surveys where status = 'active'`)
    assert.deepEqual(
      active.map((row) => row.id),
      [second.survey.id],
    )
    const [firstRow] = await instructor(`select status from surveys where id = $1`, [
      first.survey.id,
    ])
    assert.equal(firstRow.status, 'closed')
    await close(second.survey.id)
  })

  test('surveys cannot be made active without activate_survey', async () => {
    const { survey } = await createCompleteSurvey('Direct activate')
    await rejects(
      instructor(`update surveys set status = 'active', public_slug = 'abcdef' where id = $1`, [
        survey.id,
      ]),
      'INVALID_STATUS_CHANGE',
    )
    await rejects(
      instructor(
        `insert into surveys (title, status, public_slug) values ('x', 'active', 'zzzzzz')`,
      ),
      'INVALID_STATUS_CHANGE',
    )
  })

  test('the slug cannot be changed after activation', async () => {
    const { survey } = await createCompleteSurvey('Slug change')
    await activate(survey.id)
    await close(survey.id)
    await rejects(
      instructor(`update surveys set public_slug = 'hacked' where id = $1`, [survey.id]),
      'INVALID_STATUS_CHANGE',
    )
  })
})

describe('get_public_survey (D2)', () => {
  test('returns the active survey with questions and choices in order', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Public load')
    const { public_slug } = await activate(survey.id)

    const result = await getPublic(public_slug)
    assert.equal(result.status, 'active')
    assert.deepEqual(result.survey, {
      id: survey.id,
      title: 'Public load',
      description: null,
    })
    assert.deepEqual(
      result.questions.map((q) => q.id),
      [mc.id, tf.id],
    )
    assert.deepEqual(
      result.questions[0].choices.map((c) => c.choice_text),
      ['A base case', 'A pointer', 'A loop'],
    )
    assert.deepEqual(
      result.questions[1].choices.map((c) => c.choice_text),
      ['True', 'False'],
    )
    assert.equal(JSON.stringify(result).includes('response'), false)
    await close(survey.id)
  })

  test('returns only a status for closed and archived surveys', async () => {
    const { survey } = await createCompleteSurvey('Closed load')
    const { public_slug } = await activate(survey.id)
    await close(survey.id)
    assert.deepEqual(await getPublic(public_slug), { status: 'closed' })

    await instructor(`update surveys set status = 'archived' where id = $1`, [survey.id])
    assert.deepEqual(await getPublic(public_slug), { status: 'closed' })
  })

  test('returns null for unknown slugs', async () => {
    assert.equal(await getPublic('nope99'), null)
  })
})

describe('submit_survey_response (D3, D7, D15)', () => {
  let survey, mc, tf, valid

  before(async () => {
    ;({ survey, mc, tf } = await createCompleteSurvey('Submission'))
    await activate(survey.id)
    valid = [
      { question_id: mc.id, choice_id: mc.choices[0].id },
      { question_id: tf.id, choice_id: tf.choices[0].id },
    ]
  })

  after(async () => {
    await close(survey.id)
  })

  test('rejects a missing or empty token', async () => {
    await rejects(submit(survey.id, null, valid), 'MISSING_TOKEN')
    await rejects(submit(survey.id, '  ', valid), 'MISSING_TOKEN')
  })

  test('rejects unanswered questions', async () => {
    await rejects(submit(survey.id, 't-missing', [valid[0]]), 'MISSING_REQUIRED_ANSWER')
    await rejects(
      submit(survey.id, 't-null-choice', [valid[0], { question_id: tf.id, choice_id: null }]),
      'MISSING_REQUIRED_ANSWER',
    )
  })

  test('rejects questions from another survey, malformed IDs and repeats', async () => {
    const other = await createCompleteSurvey('Other')
    await rejects(
      submit(survey.id, 't-other', [
        valid[0],
        { question_id: other.tf.id, choice_id: other.tf.choices[0].id },
      ]),
      'INVALID_QUESTION',
    )
    await rejects(
      submit(survey.id, 't-bad', [valid[0], { question_id: 'not-a-uuid', choice_id: 'x' }]),
      'INVALID_QUESTION',
    )
    await rejects(submit(survey.id, 't-repeat', [valid[0], valid[0]]), 'INVALID_QUESTION')
  })

  test('rejects a choice that belongs to a different question', async () => {
    await rejects(
      submit(survey.id, 't-wrong-choice', [
        valid[0],
        { question_id: tf.id, choice_id: mc.choices[1].id },
      ]),
      'INVALID_CHOICE',
    )
  })

  test('stores a valid submission and rejects a repeat from the same token', async () => {
    const result = await submit(survey.id, 'browser-1', valid)
    assert.equal(result.success, true)

    const answers = await instructor(`select * from answers where response_id = $1`, [
      result.response_id,
    ])
    assert.equal(answers.length, 2)

    await rejects(submit(survey.id, 'browser-1', valid), 'DUPLICATE_RESPONSE')
  })

  test('failed submissions store nothing', async () => {
    const rows = await instructor(`select anonymous_token from responses where survey_id = $1`, [
      survey.id,
    ])
    assert.deepEqual(
      rows.map((r) => r.anonymous_token),
      ['browser-1'],
    )
  })

  test('students cannot read the stored responses', async () => {
    await rejects(anon(`select count(*) from responses`), 'permission denied')
  })

  test('submissions fail once the survey is closed', async () => {
    const closed = await createCompleteSurvey('Closed submit')
    await activate(closed.survey.id)
    await close(closed.survey.id)
    await rejects(
      submit(closed.survey.id, 'late', [
        { question_id: closed.mc.id, choice_id: closed.mc.choices[0].id },
        { question_id: closed.tf.id, choice_id: closed.tf.choices[0].id },
      ]),
      'SURVEY_NOT_ACTIVE',
    )
    // Re-activate the main survey for any later tests in this group.
    await activate(survey.id)
  })
})

describe('status and editing rules (D4, D9)', () => {
  test('only draft surveys can be edited', async () => {
    const { survey, mc } = await createCompleteSurvey('Editing')
    await instructor(`update surveys set title = 'Renamed draft' where id = $1`, [survey.id])
    await activate(survey.id)

    await rejects(
      instructor(`update surveys set title = 'x' where id = $1`, [survey.id]),
      'SURVEY_NOT_EDITABLE',
    )
    await rejects(
      instructor(
        `insert into questions (survey_id, question_text, question_type, position)
         values ($1, 'New', 'multiple_choice', 3)`,
        [survey.id],
      ),
      'SURVEY_NOT_EDITABLE',
    )
    await rejects(
      instructor(`update questions set question_text = 'x' where id = $1`, [mc.id]),
      'SURVEY_NOT_EDITABLE',
    )
    await rejects(
      instructor(`delete from choices where id = $1`, [mc.choices[0].id]),
      'SURVEY_NOT_EDITABLE',
    )
    await close(survey.id)
  })

  test('allowed status changes follow D9', async () => {
    const draft = await createSurvey('Status rules')
    await rejects(
      instructor(`update surveys set status = 'archived' where id = $1`, [draft.id]),
      'INVALID_STATUS_CHANGE',
    )
    await rejects(
      instructor(`update surveys set status = 'closed' where id = $1`, [draft.id]),
      'INVALID_STATUS_CHANGE',
    )

    const { survey } = await createCompleteSurvey('Lifecycle')
    await activate(survey.id)
    await rejects(
      instructor(`update surveys set status = 'archived' where id = $1`, [survey.id]),
      'INVALID_STATUS_CHANGE',
    )
    await rejects(
      instructor(`delete from surveys where id = $1`, [survey.id]),
      'INVALID_STATUS_CHANGE',
    )

    await close(survey.id)
    await instructor(`update surveys set status = 'archived' where id = $1`, [survey.id])
    await rejects(
      instructor(`update surveys set status = 'draft' where id = $1`, [survey.id]),
      'INVALID_STATUS_CHANGE',
    )
    await rejects(activate(survey.id), 'INVALID_STATUS_CHANGE')
    await instructor(`update surveys set status = 'closed' where id = $1`, [survey.id])
  })

  test('reopening a closed survey keeps its slug and responses', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Reopen')
    const { public_slug } = await activate(survey.id)
    const answers = [
      { question_id: mc.id, choice_id: mc.choices[0].id },
      { question_id: tf.id, choice_id: tf.choices[1].id },
    ]
    await submit(survey.id, 'before-close', answers)
    await close(survey.id)

    const reopened = await activate(survey.id)
    assert.equal(reopened.public_slug, public_slug)
    await submit(survey.id, 'after-reopen', answers)

    const [{ count }] = await instructor(
      `select count(*)::int as count from responses where survey_id = $1`,
      [survey.id],
    )
    assert.equal(count, 2)
    await close(survey.id)
  })

  test('updated_at changes when a survey is updated', async () => {
    const survey = await createSurvey('Timestamps')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const [updated] = await instructor(
      `update surveys set description = 'New' where id = $1 returning updated_at`,
      [survey.id],
    )
    assert.ok(updated.updated_at > survey.updated_at)
  })
})

describe('results and deletion (DATABASE.md §12, §13)', () => {
  test('the results query counts answers per choice', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Results')
    await activate(survey.id)
    const picks = [0, 0, 1]
    for (const [i, pick] of picks.entries()) {
      await submit(survey.id, `results-${i}`, [
        { question_id: mc.id, choice_id: mc.choices[pick].id },
        { question_id: tf.id, choice_id: tf.choices[0].id },
      ])
    }
    await close(survey.id)

    const rows = await instructor(
      `select q.id as question_id, c.choice_text, count(a.id)::int as answer_count
       from questions q
       join choices c on c.question_id = q.id
       left join answers a on a.choice_id = c.id
       where q.survey_id = $1
       group by q.id, q.question_text, c.id, c.choice_text, c.position, q.position
       order by q.position, c.position`,
      [survey.id],
    )
    assert.deepEqual(
      rows.map((r) => [r.choice_text, r.answer_count]),
      [
        ['A base case', 2],
        ['A pointer', 1],
        ['A loop', 0],
        ['True', 3],
        ['False', 0],
      ],
    )
  })

  test('deleting a closed survey removes its questions, choices, responses and answers', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Delete me')
    await activate(survey.id)
    await submit(survey.id, 'delete-1', [
      { question_id: mc.id, choice_id: mc.choices[0].id },
      { question_id: tf.id, choice_id: tf.choices[0].id },
    ])
    await close(survey.id)

    await instructor(`delete from surveys where id = $1`, [survey.id])

    const [counts] = await instructor(
      `select
         (select count(*)::int from questions where survey_id = $1) as questions,
         (select count(*)::int from choices where question_id = any($2::uuid[])) as choices,
         (select count(*)::int from responses where survey_id = $1) as responses,
         (select count(*)::int from answers where question_id = any($2::uuid[])) as answers`,
      [survey.id, [mc.id, tf.id]],
    )
    assert.deepEqual(counts, { questions: 0, choices: 0, responses: 0, answers: 0 })
  })

  test('draft questions can be deleted along with their choices', async () => {
    const survey = await createSurvey('Draft delete')
    const question = await addQuestion(survey.id, 'Temp', 'multiple_choice', 1, ['A', 'B'])
    await instructor(`delete from questions where id = $1`, [question.id])
    const rows = await instructor(`select * from choices where question_id = $1`, [question.id])
    assert.equal(rows.length, 0)
  })
})
