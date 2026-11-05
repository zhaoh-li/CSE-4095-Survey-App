import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A minimal in-memory localStorage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

/** localStorage that throws, like some private browsing modes. */
const blockedStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

/** A fresh copy of the module, so its in-memory fallback starts empty. */
const loadModule = async () => {
  vi.resetModules()
  return import('./anonymous-token')
}

describe('anonymous token (D7, D25)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a UUID once and keeps it in localStorage', async () => {
    const { getAnonymousToken } = await loadModule()
    const token = getAnonymousToken()
    expect(token).toMatch(UUID)
    expect(getAnonymousToken()).toBe(token)
    expect(localStorage.getItem('classroom-survey:token')).toBe(token)
  })

  it('falls back to crypto.getRandomValues when randomUUID is missing (plain http)', async () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const { getAnonymousToken } = await loadModule()
    expect(getAnonymousToken()).toMatch(UUID)
  })

  it('keeps a token in memory when localStorage is blocked', async () => {
    vi.stubGlobal('localStorage', blockedStorage)
    const { getAnonymousToken, hasSubmitted, markSubmitted } = await loadModule()
    const token = getAnonymousToken()
    expect(token).toMatch(UUID)
    expect(getAnonymousToken()).toBe(token)

    expect(() => markSubmitted('s1')).not.toThrow()
    expect(hasSubmitted('s1')).toBe(false)
  })

  it('remembers which surveys were submitted', async () => {
    const { hasSubmitted, markSubmitted } = await loadModule()
    expect(hasSubmitted('s1')).toBe(false)
    markSubmitted('s1')
    markSubmitted('s1')
    expect(hasSubmitted('s1')).toBe(true)
    expect(JSON.parse(localStorage.getItem('classroom-survey:submitted')!)).toEqual(['s1'])
  })

  it('ignores a damaged submitted list', async () => {
    localStorage.setItem('classroom-survey:submitted', '{not json')
    const { hasSubmitted, markSubmitted } = await loadModule()
    expect(hasSubmitted('s1')).toBe(false)
    markSubmitted('s1')
    expect(hasSubmitted('s1')).toBe(true)
  })
})
