/**
 * Saves text as a file. CSV files start with a UTF-8 byte order mark, so Excel
 * shows accents and emoji correctly (D26).
 */
export function downloadTextFile(fileName: string, text: string, type = 'text/csv'): void {
  const bom = type === 'text/csv' ? '﻿' : ''
  const blob = new Blob([bom + text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
