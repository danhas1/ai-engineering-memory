import { cn } from '@/lib/utils'
import type { TeamWorkspace } from '@/api/types'
import { useTeamStore } from '@/store/teamStore'

const TEAMS: { id: TeamWorkspace; label: string; color: string }[] = [
  { id: 'all',      label: 'All Teams', color: 'bg-gray-100 text-gray-600 hover:bg-gray-200 data-[active=true]:bg-gray-800 data-[active=true]:text-white' },
  { id: 'Platform', label: 'Platform',  color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white' },
  { id: 'Payments', label: 'Payments',  color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 data-[active=true]:bg-emerald-600 data-[active=true]:text-white' },
  { id: 'Data',     label: 'Data',      color: 'bg-violet-50 text-violet-700 hover:bg-violet-100 data-[active=true]:bg-violet-600 data-[active=true]:text-white' },
  { id: 'DevOps',   label: 'DevOps',    color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 data-[active=true]:bg-amber-600 data-[active=true]:text-white' },
]

interface TeamSelectorProps {
  className?: string
}

export function TeamSelector({ className }: TeamSelectorProps) {
  const { selectedTeam, setSelectedTeam } = useTeamStore()

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)} role="group" aria-label="Team workspace">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mr-1 shrink-0">
        Workspace
      </span>
      {TEAMS.map(({ id, label, color }) => (
        <button
          key={id}
          data-active={selectedTeam === id}
          onClick={() => setSelectedTeam(id)}
          className={cn(
            'h-6 px-2.5 rounded-full text-[12px] font-medium transition-all duration-150 shrink-0',
            color,
          )}
          aria-pressed={selectedTeam === id}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
