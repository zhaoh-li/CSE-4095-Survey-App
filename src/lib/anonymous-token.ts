// The per-browser token used to stop accidental repeat submissions (D7, D25).

const TOKEN_KEY = 'classroom-survey:token'
const SUBMITTED_KEY = 'classroom-survey:submitted'

// Used when localStorage is blocked (some private browsing modes).
let memoryToken: string | null = null

/**
 * A random UUID. `crypto.randomUUID` only exists on https or localhost, so on
 * plain http (e.g. testing from a phone over Wi-Fi) build one from
 * `crypto.getRandomValues`, which works everywhere.
 */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** This browser's token, created and saved on first use. */
export function getAnonymousToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) return saved
    const token = randomId()
    localStorage.setItem(TOKEN_KEY, token)
    return token
  } catch {
    memoryToken ??= randomId()
    return memoryToken
  }
}

function readSubmitted(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SUBMITTED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Whether this browser already submitted to the survey (a hint; the database decides). */
export function hasSubmitted(surveyId: string): boolean {
  return readSubmitted().includes(surveyId)
}

export function markSubmitted(surveyId: string): void {
  try {
    const submitted = readSubmitted()
    if (!submitted.includes(surveyId)) {
      localStorage.setItem(SUBMITTED_KEY, JSON.stringify([...submitted, surveyId]))
    }
  } catch {
    // localStorage is blocked; the database still rejects repeats.
  }
}
