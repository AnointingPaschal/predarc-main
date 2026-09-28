// Theme management — persisted to localStorage, applied via data-theme on <html>
export type Theme = 'dark' | 'light'

const KEY = 'predarc_theme'

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
    // System preference fallback
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
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
