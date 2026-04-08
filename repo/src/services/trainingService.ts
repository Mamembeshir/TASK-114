/**
 * TrainingService — course lifecycle and participant progress tracking.
 *
 * Courses are created by Admins/ContentEditors.
 * Participants progress through sections and mark courses complete.
 * Progress is persisted in IndexedDB.
 */

import { db } from '@/db'
import { generateId } from '@/crypto'
import { writeAuditLog } from '@/utils/audit'
import { requirePermission } from '@/utils/permissions'
import { hasPermission } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import type { TrainingCourse, TrainingProgress } from '@/types'

export interface TrainingCourseInput {
  title: string
  description: string
  sections: string[]
  targetRoles: string[]
  isRequired: boolean
}

export async function createTrainingCourse(
  input: TrainingCourseInput,
): Promise<TrainingCourse> {
  requirePermission('manageTraining')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const now = Date.now()
  const course: TrainingCourse = {
    id: generateId(),
    ...input,
    isActive: true,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  }
  await db.trainingCourses.add(course)
  await writeAuditLog({
    eventType: 'training.course_created',
    actorId,
    actorName,
    entityType: 'TrainingCourse',
    entityId: course.id,
    description: `${actorName} created training course "${course.title}"`,
  })
  return course
}

export async function updateTrainingCourse(
  id: string,
  updates: Partial<TrainingCourseInput>,
): Promise<void> {
  requirePermission('manageTraining')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const course = await db.trainingCourses.get(id)
  if (!course) throw new Error('Training course not found')
  await db.trainingCourses.update(id, { ...updates, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'training.course_updated',
    actorId,
    actorName,
    entityType: 'TrainingCourse',
    entityId: id,
    description: `${actorName} updated training course "${course.title}"`,
  })
}

export async function deactivateTrainingCourse(
  id: string,
): Promise<void> {
  requirePermission('manageTraining')
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  const course = await db.trainingCourses.get(id)
  if (!course) throw new Error('Training course not found')
  await db.trainingCourses.update(id, { isActive: false, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'training.course_deactivated',
    actorId,
    actorName,
    entityType: 'TrainingCourse',
    entityId: id,
    description: `${actorName} deactivated training course "${course.title}"`,
  })
}

/** Get or create a progress record for a user + course. */
export async function getOrInitProgress(
  userId: string,
  courseId: string,
): Promise<TrainingProgress> {
  const existing = await db.trainingProgress
    .where('userId')
    .equals(userId)
    .filter((p) => p.courseId === courseId)
    .first()
  if (existing) return existing

  const now = Date.now()
  const progress: TrainingProgress = {
    id: generateId(),
    userId,
    courseId,
    status: 'NotStarted',
    lastSectionIndex: -1,
    sectionsCompleted: 0,
    updatedAt: now,
  }
  await db.trainingProgress.add(progress)
  return progress
}

/** Advance the user's progress to the next section. */
export async function completeSection(
  userId: string,
  courseId: string,
  sectionIndex: number,
): Promise<TrainingProgress> {
  const currentUser = useAuthStore.getState().currentUser!
  const actorId = currentUser.id
  const actorName = currentUser.displayName
  if (userId !== actorId)
    throw new Error('Forbidden: you can only record your own training progress')
  const course = await db.trainingCourses.get(courseId)
  if (!course) throw new Error('Training course not found')

  const progress = await getOrInitProgress(userId, courseId)
  if (progress.status === 'Completed') return progress

  const newCompleted = Math.max(progress.sectionsCompleted, sectionIndex + 1)
  const isNowComplete = newCompleted >= course.sections.length
  const now = Date.now()

  const updates: Partial<TrainingProgress> = {
    status: isNowComplete ? 'Completed' : 'InProgress',
    lastSectionIndex: Math.max(progress.lastSectionIndex, sectionIndex),
    sectionsCompleted: newCompleted,
    startedAt: progress.startedAt ?? now,
    completedAt: isNowComplete ? now : undefined,
    updatedAt: now,
  }

  await db.trainingProgress.update(progress.id, updates)

  if (isNowComplete) {
    await writeAuditLog({
      eventType: 'training.course_completed',
      actorId,
      actorName,
      entityType: 'TrainingCourse',
      entityId: courseId,
      description: `${actorName} completed training course "${course.title}"`,
    })
  }

  return { ...progress, ...updates }
}

/** List all active courses with the user's progress for each. */
export async function listCoursesWithProgress(
  userId: string,
): Promise<{ course: TrainingCourse; progress: TrainingProgress | null }[]> {
  requirePermission('viewTraining')
  const currentUser = useAuthStore.getState().currentUser!
  if (currentUser.id !== userId && !hasPermission(currentUser.role, 'manageTraining'))
    throw new Error('Forbidden: you can only view your own training progress')
  const allCourses = await db.trainingCourses.where('isActive').equals(1).toArray()

  // Staff with manageTraining see all courses; otherwise filter by targetRoles.
  // Empty targetRoles means "all roles".
  const viewingRole = currentUser.role
  const canManage = hasPermission(viewingRole, 'manageTraining')
  const courses = canManage
    ? allCourses
    : allCourses.filter((c) => c.targetRoles.length === 0 || c.targetRoles.includes(viewingRole))

  const allProgress = await db.trainingProgress.where('userId').equals(userId).toArray()
  const progressMap = new Map(allProgress.map((p) => [p.courseId, p]))
  return courses.map((course) => ({
    course,
    progress: progressMap.get(course.id) ?? null,
  }))
}
