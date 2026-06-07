import { useState, useRef, KeyboardEvent } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSubmit: (question: string) => void
  isLoading: boolean
}

export function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const q = value.trim()
    if (!q || isLoading) return
    onSubmit(q)
    setValue('')
    ref.current?.focus()
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const hasText = value.trim().length > 0

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-4 shrink-0">
      <div className="max-w-3xl mx-auto">
        <div className={cn(
          'flex items-end gap-2 rounded-xl border bg-white transition-all duration-200',
          hasText
            ? 'border-gray-300 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]'
            : 'border-gray-200 shadow-sm',
        )}>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a follow-up…"
            maxLength={2000}
            rows={1}
            disabled={isLoading}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none overflow-y-auto bg-transparent px-4 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 leading-relaxed focus:outline-none"
          />
          <div className="pb-2.5 pr-2.5 shrink-0">
            <button
              onClick={submit}
              disabled={isLoading || !hasText}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
                hasText && !isLoading
                  ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed',
              )}
              aria-label="Send"
            >
              {isLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400 text-right font-mono">
          ↵ send · ⇧↵ newline
        </p>
      </div>
    </div>
  )
}
