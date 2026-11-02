/** 86.5 → "86.5%" */
export const formatPercent = (value: number) => `${value.toFixed(1)}%`

/** plural(1, 'response') → "1 response"; plural(2, 'response') → "2 responses" */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Café Quiz #2!" → "cafe-quiz-2", for download file names. */
export function fileSafe(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // drop accents: é → e
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'survey'
  )
}
