// ── Training Module ───────────────────────────────────────────────────────────

export type TrainingStatus = 'NotStarted' | 'InProgress' | 'Completed'

export interface TrainingCourse {
  id: string
  title: string
  description: string
  /** Ordered list of section titles */
  sections: string[]
  /** Who should take this course (empty = all roles) */
  targetRoles: string[]
  /** Whether this course is required for Participant access */
  isRequired: boolean
  isActive: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface TrainingProgress {
  id: string
  userId: string
  courseId: string
  status: TrainingStatus
  /** Index of the last completed section (0-based) */
  lastSectionIndex: number
  /** Total sections completed */
  sectionsCompleted: number
  startedAt?: number
  completedAt?: number
  updatedAt: number
}
