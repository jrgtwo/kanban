import type { Accent } from '../lib/accents'

export interface Project {
  id: string
  name: string
  description?: string
  sigil: string
  accent: Accent
  createdAt: number
}

export type CardType = 'task' | 'subboard' | 'note' | 'checklist' | 'milestone'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Card {
  id: string
  projectId: string
  parentCardId?: string
  columnId: string
  order: number
  type: CardType
  title: string
  notes?: string
  checklistItems?: ChecklistItem[]
  dueAt?: number
  createdAt: number
}

export interface Column {
  id: string
  projectId: string
  parentCardId?: string
  name: string
  order: number
  createdAt: number
}
