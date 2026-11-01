import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Classroom Survey</h1>
        <p className="mt-4 text-lg text-slate-600">Quick in-class understanding checks</p>
        <Link
          to="/login"
          className="mt-8 inline-block rounded-lg bg-slate-900 px-6 py-3 text-lg font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400"
        >
          Instructor Login
        </Link>
      </div>
    </main>
  )
}
