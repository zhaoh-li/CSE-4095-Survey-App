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

describe('duplicate_survey (D19)', () => {
  test('copies the survey, questions and choices into a new draft', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Original')
    await instructor(`update surveys set description = 'Desc' where id = $1`, [survey.id])
    await activate(survey.id)
    await submit(survey.id, 'dup-1', [
      { question_id: mc.id, choice_id: mc.choices[0].id },
      { question_id: tf.id, choice_id: tf.choices[0].id },
    ])

    const [{ id }] = await instructor(`select duplicate_survey($1) as id`, [survey.id])
    const [copy] = await instructor(`select * from surveys where id = $1`, [id])
    assert.equal(copy.title, 'Copy of Original')
    assert.equal(copy.description, 'Desc')
    assert.equal(copy.status, 'draft')
    assert.equal(copy.public_slug, null)

    const structure = async (surveyId) =>
      instructor(
        `select q.question_text, q.question_type, q.position, c.choice_text, c.position as cpos
         from questions q join choices c on c.question_id = q.id
         where q.survey_id = $1 order by q.position, c.position`,
        [surveyId],
      )
    assert.deepEqual(await structure(id), await structure(survey.id))

    const [{ count }] = await instructor(
      `select count(*)::int as count from responses where survey_id = $1`,
      [id],
    )
    assert.equal(count, 0)
    await close(survey.id)
  })

  test('the copy is editable even when the original is not', async () => {
    const { survey } = await createCompleteSurvey('Locked original')
    await activate(survey.id)
    const [{ id }] = await instructor(`select duplicate_survey($1) as id`, [survey.id])
    await instructor(`update surveys set title = 'Edited copy' where id = $1`, [id])
    await close(survey.id)
  })

  test('students cannot duplicate surveys', async () => {
    const survey = await createSurvey('No student copies')
    await rejects(anon(`select duplicate_survey($1)`, [survey.id]), 'permission denied')
  })

  test('an unknown survey ID is rejected', async () => {
    await rejects(instructor(`select duplicate_survey(gen_random_uuid())`), 'SURVEY_NOT_FOUND')
  })
})

const saveDraft = async (id, title, description, questions) =>
  (
    await instructor(`select save_survey_draft($1, $2, $3, $4) as id`, [
      id,
      title,
      description,
      JSON.stringify(questions),
    ])
  )[0].id

const draftStructure = (surveyId) =>
  instructor(
    `select q.question_text, q.question_type, q.position, c.choice_text, c.position as choice_position
     from questions q join choices c on c.question_id = q.id
     where q.survey_id = $1 order by q.position, c.position`,
    [surveyId],
  )

describe('save_survey_draft (D22, D23)', () => {
  const questions = [
    {
      question_text: '  What is required for recursion? ',
      question_type: 'multiple_choice',
      choices: [{ choice_text: 'A base case' }, { choice_text: ' A loop ' }],
    },
    { question_text: 'Recursion needs a stopping condition.', question_type: 'true_false' },
  ]

  test('creates a new draft with questions and choices in order', async () => {
    const id = await saveDraft(null, ' New survey ', '', questions)
    const [survey] = await instructor(`select * from surveys where id = $1`, [id])
    assert.equal(survey.title, 'New survey')
    assert.equal(survey.description, null)
    assert.equal(survey.status, 'draft')

    assert.deepEqual(
      (await draftStructure(id)).map((r) => [r.position, r.choice_position, r.choice_text]),
      [
        [1, 1, 'A base case'],
        [1, 2, 'A loop'],
        [2, 1, 'True'],
        [2, 2, 'False'],
      ],
    )
    const [first] = await draftStructure(id)
    assert.equal(first.question_text, 'What is required for recursion?')
  })

  test('True/False questions always get exactly True and False', async () => {
    const id = await saveDraft(null, 'TF', null, [
      {
        question_text: 'Is it?',
        question_type: 'true_false',
        choices: [{ choice_text: 'Yes' }, { choice_text: 'No' }, { choice_text: 'Maybe' }],
      },
    ])
    assert.deepEqual(
      (await draftStructure(id)).map((r) => r.choice_text),
      ['True', 'False'],
    )
  })

  test('saving again replaces the questions and updates the title', async () => {
    const id = await saveDraft(null, 'Before', 'Old', questions)
    await saveDraft(id, 'After', 'New', [
      { question_text: 'Only question', question_type: 'true_false' },
    ])
    const [survey] = await instructor(`select * from surveys where id = $1`, [id])
    assert.equal(survey.title, 'After')
    assert.equal(survey.description, 'New')
    assert.deepEqual(
      (await draftStructure(id)).map((r) => [r.question_text, r.choice_text]),
      [
        ['Only question', 'True'],
        ['Only question', 'False'],
      ],
    )
  })

  test('a draft may be incomplete but needs a title', async () => {
    const id = await saveDraft(null, 'Incomplete', null, [
      { question_text: '', question_type: 'multiple_choice', choices: [] },
    ])
    await rejects(activate(id), 'SURVEY_INCOMPLETE')
    await rejects(saveDraft(null, '   ', null, []), 'TITLE_REQUIRED')
  })

  test('a saved complete draft can be activated', async () => {
    const id = await saveDraft(null, 'Ready', null, questions)
    const result = await activate(id)
    assert.equal(result.status, 'active')
    await close(id)
  })

  test('only drafts can be saved', async () => {
    const { survey } = await createCompleteSurvey('Not a draft')
    await activate(survey.id)
    await close(survey.id)
    await rejects(saveDraft(survey.id, 'x', null, []), 'SURVEY_NOT_EDITABLE')
    await rejects(
      saveDraft('00000000-0000-0000-0000-000000000000', 'x', null, []),
      'SURVEY_NOT_FOUND',
    )
  })

  test('students cannot save surveys', async () => {
    await rejects(
      anon(`select save_survey_draft(null, 'x', null, '[]'::jsonb)`),
      'permission denied',
    )
  })
})

