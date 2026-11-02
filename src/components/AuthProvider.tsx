import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext } from '../lib/auth-context'
import { supabase } from '../lib/supabase'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Supabase keeps the session in localStorage, so a page refresh stays signed in.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Keep in sync with sign-in, sign-out and token refreshes (including other tabs).
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return
    if (error.name === 'AuthRetryableFetchError') {
      throw new Error('Could not reach the server. Check your connection and try again.')
    }
    if (error.code === 'invalid_credentials' || error.status === 400) {
      throw new Error('Incorrect email or password.')
    }
    console.error(error)
    throw new Error('Could not log in. Please try again.')
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error(error)
  }, [])

  const value = useMemo(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
