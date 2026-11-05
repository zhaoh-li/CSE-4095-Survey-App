// Shared Tailwind class strings, so buttons and inputs look the same everywhere.

const base =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-medium focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50'

export const buttonPrimary = `${base} bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-400`
export const buttonSecondary = `${base} border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-300`
export const buttonDanger = `${base} bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-300`

export const inputClass =
  'block min-h-11 w-full rounded-lg border border-slate-500 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200'

export const labelClass = 'block text-sm font-medium text-slate-700'
