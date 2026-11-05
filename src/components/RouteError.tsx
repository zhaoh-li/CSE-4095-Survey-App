import { useRouteError } from 'react-router-dom'
import { buttonPrimary, buttonSecondary } from '../lib/styles'
import { usePageTitle } from '../lib/use-page-title'

/** Browser messages for a code file that no longer exists after a deployment. */
const OUTDATED_CODE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i

/**
 * Shown instead of React Router's built-in error screen (D28). The usual cause
 * is a tab opened before a new deployment, whose code files are gone.
 */
export default function RouteError() {
  const error = useRouteError()
  const outdated = error instanceof Error && OUTDATED_CODE.test(error.message)
  usePageTitle(outdated ? 'Please reload' : 'Something went wrong')
  console.error(error)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        role="alert"
        className="max-w-md space-y-4 rounded-xl bg-white p-8 text-center shadow-sm"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          {outdated ? 'This site was updated.' : 'Something went wrong.'}
        </h1>
        <p className="text-lg text-slate-700">
          {outdated
            ? 'Please reload the page to get the latest version.'
            : 'Please reload the page. If it keeps happening, go back to the home page.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className={buttonPrimary}>
            Reload
          </button>
          {!outdated && (
            <a href="/" className={buttonSecondary}>
              Home
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
