import { describe, expect, it } from 'vitest'
import { buildSurveyCsv, csvFileName, escapeCsvValue, toCsv } from './csv'
import { toLocalDateTimeString } from './dates'

describe('escapeCsvValue', () => {
  it('leaves plain values unchanged', () => {
    expect(escapeCsvValue('A base case')).toBe('A base case')
    expect(escapeCsvValue('')).toBe('')
  })

  it('quotes values with commas, quotes or line breaks', () => {
    expect(escapeCsvValue('A, B')).toBe('"A, B"')
    expect(escapeCsvValue('Say "hi"')).toBe('"Say ""hi"""')
    expect(escapeCsvValue('Line one\nline two')).toBe('"Line one\nline two"')
    expect(escapeCsvValue('Line one\r\nline two')).toBe('"Line one\r\nline two"')
  })

  it('quotes values with spaces at either end, so they are kept', () => {
    expect(escapeCsvValue(' padded ')).toBe('" padded "')
  })

  it('keeps accents and emoji as they are', () => {
    expect(escapeCsvValue('Café ☕')).toBe('Café ☕')
  })
})

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF, ending with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['c, d', 'e'],
      ]),
    ).toBe('a,b\r\n"c, d",e\r\n')
  })
})

describe('buildSurveyCsv', () => {
  const questions = [
    { id: 'q2', question_text: 'Second, with comma', position: 2 },
    { id: 'q1', question_text: 'First', position: 1 },
  ]
  const passThrough = (iso: string) => iso

  it('has the D14 header with numbered questions in position order', () => {
    const csv = buildSurveyCsv('Quiz', questions, [], passThrough)
    expect(csv).toBe('survey_title,response_id,submitted_at,Q1: First,"Q2: Second, with comma"\r\n')
  })

  it('writes one row per response, matching answers to the right column', () => {
    const csv = buildSurveyCsv(
      'Quiz "One"',
      questions,
      [
        {
          id: 'r1',
          submitted_at: 't1',
          // Answers arrive in any order; they must land under their own question.
          answers: [
            { question_id: 'q2', choice_text: 'False' },
            { question_id: 'q1', choice_text: 'A, B' },
          ],
        },
        { id: 'r2', submitted_at: 't2', answers: [{ question_id: 'q1', choice_text: 'C' }] },
      ],
      passThrough,
    )
    const [, row1, row2] = csv.split('\r\n')
    expect(row1).toBe('"Quiz ""One""",r1,t1,"A, B",False')
    expect(row2).toBe('"Quiz ""One""",r2,t2,C,') // unanswered → empty cell
  })

  it('leaves the cell empty when a choice no longer exists', () => {
    const csv = buildSurveyCsv(
      'Quiz',
      [{ id: 'q1', question_text: 'First', position: 1 }],
      [{ id: 'r1', submitted_at: 't1', answers: [{ question_id: 'q1', choice_text: null }] }],
      passThrough,
    )
    expect(csv.split('\r\n')[1]).toBe('Quiz,r1,t1,')
  })

  it('formats timestamps with the given formatter', () => {
    const csv = buildSurveyCsv(
      'Quiz',
      [],
      [{ id: 'r1', submitted_at: 'raw', answers: [] }],
      (iso) => iso.toUpperCase(),
    )
    expect(csv.split('\r\n')[1]).toBe('Quiz,r1,RAW')
  })
})

describe('csvFileName', () => {
  it('uses a file-safe title and the export date', () => {
    expect(csvFileName('Recursion Check!', new Date(2026, 10, 2, 9, 30))).toBe(
      'recursion-check_2026-11-02.csv',
    )
    expect(csvFileName('Café Quiz #2', new Date(2026, 0, 5))).toBe('cafe-quiz-2_2026-01-05.csv')
    expect(csvFileName('???', new Date(2026, 0, 5))).toBe('survey_2026-01-05.csv')
  })
})

describe('toLocalDateTimeString', () => {
  it('formats as local "YYYY-MM-DD HH:MM:SS"', () => {
    const iso = new Date(2026, 10, 2, 9, 5, 7).toISOString()
    expect(toLocalDateTimeString(iso)).toBe('2026-11-02 09:05:07')
  })
})
