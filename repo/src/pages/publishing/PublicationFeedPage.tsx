/**
 * PublicationFeedPage — public feed of Published announcements, notices, and bulletins.
 * Records view events and tracks time-on-page via Page Visibility API (SPEC 9, CLAUDE.md #9).
 */
import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { generateId } from '@/crypto'
import { Badge, Card, EmptyState, Spinner } from '@/components/ui'
import type { Publication, PublicationType } from '@/types'

const TYPE_VARIANTS: Record<PublicationType, 'info' | 'warning' | 'primary'> = {
  Announcement: 'primary',
  Notice: 'warning',
  Bulletin: 'info',
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

  // Track active view session for time-on-page
  const sessionRef = useRef<ViewSession | null>(null)

  useEffect(() => {
    const load = async () => {
      const pubs = await db.publications
        .where('status')
        .equals('Published')
        .reverse()
        .sortBy('publishedAt')
      setPublications(pubs)
      setIsLoading(false)
    }
    void load()
  }, [])

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
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Publications</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Official announcements, notices, and bulletins
        </p>
      </div>

      {publications.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No publications yet"
          description="Official announcements and notices will appear here once published."
        />
      ) : (
        <div className="space-y-3">
          {publications.map((pub) => {
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
                      dangerouslySetInnerHTML={{ __html: pub.body }}
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
