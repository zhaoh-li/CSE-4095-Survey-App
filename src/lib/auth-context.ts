import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export interface AuthContextValue {
  /** The signed-in instructor's session, or null when signed out. */
  session: Session | null
  /** True until the saved session has been checked on page load. */
  loading: boolean
  /** Throws an Error with a message that is safe to show. */
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
