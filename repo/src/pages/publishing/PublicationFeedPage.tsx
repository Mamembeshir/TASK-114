/**
 * PublicationFeedPage — public feed of Published announcements, notices, and bulletins.
 * Records view events and tracks time-on-page via Page Visibility API (SPEC 9, CLAUDE.md #9).
 */
import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { generateId } from '@/crypto'
import { Badge, Card, EmptyState, Skeleton, SkeletonText } from '@/components/ui'
import { sanitizeHtml } from '@/utils/sanitize'
import type { Publication, PublicationType } from '@/types'

const TYPE_VARIANTS: Record<PublicationType, 'info' | 'warning' | 'primary'> = {
  Announcement: 'primary',
  Notice: 'warning',
  Bulletin: 'info',
  Carousel: 'info',
}

interface ViewSession {
  publicationId: string
  eventId: string
  openedAt: number
}

export function PublicationFeedPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [publications, setPublications] = useState<Publication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState('')

  // Track active view session for time-on-page
  const sessionRef = useRef<ViewSession | null>(null)

  useEffect(() => {
    const load = async () => {
      const all = await db.publications
        .where('status')
        .equals('Published')
        .reverse()
        .sortBy('publishedAt')

      // Filter by audience role + org: a publication is visible when both dimensions pass.
      // Empty audience array = no restriction (global broadcast) for that dimension.
      const visible = all.filter((pub) => {
        const roleOk =
          !pub.audienceRoles?.length ||
          (currentUser != null && pub.audienceRoles.includes(currentUser.role))
        const orgOk =
          !pub.audienceOrgs?.length ||
          (currentUser?.organization != null &&
            pub.audienceOrgs.includes(currentUser.organization))
        return roleOk && orgOk
      })
      setPublications(visible)
      setIsLoading(false)
    }
    void load()
  }, [currentUser])

  // Record view event when expanding a publication
  const recordViewOpen = async (publicationId: string) => {
    if (!currentUser) return
    const eventId = generateId()
    const openedAt = Date.now()
    await db.viewEvents.add({
      id: eventId,
      entityType: 'Publication',
      entityId: publicationId,
      userId: currentUser.id,
      sessionId: generateId(),
      openedAt,
    })
    sessionRef.current = { publicationId, eventId, openedAt }
  }

  // Record view close (duration) when collapsing or navigating away
  const recordViewClose = async () => {
    const session = sessionRef.current
    if (!session) return
    const closedAt = Date.now()
    const durationSeconds = Math.round((closedAt - session.openedAt) / 1000)
    await db.viewEvents.update(session.eventId, { closedAt, durationSeconds })
    sessionRef.current = null
  }

  // Visibility API: flush on tab hide/close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void recordViewClose()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void recordViewClose()
    }
  }, [])

  const handleToggleExpand = (publicationId: string) => {
    if (expandedId === publicationId) {
      void recordViewClose()
      setExpandedId(null)
    } else {
      void recordViewClose()
      setExpandedId(publicationId)
      void recordViewOpen(publicationId)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <div>
          <h1 className="text-lg font-semibold text-surface-100">Publications</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Official announcements, notices, and bulletins
          </p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface-900 border border-surface-800 rounded-xl p-4 space-y-3"
              aria-hidden="true"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-2/3" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const activeTag = tagFilter.trim().toLowerCase()
  const visiblePublications = activeTag
    ? publications.filter((pub) =>
        (pub.audienceTags ?? []).some((t) => t.toLowerCase().includes(activeTag)),
      )
    : publications

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Publications</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Official announcements, notices, and bulletins
        </p>
      </div>

      {/* Tag filter */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
          placeholder="Filter by topic tag…"
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value)
          }}
        />
        {tagFilter && (
          <button
            onClick={() => {
              setTagFilter('')
            }}
            className="text-xs text-surface-500 hover:text-surface-300 px-2"
          >
            Clear
          </button>
        )}
      </div>

      {visiblePublications.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No publications yet"
          description="Official announcements and notices will appear here once published."
        />
      ) : (
        <div className="space-y-3">
          {visiblePublications.map((pub) => {
            const isExpanded = expandedId === pub.id
            return (
              <Card key={pub.id}>
                <button
                  onClick={() => {
                    handleToggleExpand(pub.id)
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={TYPE_VARIANTS[pub.type]}>{pub.type}</Badge>
                        {pub.publishedAt && (
                          <span className="text-xs text-surface-500">
                            {new Date(pub.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-surface-100 text-sm">{pub.title}</p>
                      {pub.audienceTags && pub.audienceTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pub.audienceTags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-surface-700 text-surface-400 rounded px-1.5 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {!isExpanded && (
                        <p className="text-surface-500 text-xs mt-1">Click to read full content</p>
                      )}
                    </div>
                    <span className="text-surface-500 text-xs mt-0.5 shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-surface-800">
                    <div
                      className="prose prose-invert prose-sm max-w-none text-surface-300"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(pub.body) }}
                    />
                    {pub.attachmentUrls.length > 0 && pub.attachmentUrls[0] && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-surface-500 mb-2">Attachments</p>
                        <div className="space-y-1">
                          {pub.attachmentUrls.filter(Boolean).map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-primary-400 hover:underline truncate"
                            >
                              {url}
                            </a>
                          ))}
                        </div>
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
