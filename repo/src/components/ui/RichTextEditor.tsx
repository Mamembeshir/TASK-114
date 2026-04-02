/**
 * RichTextEditor — TipTap-based rich text editor.
 * Supports bold, italic, headings, ordered and unordered lists.
 */
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-primary-600/20 text-primary-400'
          : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({ value, onChange, placeholder, disabled }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[200px] px-3 py-2 text-sm text-surface-100 focus:outline-none prose prose-invert prose-sm max-w-none',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
  })

  // Sync external value changes (e.g., loading saved content)
  useEffect(() => {
    const current = editor.getHTML()
    if (current !== value) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  return (
    <div
      className={[
        'border rounded-xl overflow-hidden',
        disabled
          ? 'border-surface-800 opacity-60'
          : 'border-surface-700 focus-within:border-primary-500',
      ].join(' ')}
    >
      {/* Toolbar */}
      {!disabled && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-surface-800 bg-surface-900">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-4 bg-surface-700 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-4 bg-surface-700 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Ordered list"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}

      {/* Editor area */}
      <div className="bg-surface-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
