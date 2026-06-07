import { useUIStore } from '@/store/uiStore'

export function useCommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)

  return { open, setOpen }
}
