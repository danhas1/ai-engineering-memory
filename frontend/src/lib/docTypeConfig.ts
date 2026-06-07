import {
  BookOpen,
  AlertTriangle,
  Ticket,
  Terminal,
  MessageSquare,
  Layers,
  RefreshCw,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DocType } from '@/api/types'

export interface DocTypeConfig {
  type: DocType
  label: string
  fullLabel: string
  description: string
  icon: LucideIcon
  // Badge pill: works in light AND dark mode via Tailwind dark: prefix
  badgeClasses: string
  // Icon container background + icon color — explicit, not extracted from badgeClasses
  iconBgClass: string
  iconColorClass: string
  // Accent bar / dot color
  cardAccentClass: string
}

export const DOC_TYPE_CONFIG: Record<DocType, DocTypeConfig> = {
  ADR: {
    type: 'ADR',
    label: 'ADR',
    fullLabel: 'Architecture Decision Record',
    description: 'Key architectural choices and rationale.',
    icon: BookOpen,
    badgeClasses: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    iconBgClass: 'bg-blue-100 dark:bg-blue-950/60',
    iconColorClass: 'text-blue-600 dark:text-blue-400',
    cardAccentClass: 'bg-blue-500',
  },
  INC: {
    type: 'INC',
    label: 'INC',
    fullLabel: 'Incident Postmortem',
    description: 'Root cause analysis and action items from outages.',
    icon: AlertTriangle,
    badgeClasses: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    iconBgClass: 'bg-red-100 dark:bg-red-950/60',
    iconColorClass: 'text-red-600 dark:text-red-400',
    cardAccentClass: 'bg-red-500',
  },
  JIRA: {
    type: 'JIRA',
    label: 'JIRA',
    fullLabel: 'Engineering Ticket',
    description: 'Issue investigations and resolution context.',
    icon: Ticket,
    badgeClasses: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    iconBgClass: 'bg-amber-100 dark:bg-amber-950/60',
    iconColorClass: 'text-amber-600 dark:text-amber-400',
    cardAccentClass: 'bg-amber-500',
  },
  RUN: {
    type: 'RUN',
    label: 'RUN',
    fullLabel: 'Operational Runbook',
    description: 'Step-by-step on-call and operational procedures.',
    icon: Terminal,
    badgeClasses: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    iconBgClass: 'bg-green-100 dark:bg-green-950/60',
    iconColorClass: 'text-green-600 dark:text-green-400',
    cardAccentClass: 'bg-green-500',
  },
  SLACK: {
    type: 'SLACK',
    label: 'SLACK',
    fullLabel: 'Slack Discussion',
    description: 'Team conversations and informal decision context.',
    icon: MessageSquare,
    badgeClasses: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
    iconBgClass: 'bg-violet-100 dark:bg-violet-950/60',
    iconColorClass: 'text-violet-600 dark:text-violet-400',
    cardAccentClass: 'bg-violet-500',
  },
  ARCH: {
    type: 'ARCH',
    label: 'ARCH',
    fullLabel: 'Architecture Document',
    description: 'System design and service topology documentation.',
    icon: Layers,
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
    iconBgClass: 'bg-slate-100 dark:bg-slate-800/60',
    iconColorClass: 'text-slate-600 dark:text-slate-400',
    cardAccentClass: 'bg-slate-400',
  },
  RETRO: {
    type: 'RETRO',
    label: 'RETRO',
    fullLabel: 'Retrospective',
    description: 'Sprint and project retrospective outcomes.',
    icon: RefreshCw,
    badgeClasses: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800',
    iconBgClass: 'bg-pink-100 dark:bg-pink-950/60',
    iconColorClass: 'text-pink-600 dark:text-pink-400',
    cardAccentClass: 'bg-pink-500',
  },
  SEC: {
    type: 'SEC',
    label: 'SEC',
    fullLabel: 'Security Review',
    description: 'PCI-DSS, threat model, and compliance review records.',
    icon: ShieldCheck,
    badgeClasses: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    iconBgClass: 'bg-orange-100 dark:bg-orange-950/60',
    iconColorClass: 'text-orange-600 dark:text-orange-400',
    cardAccentClass: 'bg-orange-500',
  },
  DOC: {
    type: 'DOC',
    label: 'DOC',
    fullLabel: 'Document',
    description: 'General engineering documentation.',
    icon: FileText,
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
    iconBgClass: 'bg-slate-100 dark:bg-slate-800/60',
    iconColorClass: 'text-slate-500 dark:text-slate-400',
    cardAccentClass: 'bg-slate-400',
  },
}

export const ALL_DOC_TYPES = Object.values(DOC_TYPE_CONFIG).filter(
  (c) => c.type !== 'DOC',
)

export function classifyFilename(filename: string): DocType {
  const f = filename.toLowerCase()
  if (f.startsWith('adr')) return 'ADR'
  if (f.includes('postmortem') || f.includes('incident')) return 'INC'
  if (f.startsWith('jira')) return 'JIRA'
  if (f.includes('runbook')) return 'RUN'
  if (f.includes('slack') || f.includes('discussion')) return 'SLACK'
  if (f.includes('retro')) return 'RETRO'
  if (f.includes('security') || f.includes('pci') || f.includes('review')) return 'SEC'
  if (f.includes('architecture') || f.includes('current')) return 'ARCH'
  return 'DOC'
}
