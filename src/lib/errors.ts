// Turns Supabase and database errors into messages that are safe to show
// (API.md §13). Raw database errors are logged to the console, never shown.

const MESSAGES: Record<string, string> = {
  // Instructor actions (D18)
  SURVEY_NOT_FOUND: 'This survey no longer exists. Refresh the page.',
  SURVEY_INCOMPLETE: 'This survey is not ready to activate.',
  TITLE_REQUIRED: 'Enter a survey title.',
  SURVEY_NOT_EDITABLE: 'Only draft surveys can be edited. Duplicate it to make an editable copy.',
  INVALID_STATUS_CHANGE:
    "That action isn't allowed for this survey's current status. Refresh the page and try again.",
  // Student submissions (API.md §10, D15)
  SURVEY_NOT_ACTIVE: 'This survey is no longer accepting responses.',
  DUPLICATE_RESPONSE: 'You have already submitted a response to this survey.',
  INVALID_QUESTION: 'Something went wrong with this survey. Please reload the page.',
  INVALID_CHOICE: 'Something went wrong with this survey. Please reload the page.',
  MISSING_REQUIRED_ANSWER: 'Please answer every question.',
  MISSING_TOKEN: 'Something went wrong. Please reload the page and try again.',
}

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'
const AUTH_ERROR = 'Your session has expired. Please log in again.'
const UNEXPECTED_ERROR = 'Something went wrong. Please try again.'

/** An error with a message that is safe to show, plus the database code if there was one. */
export class AppError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface SupabaseLikeError {
  message?: string
  details?: string | null
  code?: string
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  console.error(error)

  const { message = '', details, code } = (error ?? {}) as SupabaseLikeError

  if (message in MESSAGES) {
    // SURVEY_INCOMPLETE carries the reason, e.g. "The survey has no questions."
    const text =
      message === 'SURVEY_INCOMPLETE' && details
        ? `${MESSAGES[message]} ${details}`
        : MESSAGES[message]
    return new AppError(text, message)
  }
  if (/failed to fetch|network/i.test(message)) return new AppError(NETWORK_ERROR)
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) {
    return new AppError(AUTH_ERROR)
  }
  return new AppError(UNEXPECTED_ERROR)
}
