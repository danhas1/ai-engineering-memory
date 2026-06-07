import { cn } from '@/lib/utils'
import { DOC_TYPE_CONFIG } from '@/lib/docTypeConfig'
import type { DocType } from '@/api/types'

interface DocTypeBadgeProps {
  docType: DocType
  className?: string
}

// Light-mode-safe badge — explicit colors, no dark: prefix
const BADGE_CLASSES: Record<DocType, string> = {
  ADR:   'bg-blue-50   text-blue-600   border-blue-100',
  INC:   'bg-red-50    text-red-600    border-red-100',
  JIRA:  'bg-amber-50  text-amber-600  border-amber-100',
  RUN:   'bg-emerald-50 text-emerald-600 border-emerald-100',
  SLACK: 'bg-violet-50 text-violet-600 border-violet-100',
  ARCH:  'bg-gray-50   text-gray-600   border-gray-200',
  RETRO: 'bg-pink-50   text-pink-600   border-pink-100',
  SEC:   'bg-orange-50 text-orange-600 border-orange-100',
  DOC:   'bg-gray-50   text-gray-500   border-gray-200',
}

export function DocTypeBadge({ docType, className }: DocTypeBadgeProps) {
  const config = DOC_TYPE_CONFIG[docType]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
        BADGE_CLASSES[docType],
        className,
      )}
    >
      {config.label}
    </span>
  )
}
