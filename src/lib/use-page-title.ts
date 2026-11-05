import { useEffect } from 'react'

/** Sets the browser tab title, e.g. "Dashboard · Classroom Survey". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · Classroom Survey` : 'Classroom Survey'
  }, [title])
}
