import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TeamWorkspace } from '@/api/types'

interface TeamStore {
  selectedTeam: TeamWorkspace
  setSelectedTeam: (team: TeamWorkspace) => void
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      selectedTeam:    'all',
      setSelectedTeam: (team) => set({ selectedTeam: team }),
    }),
    { name: 'team-workspace' },
  ),
)
