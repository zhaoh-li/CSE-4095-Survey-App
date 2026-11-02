const displayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** "Aug 17, 2026" */
export function formatDate(iso: string): string {
  return displayFormat.format(new Date(iso))
}

/** The local calendar date as "YYYY-MM-DD", matching `<input type="date">` values. */
export function toLocalDateString(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local date and time as "YYYY-MM-DD HH:MM:SS", which spreadsheets read as a date (D26). */
export function toLocalDateTimeString(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${toLocalDateString(iso)} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}
