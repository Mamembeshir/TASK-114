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
  actorId: string,
  actorName: string,
): Promise<TrainingCourse> {
  requirePermission('createCatalogItem') // admin/editor gate
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
    eventType: 'catalog.created',
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
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('createCatalogItem')
  const course = await db.trainingCourses.get(id)
  if (!course) throw new Error('Training course not found')
  await db.trainingCourses.update(id, { ...updates, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.updated',
    actorId,
    actorName,
    entityType: 'TrainingCourse',
    entityId: id,
    description: `${actorName} updated training course "${course.title}"`,
  })
}

export async function deactivateTrainingCourse(
  id: string,
  actorId: string,
  actorName: string,
): Promise<void> {
  requirePermission('createCatalogItem')
  const course = await db.trainingCourses.get(id)
  if (!course) throw new Error('Training course not found')
  await db.trainingCourses.update(id, { isActive: false, updatedAt: Date.now() })
  await writeAuditLog({
    eventType: 'catalog.archived',
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
  actorId: string,
  actorName: string,
): Promise<TrainingProgress> {
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
      eventType: 'user.activated', // closest event type for completion
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
  const courses = await db.trainingCourses.where('isActive').equals(1).toArray()
  const allProgress = await db.trainingProgress.where('userId').equals(userId).toArray()
  const progressMap = new Map(allProgress.map((p) => [p.courseId, p]))
  return courses.map((course) => ({
    course,
    progress: progressMap.get(course.id) ?? null,
  }))
}
