export interface Project {
  id: string
  name: string
  description?: string
  /** sigil — single character used as the project's visual mark */
  sigil: string
  /** accent tint — vermillion | ochre | moss | ink */
  accent: 'vermillion' | 'ochre' | 'moss' | 'ink'
  createdAt: number
  updatedAt: number
}

export interface Column {
  id: string
  projectId: string
  name: string
  order: number
  createdAt: number
}

export interface Task {
  id: string
  projectId: string
  columnId: string
  title: string
  notes?: string
  order: number
  createdAt: number
  updatedAt: number
}
