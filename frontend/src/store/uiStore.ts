import { create } from 'zustand'

interface UIStore {
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
}

// Locked to light mode — remove dark class on startup
document.documentElement.classList.remove('dark')
localStorage.setItem('theme', 'light')

export const useUIStore = create<UIStore>()((set) => ({
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}))
