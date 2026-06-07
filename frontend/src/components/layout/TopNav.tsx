import { NavLink } from 'react-router-dom'
import { Command, BookMarked } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useHealth } from '@/api/hooks'
import { useUIStore } from '@/store/uiStore'
import { useTeamStore } from '@/store/teamStore'
import { cn } from '@/lib/utils'

const TEAM_COLORS: Record<string, string> = {
  Platform: 'bg-blue-100 text-blue-700 border-blue-200',
  Payments: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Data:     'bg-violet-100 text-violet-700 border-violet-200',
  DevOps:   'bg-amber-100 text-amber-700 border-amber-200',
}

const NAV = [
  { to: '/',     label: 'Home', end: true  },
  { to: '/chat', label: 'Chat', end: false },
]

export function TopNav() {
  const { status, knowledgeBaseId } = useHealth()
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const { selectedTeam }      = useTeamStore()
  const kbLabel = knowledgeBaseId ? knowledgeBaseId.slice(-6).toUpperCase() : null

  return (
    <TooltipProvider>
      <header className="glass sticky top-0 z-40 h-12 shrink-0">
        <div className="flex h-full items-center justify-between px-4 gap-4 max-w-screen-xl mx-auto">

          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
              <BookMarked className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </div>
            <span className="text-[13px] font-semibold text-gray-900 tracking-tight select-none">
              Engineering Memory Assistant
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative h-7 px-3 rounded-md text-[13px] font-medium transition-colors duration-100 flex items-center gap-1.5',
                    isActive
                      ? 'text-gray-900 bg-gray-100'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Active workspace badge */}
            {selectedTeam !== 'all' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    'hidden sm:flex items-center h-6 rounded-full border px-2.5 text-[11px] font-medium select-none cursor-default',
                    TEAM_COLORS[selectedTeam] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                  )}>
                    {selectedTeam}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Searching within {selectedTeam} workspace
                </TooltipContent>
              </Tooltip>
            )}

            {kbLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden md:flex items-center gap-1.5 h-6 rounded-md bg-gray-50 border border-gray-100 px-2 text-[11px] font-mono text-gray-400 cursor-default select-none">
                    <span className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      status === 'ok'      && 'bg-emerald-500',
                      status === 'error'   && 'bg-red-400',
                      status === 'unknown' && 'bg-amber-400 animate-pulse',
                    )} />
                    {kbLabel}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {status === 'ok'
                    ? `Knowledge Base ${knowledgeBaseId} · connected`
                    : 'Backend unreachable'}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCommandPaletteOpen(true)}
                  className="hidden sm:flex items-center gap-1 h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-mono text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
                  aria-label="Open command palette"
                >
                  <Command className="h-3 w-3" />
                  <span>K</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Command palette</TooltipContent>
            </Tooltip>

            <button
              className="sm:hidden flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Menu"
            >
              <Command className="h-3.5 w-3.5" />
            </button>
          </div>

        </div>
      </header>
    </TooltipProvider>
  )
}
