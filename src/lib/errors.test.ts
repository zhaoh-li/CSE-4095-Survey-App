import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError, toAppError } from './errors'

describe('toAppError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // raw errors are logged
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps database error codes to friendly messages and keeps the code', () => {
    const error = toAppError({ message: 'DUPLICATE_RESPONSE', code: 'P0001' })
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('DUPLICATE_RESPONSE')
    expect(error.message).toBe('You have already submitted a response to this survey.')
  })

  it('adds the reason to SURVEY_INCOMPLETE', () => {
    const error = toAppError({
      message: 'SURVEY_INCOMPLETE',
      details: 'The survey has no questions.',
    })
    expect(error.message).toBe('This survey is not ready to activate. The survey has no questions.')
  })

  it('recognises network and expired-session errors', () => {
    expect(toAppError(new TypeError('Failed to fetch')).message).toMatch(/could not reach/i)
    expect(toAppError({ message: 'JWT expired', code: 'PGRST301' }).message).toMatch(
      /log in again/i,
    )
  })

  it('never shows raw database messages', () => {
    const error = toAppError({ message: 'duplicate key value violates unique constraint "x"' })
    expect(error.message).toBe('Something went wrong. Please try again.')
    expect(error.code).toBeUndefined()
    expect(toAppError(null).message).toBe('Something went wrong. Please try again.')
  })

  it('returns AppErrors unchanged', () => {
    const original = new AppError('Already friendly', 'X')
    expect(toAppError(original)).toBe(original)
  })
})
