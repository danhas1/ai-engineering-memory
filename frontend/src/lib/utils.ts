import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// crypto.randomUUID() is only available in secure contexts (HTTPS / localhost).
// On plain HTTP (e.g. EC2 over port 80/5001) it is undefined and throws at runtime.
// crypto.getRandomValues() is available in ALL contexts including plain HTTP.
export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 UUID via getRandomValues — works on non-secure HTTP origins
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10).join('')
  )
}