describe('get_survey_results (D24)', () => {
  test('returns counts and percentages per choice', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('Results RPC')
    await activate(survey.id)
    for (const [i, pick] of [0, 0, 1].entries()) {
      await submit(survey.id, `rpc-${i}`, [
        { question_id: mc.id, choice_id: mc.choices[pick].id },
        { question_id: tf.id, choice_id: tf.choices[0].id },
      ])
    }

    const [{ r }] = await instructor(`select get_survey_results($1) as r`, [survey.id])
    assert.equal(r.title, 'Results RPC')
    assert.equal(r.status, 'active')
    assert.equal(r.response_count, 3)
    assert.deepEqual(
      r.questions.map((q) => q.response_count),
      [3, 3],
    )
    assert.deepEqual(
      r.questions[0].choices.map((c) => [c.choice_text, c.count, c.percentage]),
      [
        ['A base case', 2, 66.7],
        ['A pointer', 1, 33.3],
        ['A loop', 0, 0],
      ],
    )
    assert.deepEqual(
      r.questions[1].choices.map((c) => [c.choice_text, c.count, c.percentage]),
      [
        ['True', 3, 100],
        ['False', 0, 0],
      ],
    )
    await close(survey.id)
  })

  test('a survey with no responses has zero counts', async () => {
    const { survey } = await createCompleteSurvey('No results')
    const [{ r }] = await instructor(`select get_survey_results($1) as r`, [survey.id])
    assert.equal(r.response_count, 0)
    assert.ok(r.questions.every((q) => q.response_count === 0))
    assert.ok(r.questions.flatMap((q) => q.choices).every((c) => c.percentage === 0))
  })

  test('students cannot read results', async () => {
    const survey = await createSurvey('Private results')
    await rejects(anon(`select get_survey_results($1)`, [survey.id]), 'permission denied')
  })

  test('an unknown survey ID is rejected', async () => {
    await rejects(instructor(`select get_survey_results(gen_random_uuid())`), 'SURVEY_NOT_FOUND')
  })
})

describe('historical results (Phase 10)', () => {
  test('archiving and unarchiving keep responses and results unchanged', async () => {
    const { survey, mc, tf } = await createCompleteSurvey('History')
    await activate(survey.id)
    for (const [i, pick] of [0, 1, 1].entries()) {
      await submit(survey.id, `history-${i}`, [
        { question_id: mc.id, choice_id: mc.choices[pick].id },
        { question_id: tf.id, choice_id: tf.choices[1].id },
      ])
    }
    await close(survey.id)

    const results = async () =>
      (await instructor(`select get_survey_results($1) as r`, [survey.id]))[0].r
    const { status: _closed, ...before } = await results()

    await instructor(`update surveys set status = 'archived' where id = $1`, [survey.id])
    const archived = await results()
    assert.equal(archived.status, 'archived')
    const { status: _archived, ...whileArchived } = archived
    assert.deepEqual(whileArchived, before)

    await instructor(`update surveys set status = 'closed' where id = $1`, [survey.id])
    const { status: _unarchived, ...after } = await results()
    assert.deepEqual(after, before)
    assert.equal(before.response_count, 3)
  })
})
