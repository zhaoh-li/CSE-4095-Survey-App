/** 86.5 → "86.5%" */
export const formatPercent = (value: number) => `${value.toFixed(1)}%`

/** plural(1, 'response') → "1 response"; plural(2, 'response') → "2 responses" */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
