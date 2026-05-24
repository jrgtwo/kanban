export interface Scope {
  projectId: string
  parentCardId?: string
}

export const isSubBoardScope = (s: Scope): s is Required<Pick<Scope, 'parentCardId'>> & Scope =>
  s.parentCardId !== undefined

export const scopeKey = (s: Scope): string =>
  s.parentCardId ? `${s.projectId}:${s.parentCardId}` : s.projectId
