// Theme management — persisted in a first-party cookie (no localStorage),
// applied via data-theme on <html>
export type Theme = 'dark' | 'light'

const KEY = 'predarc_theme'

function readCookie(): Theme | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=(light|dark)`))
  return (m?.[1] as Theme | undefined) ?? null
}

export function getTheme(): Theme {
  try {
    const stored = readCookie()
    if (stored) return stored
    // System preference fallback
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function setTheme(theme: Theme): void {
  document.cookie = `${KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '')
}

export function applyTheme(): void {
  const t = getTheme()
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '')
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
