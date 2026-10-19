export type ThemePreference = "light" | "dark" | "system"
export const THEME_STORAGE_KEY = "simulator-theme"
export const isTheme = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system"

// Runs before the first paint, including on the static export.
export const THEME_INIT_SCRIPT = `(()=>{let t='light';try{const s=localStorage.getItem('${THEME_STORAGE_KEY}');if(['light','dark','system'].includes(s))t=s}catch{}const d=t==='dark'||(t==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);const r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.dataset.themePreference=t;r.style.colorScheme=d?'dark':'light'})()`
