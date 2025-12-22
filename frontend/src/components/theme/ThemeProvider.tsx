import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useBranding, type BrandingConfig } from '@/hooks/useBranding'

interface ThemeContextValue {
  branding: BrandingConfig | null
  applyBranding: (branding: Partial<BrandingConfig>) => void
  resetToDefault: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// Convert hex color to HSL values for CSS custom properties
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { h: 0, s: 0, l: 0 }

  const r = parseInt(result[1], 16) / 255
  const g = parseInt(result[2], 16) / 255
  const b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

// Generate CSS custom property value from hex
function hexToHSLString(hex: string): string {
  const { h, s, l } = hexToHSL(hex)
  return `${h} ${s}% ${l}%`
}

// Generate a lighter version of a color for foreground
function getLighterHSL(hex: string): string {
  const { h, s } = hexToHSL(hex)
  return `${h} ${s}% 98%`
}

// Generate a darker version of a color for foreground
function getDarkerHSL(hex: string): string {
  const { h, s } = hexToHSL(hex)
  return `${h} ${Math.min(s + 10, 100)}% 11%`
}

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { data: branding } = useBranding()
  const [localBranding, setLocalBranding] = useState<BrandingConfig | null>(null)

  const applyThemeToDOM = useCallback((config: Partial<BrandingConfig>) => {
    const root = document.documentElement

    if (config.primaryColor) {
      root.style.setProperty('--primary', hexToHSLString(config.primaryColor))
      root.style.setProperty('--primary-foreground', getLighterHSL(config.primaryColor))
      root.style.setProperty('--ring', hexToHSLString(config.primaryColor))
    }

    if (config.secondaryColor) {
      root.style.setProperty('--secondary', hexToHSLString(config.secondaryColor))
      root.style.setProperty('--secondary-foreground', getDarkerHSL(config.secondaryColor))
    }

    if (config.accentColor) {
      root.style.setProperty('--accent', hexToHSLString(config.accentColor))
      root.style.setProperty('--accent-foreground', getDarkerHSL(config.accentColor))
    }

    // Apply chart palette as CSS custom properties
    if (config.chartPalette) {
      config.chartPalette.forEach((color, index) => {
        root.style.setProperty(`--chart-${index + 1}`, color)
      })
    }

    // Apply favicon if provided
    if (config.faviconUrl) {
      const existingFavicon = document.querySelector('link[rel="icon"]')
      if (existingFavicon) {
        existingFavicon.setAttribute('href', config.faviconUrl)
      } else {
        const favicon = document.createElement('link')
        favicon.rel = 'icon'
        favicon.href = config.faviconUrl
        document.head.appendChild(favicon)
      }
    }

    // Update document title with tenant name if available
    if (config.tenantId && config.tenantId !== 'default') {
      // Could be extended to include tenant name
    }
  }, [])

  const resetToDefault = useCallback(() => {
    const root = document.documentElement
    
    // Reset to default values
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    root.style.removeProperty('--secondary')
    root.style.removeProperty('--secondary-foreground')
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-foreground')
    root.style.removeProperty('--ring')
    
    // Reset chart colors
    for (let i = 1; i <= 6; i++) {
      root.style.removeProperty(`--chart-${i}`)
    }
  }, [])

  const applyBranding = useCallback((config: Partial<BrandingConfig>) => {
    applyThemeToDOM(config)
    setLocalBranding((prev) => prev ? { ...prev, ...config } : null)
  }, [applyThemeToDOM])

  // Apply branding when it loads from the server
  useEffect(() => {
    if (branding) {
      setLocalBranding(branding)
      applyThemeToDOM(branding)
    }
  }, [branding, applyThemeToDOM])

  return (
    <ThemeContext.Provider value={{ branding: localBranding, applyBranding, resetToDefault }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
