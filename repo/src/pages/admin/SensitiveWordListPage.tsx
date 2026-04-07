/**
 * SensitiveWordListPage — add, edit, and remove moderation flagged words (Admin only).
 */

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { db } from '@/db'
import { addSensitiveWord, deleteSensitiveWord } from '@/services/adminConfigService'
import { Button, Card, EmptyState, Spinner } from '@/components/ui'
import type { SensitiveWord } from '@/types'

export function SensitiveWordListPage() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const [words, setWords] = useState<SensitiveWord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)
  const [input, setInput] = useState('')

  const load = useCallback(async () => {
    const all = await db.sensitiveWords.orderBy('word').toArray()
    setWords(all)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser) return null

  const handleAdd = async () => {
    const word = input.trim().toLowerCase()
    if (!word) return
    setIsActing(true)
    try {
      const added = await addSensitiveWord(word, currentUser.id, currentUser.displayName)
      if (!added) {
        toast.error('Word already in list')
        return
      }
      toast.success(`"${word}" added to moderation list`)
      setInput('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  const handleDelete = async (sw: SensitiveWord) => {
    setIsActing(true)
    try {
      await deleteSensitiveWord(sw.id, sw.word, currentUser.id, currentUser.displayName)
      toast.success(`"${sw.word}" removed`)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsActing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAdd()
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-surface-100">Sensitive Word List</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Words listed here block publishing of catalog items, publications, and documents.
        </p>
      </div>

      {/* Add word input */}
      <Card>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:outline-none focus:border-primary-500"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Enter word or phrase…"
          />
          <Button
            variant="primary"
            onClick={() => void handleAdd()}
            isLoading={isActing}
            disabled={!input.trim()}
          >
            Add Word
          </Button>
        </div>
      </Card>

      {/* Word list */}
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card padded={false}>
          {words.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No sensitive words"
              description="Add words to block in content submissions."
            />
          ) : (
            <div className="divide-y divide-surface-800">
              {words.map((sw) => (
                <div key={sw.id} className="flex items-center justify-between px-4 py-3 group">
                  <div>
                    <span className="text-sm font-mono text-surface-100">{sw.word}</span>
                    <span className="text-xs text-surface-600 ml-3">
                      Added {new Date(sw.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => void handleDelete(sw)}
                    disabled={isActing}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-surface-700 transition-all"
                    aria-label={`Remove "${sw.word}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
