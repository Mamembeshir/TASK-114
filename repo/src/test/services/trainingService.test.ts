/**
 * Unit tests for trainingService.
 *
 * Covers: createTrainingCourse, updateTrainingCourse, deactivateTrainingCourse,
 *         getOrInitProgress, completeSection, listCoursesWithProgress
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  createTrainingCourse,
  updateTrainingCourse,
  deactivateTrainingCourse,
  getOrInitProgress,
  completeSection,
  listCoursesWithProgress,
  type TrainingCourseInput,
} from '@/services/trainingService'
import { useAuthStore } from '@/store/authStore'
import { Role } from '@/types'
import type { TrainingCourse, TrainingProgress } from '@/types'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function setUser(id: string, role: Role, displayName = id) {
  useAuthStore.setState({
    currentUser: {
      id,
      username: id,
      displayName,
      role,
      isActive: true,
      createdAt: Date.now(),
    },
  } as Parameters<typeof useAuthStore.setState>[0])
}

const setAdmin       = (id = 'admin-1')   => setUser(id, Role.Administrator, 'Admin')
const setEditor      = (id = 'editor-1')  => setUser(id, Role.ContentEditor, 'Editor')
const setReviewer    = (id = 'rev-1')     => setUser(id, Role.ReviewerApprover, 'Reviewer')
const setParticipant = (id = 'p-1')       => setUser(id, Role.Participant, 'Participant')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function courseInput(overrides: Partial<TrainingCourseInput> = {}): TrainingCourseInput {
  return {
    title: 'Test Course',
    description: 'A test training course',
    sections: ['Intro', 'Module 1', 'Module 2', 'Assessment'],
    targetRoles: [],
    isRequired: false,
    ...overrides,
  }
}

async function seedCourse(overrides: Partial<TrainingCourse> = {}): Promise<TrainingCourse> {
  const course: TrainingCourse = {
    id: 'course-seed',
    title: 'Seeded Course',
    description: 'Seeded description',
    sections: ['Section 1', 'Section 2', 'Section 3'],
    targetRoles: [],
    isRequired: false,
    isActive: true,
    createdBy: 'admin-1',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  }
  await db.trainingCourses.add(course)
  return course
}

async function seedProgress(overrides: Partial<TrainingProgress> = {}): Promise<TrainingProgress> {
  const progress: TrainingProgress = {
    id: 'progress-seed',
    userId: 'p-1',
    courseId: 'course-seed',
    status: 'NotStarted',
    lastSectionIndex: -1,
    sectionsCompleted: 0,
    updatedAt: Date.now() - 1000,
    ...overrides,
  }
  await db.trainingProgress.add(progress)
  return progress
}

// ── Teardown ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.trainingCourses.clear()
  await db.trainingProgress.clear()
  await db.auditLogs.clear()
})

// ── createTrainingCourse ──────────────────────────────────────────────────────

describe('createTrainingCourse', () => {
  it('allows Admin to create a course', async () => {
    setAdmin()
    const course = await createTrainingCourse(courseInput())
    expect(course.id).toBeTruthy()
    expect(course.title).toBe('Test Course')
    expect(course.isActive).toBe(true)
    expect(course.createdBy).toBe('admin-1')
    const stored = await db.trainingCourses.get(course.id)
    expect(stored).toBeDefined()
  })

  it('allows ContentEditor to create a course', async () => {
    setEditor()
    const course = await createTrainingCourse(courseInput({ title: 'Editor Course' }))
    expect(course.title).toBe('Editor Course')
    expect(course.createdBy).toBe('editor-1')
  })

  it('rejects ReviewerApprover (no manageTraining)', async () => {
    setReviewer()
    await expect(createTrainingCourse(courseInput())).rejects.toThrow(/Forbidden/)
  })

  it('rejects Participant (no manageTraining)', async () => {
    setParticipant()
    await expect(createTrainingCourse(courseInput())).rejects.toThrow(/Forbidden/)
  })

  it('stores all input fields correctly', async () => {
    setAdmin()
    const input = courseInput({
      title: 'Advanced Course',
      sections: ['A', 'B', 'C'],
      targetRoles: [Role.Participant, Role.ReviewerApprover],
      isRequired: true,
    })
    const course = await createTrainingCourse(input)
    expect(course.sections).toEqual(['A', 'B', 'C'])
    expect(course.targetRoles).toContain(Role.Participant)
    expect(course.isRequired).toBe(true)
  })

  it('writes an audit log entry', async () => {
    setAdmin()
    const course = await createTrainingCourse(courseInput())
    const logs = await db.auditLogs.toArray()
    const entry = logs.find((l) => l.entityId === course.id)
    expect(entry).toBeDefined()
    expect(entry!.eventType).toBe('training.course_created')
  })
})

// ── updateTrainingCourse ──────────────────────────────────────────────────────

describe('updateTrainingCourse', () => {
  it('allows Admin to update title', async () => {
    setAdmin()
    await seedCourse()
    await updateTrainingCourse('course-seed', { title: 'Updated Title' })
    const stored = await db.trainingCourses.get('course-seed')
    expect(stored!.title).toBe('Updated Title')
  })

  it('allows ContentEditor to update sections', async () => {
    setEditor()
    await seedCourse()
    await updateTrainingCourse('course-seed', { sections: ['New Section'] })
    const stored = await db.trainingCourses.get('course-seed')
    expect(stored!.sections).toEqual(['New Section'])
  })

  it('rejects ReviewerApprover', async () => {
    setReviewer()
    await seedCourse()
    await expect(updateTrainingCourse('course-seed', { title: 'X' })).rejects.toThrow(/Forbidden/)
  })

  it('rejects Participant', async () => {
    setParticipant()
    await seedCourse()
    await expect(updateTrainingCourse('course-seed', { title: 'X' })).rejects.toThrow(/Forbidden/)
  })

  it('throws if course does not exist', async () => {
    setAdmin()
    await expect(updateTrainingCourse('no-such-course', { title: 'X' })).rejects.toThrow(
      'Training course not found',
    )
  })

  it('updates updatedAt timestamp', async () => {
    setAdmin()
    const before = Date.now()
    await seedCourse()
    await updateTrainingCourse('course-seed', { description: 'Updated desc' })
    const stored = await db.trainingCourses.get('course-seed')
    expect(stored!.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('writes an audit log entry', async () => {
    setAdmin()
    await seedCourse()
    await updateTrainingCourse('course-seed', { title: 'Audit Test' })
    const logs = await db.auditLogs.toArray()
    const entry = logs.find((l) => l.entityId === 'course-seed' && l.eventType === 'training.course_updated')
    expect(entry).toBeDefined()
  })
})

// ── deactivateTrainingCourse ──────────────────────────────────────────────────

describe('deactivateTrainingCourse', () => {
  it('allows Admin to deactivate a course', async () => {
    setAdmin()
    await seedCourse()
    await deactivateTrainingCourse('course-seed')
    const stored = await db.trainingCourses.get('course-seed')
    expect(stored!.isActive).toBe(false)
  })

  it('allows ContentEditor to deactivate', async () => {
    setEditor()
    await seedCourse()
    await deactivateTrainingCourse('course-seed')
    const stored = await db.trainingCourses.get('course-seed')
    expect(stored!.isActive).toBe(false)
  })

  it('rejects ReviewerApprover', async () => {
    setReviewer()
    await seedCourse()
    await expect(deactivateTrainingCourse('course-seed')).rejects.toThrow(/Forbidden/)
  })

  it('rejects Participant', async () => {
    setParticipant()
    await seedCourse()
    await expect(deactivateTrainingCourse('course-seed')).rejects.toThrow(/Forbidden/)
  })

  it('throws if course does not exist', async () => {
    setAdmin()
    await expect(deactivateTrainingCourse('no-such-course')).rejects.toThrow(
      'Training course not found',
    )
  })

  it('writes an audit log entry', async () => {
    setAdmin()
    await seedCourse()
    await deactivateTrainingCourse('course-seed')
    const logs = await db.auditLogs.toArray()
    const entry = logs.find(
      (l) => l.entityId === 'course-seed' && l.eventType === 'training.course_deactivated',
    )
    expect(entry).toBeDefined()
  })
})

// ── getOrInitProgress ─────────────────────────────────────────────────────────

describe('getOrInitProgress', () => {
  it('creates a new progress record when none exists', async () => {
    await seedCourse()
    const progress = await getOrInitProgress('p-1', 'course-seed')
    expect(progress.id).toBeTruthy()
    expect(progress.userId).toBe('p-1')
    expect(progress.courseId).toBe('course-seed')
    expect(progress.status).toBe('NotStarted')
    expect(progress.lastSectionIndex).toBe(-1)
    expect(progress.sectionsCompleted).toBe(0)
  })

  it('returns existing progress without creating a duplicate', async () => {
    await seedCourse()
    await seedProgress()
    const progress = await getOrInitProgress('p-1', 'course-seed')
    expect(progress.id).toBe('progress-seed')
    const all = await db.trainingProgress.toArray()
    expect(all).toHaveLength(1)
  })

  it('persists the newly created progress record', async () => {
    await seedCourse()
    const progress = await getOrInitProgress('user-new', 'course-seed')
    const stored = await db.trainingProgress.get(progress.id)
    expect(stored).toBeDefined()
    expect(stored!.userId).toBe('user-new')
  })

  it('is idempotent across multiple calls', async () => {
    await seedCourse()
    const p1 = await getOrInitProgress('p-1', 'course-seed')
    const p2 = await getOrInitProgress('p-1', 'course-seed')
    expect(p1.id).toBe(p2.id)
  })
})

// ── completeSection ───────────────────────────────────────────────────────────

describe('completeSection', () => {
  it('advances progress from NotStarted to InProgress', async () => {
    setParticipant('p-1')
    await seedCourse()
    const progress = await completeSection('p-1', 'course-seed', 0)
    expect(progress.status).toBe('InProgress')
    expect(progress.sectionsCompleted).toBe(1)
    expect(progress.lastSectionIndex).toBe(0)
    expect(progress.startedAt).toBeDefined()
  })

  it('marks the course Completed when final section is submitted', async () => {
    setParticipant('p-1')
    await seedCourse({ sections: ['A', 'B', 'C'] })
    await seedProgress({ sectionsCompleted: 2, lastSectionIndex: 1 })
    const progress = await completeSection('p-1', 'course-seed', 2)
    expect(progress.status).toBe('Completed')
    expect(progress.completedAt).toBeDefined()
  })

  it('does not regress progress when re-submitting an earlier section', async () => {
    setParticipant('p-1')
    await seedCourse({ sections: ['A', 'B', 'C'] })
    await seedProgress({ sectionsCompleted: 2, lastSectionIndex: 1, status: 'InProgress' })
    const progress = await completeSection('p-1', 'course-seed', 0)
    expect(progress.sectionsCompleted).toBe(2) // max(2, 0+1=1) = 2
  })

  it('returns immediately if already Completed', async () => {
    setParticipant('p-1')
    await seedCourse({ sections: ['A', 'B'] })
    await seedProgress({ status: 'Completed', sectionsCompleted: 2, lastSectionIndex: 1 })
    const progress = await completeSection('p-1', 'course-seed', 0)
    expect(progress.status).toBe('Completed')
    // DB row should be unchanged (no new update)
    const stored = await db.trainingProgress.get('progress-seed')
    expect(stored!.status).toBe('Completed')
  })

  it('throws Forbidden when userId !== actorId', async () => {
    setParticipant('other-user')
    await seedCourse()
    await expect(completeSection('p-1', 'course-seed', 0)).rejects.toThrow(/Forbidden/)
  })

  it('throws when course does not exist', async () => {
    setParticipant('p-1')
    await expect(completeSection('p-1', 'no-such-course', 0)).rejects.toThrow(
      'Training course not found',
    )
  })

  it('writes audit log on course completion', async () => {
    setParticipant('p-1')
    await seedCourse({ sections: ['A'] })
    await completeSection('p-1', 'course-seed', 0)
    const logs = await db.auditLogs.toArray()
    const entry = logs.find((l) => l.eventType === 'training.course_completed')
    expect(entry).toBeDefined()
    expect(entry!.entityId).toBe('course-seed')
  })

  it('does NOT write audit log for intermediate section completion', async () => {
    setParticipant('p-1')
    await seedCourse({ sections: ['A', 'B', 'C'] })
    await completeSection('p-1', 'course-seed', 0)
    const logs = await db.auditLogs.toArray()
    expect(logs.find((l) => l.eventType === 'training.course_completed')).toBeUndefined()
  })
})

// ── listCoursesWithProgress ───────────────────────────────────────────────────

describe('listCoursesWithProgress', () => {
  it('rejects unauthenticated call (no viewTraining)', async () => {
    useAuthStore.setState({ currentUser: null } as Parameters<typeof useAuthStore.setState>[0])
    await expect(listCoursesWithProgress('p-1')).rejects.toThrow()
  })

  it('Admin can list courses for another user', async () => {
    setAdmin('admin-1')
    await seedCourse()
    const result = await listCoursesWithProgress('p-1')
    expect(result).toHaveLength(1)
    expect(result[0].course.id).toBe('course-seed')
    expect(result[0].progress).toBeNull()
  })

  it('Participant can list their own courses', async () => {
    setParticipant('p-1')
    await seedCourse({ targetRoles: [] }) // empty = all roles
    const result = await listCoursesWithProgress('p-1')
    expect(result).toHaveLength(1)
  })

  it('Participant cannot list courses for another user', async () => {
    setParticipant('p-1')
    await seedCourse()
    await expect(listCoursesWithProgress('other-user')).rejects.toThrow(/Forbidden/)
  })

  it('includes progress when it exists', async () => {
    setParticipant('p-1')
    await seedCourse({ targetRoles: [] })
    await seedProgress({ status: 'InProgress', sectionsCompleted: 1 })
    const result = await listCoursesWithProgress('p-1')
    expect(result[0].progress).not.toBeNull()
    expect(result[0].progress!.status).toBe('InProgress')
  })

  it('filters out inactive courses', async () => {
    setAdmin()
    await seedCourse({ isActive: false })
    const result = await listCoursesWithProgress('admin-1')
    expect(result).toHaveLength(0)
  })

  it('Participant only sees courses matching their role', async () => {
    setParticipant('p-1')
    await db.trainingCourses.bulkAdd([
      {
        id: 'c-for-participant',
        title: 'For Participants',
        description: '',
        sections: ['A'],
        targetRoles: [Role.Participant],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'c-for-editors',
        title: 'For Editors Only',
        description: '',
        sections: ['A'],
        targetRoles: [Role.ContentEditor],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])
    const result = await listCoursesWithProgress('p-1')
    expect(result.map((r) => r.course.id)).toContain('c-for-participant')
    expect(result.map((r) => r.course.id)).not.toContain('c-for-editors')
  })

  it('Admin sees all courses regardless of targetRoles', async () => {
    setAdmin('admin-1')
    await db.trainingCourses.bulkAdd([
      {
        id: 'c-participant',
        title: 'P',
        description: '',
        sections: ['A'],
        targetRoles: [Role.Participant],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'c-editor',
        title: 'E',
        description: '',
        sections: ['A'],
        targetRoles: [Role.ContentEditor],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])
    const result = await listCoursesWithProgress('admin-1')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no courses exist', async () => {
    setParticipant('p-1')
    const result = await listCoursesWithProgress('p-1')
    expect(result).toHaveLength(0)
  })

  it('ContentEditor sees all courses (has manageTraining)', async () => {
    setEditor('editor-1')
    await db.trainingCourses.bulkAdd([
      {
        id: 'c1',
        title: 'C1',
        description: '',
        sections: ['A'],
        targetRoles: [Role.Participant],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'c2',
        title: 'C2',
        description: '',
        sections: ['A'],
        targetRoles: [Role.ReviewerApprover],
        isRequired: false,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])
    const result = await listCoursesWithProgress('editor-1')
    expect(result).toHaveLength(2)
  })
})
