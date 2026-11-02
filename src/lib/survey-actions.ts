import type { SurveyStatus } from './types'

export type SurveyAction =
  | 'edit'
  | 'present'
  | 'results'
  | 'activate'
  | 'reopen'
  | 'close'
  | 'archive'
  | 'unarchive'
  | 'duplicate'
  | 'delete'

/** The actions the dashboard offers for each status (D9). */
export const ACTIONS_BY_STATUS: Record<SurveyStatus, SurveyAction[]> = {
  draft: ['edit', 'activate', 'duplicate', 'delete'],
  active: ['present', 'results', 'close', 'duplicate'],
  closed: ['results', 'reopen', 'archive', 'duplicate', 'delete'],
  archived: ['results', 'unarchive', 'duplicate', 'delete'],
}

export const ACTION_LABELS: Record<SurveyAction, string> = {
  edit: 'Edit',
  present: 'Present',
  results: 'Results',
  activate: 'Activate',
  reopen: 'Reopen',
  close: 'Close',
  archive: 'Archive',
  unarchive: 'Unarchive',
  duplicate: 'Duplicate',
  delete: 'Delete',
}

/** Actions that just open another page. */
export const ACTION_PATHS: Partial<Record<SurveyAction, (id: string) => string>> = {
  edit: (id) => `/surveys/${id}/edit`,
  present: (id) => `/surveys/${id}/present`,
  results: (id) => `/surveys/${id}/results`,
}
