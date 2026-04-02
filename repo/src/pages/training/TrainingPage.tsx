/**
 * TrainingPage — displays all active training courses and the current user's
 * progress through each one.  Participants can work through sections and mark
 * them complete.  Admin/ContentEditor can see the same view.
 */

import { useEffect, useState } from 'react'
import { GraduationCap, CheckCircle2, Circle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { Badge, Card, CardHeader, EmptyState, Spinner } from '@/components/ui'
import { listCoursesWithProgress, completeSection } from '@/services/trainingService'
import type { TrainingCourse, TrainingProgress } from '@/types'

interface CourseEntry {
  course: TrainingCourse
  progress: TrainingProgress | null
}

const STATUS_VARIANTS = {
  NotStarted: 'default',
  InProgress: 'warning',
  Completed: 'success',
} as const

export function TrainingPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [entries, setEntries] = useState<CourseEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)

  const reload = async () => {
    if (!currentUser) return
    const data = await listCoursesWithProgress(currentUser.id)
    setEntries(data)
  }

  useEffect(() => {
    void reload().then(() => {
      setIsLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  if (!currentUser) return null

  const handleCompleteSection = async (courseId: string, sectionIndex: number) => {
    setCompleting(`${courseId}-${String(sectionIndex)}`)
    try {
      await completeSection(
        currentUser.id,
        courseId,
        sectionIndex,
        currentUser.id,
        currentUser.displayName,
      )
      await reload()
      toast.success('Section marked complete!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save progress')
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Training</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Complete the required courses below to keep your compliance record up to date.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No training courses available"
          description="Check back later — new courses will appear here when they are published."
        />
      ) : (
        <div className="space-y-4">
          {entries.map(({ course, progress }) => {
            const status = progress?.status ?? 'NotStarted'
            const completed = progress?.sectionsCompleted ?? 0
            const pct =
              course.sections.length > 0
                ? Math.round((completed / course.sections.length) * 100)
                : 0
            const isExpanded = expandedId === course.id

            return (
              <Card key={course.id} className="space-y-0">
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : course.id)
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-surface-100 text-sm">{course.title}</p>
                        {course.isRequired && <Badge variant="danger">Required</Badge>}
                        <Badge variant={STATUS_VARIANTS[status]}>{status}</Badge>
                      </div>
                      {course.description && (
                        <p className="text-surface-400 text-xs mt-1 line-clamp-2">
                          {course.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-surface-500">
                        {String(completed)} / {String(course.sections.length)} sections
                      </p>
                      <div className="mt-1 w-32 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${String(pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-4 border-t border-surface-800 pt-4 space-y-2">
                    <CardHeader title="Sections" />
                    {course.sections.map((section, idx) => {
                      const done = (progress?.sectionsCompleted ?? 0) > idx
                      const isNext = idx === (progress?.sectionsCompleted ?? 0)
                      const key = `${course.id}-${String(idx)}`
                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 py-1.5">
                          <div className="flex items-center gap-2">
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            ) : isNext ? (
                              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-surface-600 shrink-0" />
                            )}
                            <span
                              className={`text-sm ${done ? 'text-surface-400 line-through' : 'text-surface-200'}`}
                            >
                              {section}
                            </span>
                          </div>
                          {isNext && status !== 'Completed' && (
                            <button
                              disabled={completing === key}
                              onClick={() => {
                                void handleCompleteSection(course.id, idx)
                              }}
                              className="text-xs px-2 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded transition-colors disabled:opacity-50"
                            >
                              {completing === key ? 'Saving…' : 'Mark complete'}
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {status === 'Completed' && (
                      <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Completed{' '}
                          {progress?.completedAt
                            ? new Date(progress.completedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
