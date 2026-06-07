import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Source, DocType } from '@/api/types'
import { classifyFilename } from '@/lib/docTypeConfig'

interface SourcesStore {
  sources: Record<string, Source>
  activeFilter: DocType | 'ALL'
  addSources: (incoming: Source[]) => void
  setFilter: (f: DocType | 'ALL') => void
  filteredSources: () => Source[]
  availableTypes: () => Array<DocType | 'ALL'>
}

export const useSourcesStore = create<SourcesStore>()(
  persist(
    (set, get) => ({
      sources: {},
      activeFilter: 'ALL',

      addSources: (incoming) =>
        set((s) => {
          const updated = { ...s.sources }
          for (const src of incoming) {
            updated[src.uri] = src
          }
          return { sources: updated }
        }),

      setFilter: (f) => set({ activeFilter: f }),

      filteredSources: () => {
        const { sources, activeFilter } = get()
        const all = Object.values(sources)
        if (activeFilter === 'ALL') return all
        return all.filter((s) => classifyFilename(s.filename) === activeFilter)
      },

      availableTypes: () => {
        const types = new Set<DocType>()
        for (const src of Object.values(get().sources)) {
          types.add(classifyFilename(src.filename))
        }
        return ['ALL', ...Array.from(types)] as Array<DocType | 'ALL'>
      },
    }),
    {
      name: 'cloudshop-sources',
      partialize: (s) => ({ sources: s.sources }),
    },
  ),
)
