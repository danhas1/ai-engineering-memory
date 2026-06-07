import { useRef, useEffect, KeyboardEvent } from 'react'
import { ArrowUp, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  isLoading: boolean
  placeholder?: string
  autoFocus?: boolean
}

const MAX = 2000

export function SearchInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = "Ask anything about your engineering history…",
  autoFocus = false,
}: SearchInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const len = value.length
  const hasText = value.trim().length > 0
  const nearLimit = len > MAX * 0.75

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={cn(
      'relative rounded-xl border bg-white transition-all duration-200',
      hasText
        ? 'border-gray-300 shadow-[0_0_0_3px_rgba(37,99,235,0.08)] ring-0'
        : 'border-gray-200 shadow-sm hover:border-gray-300',
      isLoading && 'opacity-70 pointer-events-none',
    )}>
      {/* Search icon */}
      <div className="absolute left-4 top-4 pointer-events-none">
        <Search className="h-4 w-4 text-gray-300" strokeWidth={2} />
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        maxLength={MAX}
        rows={3}
        disabled={isLoading}
        className="w-full resize-none bg-transparent pl-11 pr-4 pt-3.5 pb-12 text-[14px] text-gray-900 placeholder:text-gray-400 leading-relaxed focus:outline-none"
      />

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3.5 pb-3">
        <span className={cn(
          'text-[11px] text-gray-400 font-mono transition-opacity',
          hasText ? 'opacity-100' : 'opacity-0',
        )}>
          ↵ submit · ⇧↵ newline
        </span>

        <div className="flex items-center gap-2">
          {nearLimit && (
            <span className={cn(
              'text-[11px] font-mono tabular-nums',
              len > MAX * 0.9 ? 'text-amber-500' : 'text-gray-400',
            )}>
              {MAX - len}
            </span>
          )}
          <button
            onClick={onSubmit}
            disabled={isLoading || !hasText}
            aria-label="Submit"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
              hasText && !isLoading
                ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed',
            )}
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}
