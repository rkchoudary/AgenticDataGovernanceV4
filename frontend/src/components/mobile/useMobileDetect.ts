import { useState, useEffect } from 'react'

interface MobileDetectResult {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouchDevice: boolean
  screenWidth: number
  screenHeight: number
  orientation: 'portrait' | 'landscape'
}

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

export function useMobileDetect(): MobileDetectResult {
  const [state, setState] = useState<MobileDetectResult>(() => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouchDevice: false,
        screenWidth: 1920,
        screenHeight: 1080,
        orientation: 'landscape',
      }
    }
    
    const width = window.innerWidth
    const height = window.innerHeight
    
    return {
      isMobile: width < MOBILE_BREAKPOINT,
      isTablet: width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT,
      isDesktop: width >= TABLET_BREAKPOINT,
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      screenWidth: width,
      screenHeight: height,
      orientation: width > height ? 'landscape' : 'portrait',
    }
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      
      setState({
        isMobile: width < MOBILE_BREAKPOINT,
        isTablet: width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT,
        isDesktop: width >= TABLET_BREAKPOINT,
        isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        screenWidth: width,
        screenHeight: height,
        orientation: width > height ? 'landscape' : 'portrait',
      })
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  return state
}

// Hook for responsive breakpoint checks
export function useBreakpoint() {
  const { isMobile, isTablet, isDesktop } = useMobileDetect()
  
  return {
    isMobile,
    isTablet,
    isDesktop,
    // Utility functions for conditional rendering
    showOnMobile: isMobile,
    showOnTablet: isTablet,
    showOnDesktop: isDesktop,
    hideOnMobile: !isMobile,
    hideOnTablet: !isTablet,
    hideOnDesktop: !isDesktop,
  }
}
