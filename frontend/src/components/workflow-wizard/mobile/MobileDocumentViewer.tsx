/**
 * MobileDocumentViewer Component
 * 
 * Touch-optimized document viewer with pinch-to-zoom and swipe navigation.
 * Supports PDF and HTML content viewing on mobile devices.
 * 
 * Requirements: 15.4
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  RotateCw,
  Maximize2,
  X,
  FileText,
  Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface MobileDocumentViewerProps {
  /** Document URL or content */
  src: string
  /** Document type */
  type: 'pdf' | 'html' | 'image'
  /** Document title */
  title?: string
  /** Total number of pages (for PDF) */
  totalPages?: number
  /** Initial page number */
  initialPage?: number
  /** Callback when page changes */
  onPageChange?: (page: number) => void
  /** Callback when viewer is closed */
  onClose?: () => void
  /** Whether to show in fullscreen mode */
  fullscreen?: boolean
  /** Custom class name */
  className?: string
}

interface TouchState {
  startX: number
  startY: number
  startDistance: number
  startScale: number
  isDragging: boolean
  isPinching: boolean
}

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SWIPE_THRESHOLD = 50

export function MobileDocumentViewer({
  src,
  type,
  title = 'Document',
  totalPages = 1,
  initialPage = 1,
  onPageChange,
  onClose,
  fullscreen = false,
  className,
}: MobileDocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(fullscreen)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const touchState = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startDistance: 0,
    startScale: 1,
    isDragging: false,
    isPinching: false,
  })

  // Reset position when scale changes to 1
  useEffect(() => {
    if (scale === 1) {
      setPosition({ x: 0, y: 0 })
    }
  }, [scale])

  // Notify parent of page changes
  useEffect(() => {
    onPageChange?.(currentPage)
  }, [currentPage, onPageChange])

  // Calculate distance between two touch points
  const getDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches
    
    if (touches.length === 1) {
      // Single touch - prepare for drag or swipe
      touchState.current = {
        ...touchState.current,
        startX: touches[0].clientX - position.x,
        startY: touches[0].clientY - position.y,
        isDragging: scale > 1, // Only drag when zoomed in
        isPinching: false,
      }
    } else if (touches.length === 2) {
      // Two finger touch - prepare for pinch zoom
      touchState.current = {
        ...touchState.current,
        startDistance: getDistance(touches),
        startScale: scale,
        isDragging: false,
        isPinching: true,
      }
    }
  }, [position, scale])

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches
    
    if (touchState.current.isPinching && touches.length === 2) {
      // Pinch to zoom
      e.preventDefault()
      const currentDistance = getDistance(touches)
      const scaleFactor = currentDistance / touchState.current.startDistance
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, touchState.current.startScale * scaleFactor)
      )
      setScale(newScale)
    } else if (touchState.current.isDragging && touches.length === 1) {
      // Drag when zoomed
      e.preventDefault()
      const newX = touches[0].clientX - touchState.current.startX
      const newY = touches[0].clientY - touchState.current.startY
      setPosition({ x: newX, y: newY })
    }
  }, [])

  // Handle touch end
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const changedTouches = e.changedTouches
    
    if (!touchState.current.isPinching && !touchState.current.isDragging && changedTouches.length === 1) {
      // Check for swipe gesture (page navigation)
      const endX = changedTouches[0].clientX
      const startX = touchState.current.startX + position.x
      const deltaX = endX - startX
      
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && scale === 1) {
        if (deltaX > 0 && currentPage > 1) {
          // Swipe right - previous page
          setCurrentPage(prev => prev - 1)
        } else if (deltaX < 0 && currentPage < totalPages) {
          // Swipe left - next page
          setCurrentPage(prev => prev + 1)
        }
      }
    }
    
    touchState.current = {
      ...touchState.current,
      isDragging: false,
      isPinching: false,
    }
  }, [currentPage, totalPages, position, scale])

  // Zoom controls
  const handleZoomIn = () => {
    setScale(prev => Math.min(MAX_SCALE, prev + 0.5))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(MIN_SCALE, prev - 0.5))
  }

  const handleResetZoom = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // Page navigation
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
      handleResetZoom()
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
      handleResetZoom()
    }
  }

  // Toggle fullscreen
  const handleToggleFullscreen = () => {
    setIsFullscreen(prev => !prev)
  }

  // Handle content load
  const handleLoad = () => {
    setIsLoading(false)
    setError(null)
  }

  // Handle content error
  const handleError = () => {
    setIsLoading(false)
    setError('Failed to load document')
  }

  // Render document content based on type
  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileText className="h-12 w-12 mb-4" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setError(null)}>
            Retry
          </Button>
        </div>
      )
    }

    switch (type) {
      case 'pdf':
        return (
          <iframe
            src={`${src}#page=${currentPage}`}
            className="w-full h-full border-0"
            onLoad={handleLoad}
            onError={handleError}
            title={title}
          />
        )
      case 'html':
        return (
          <iframe
            src={src}
            className="w-full h-full border-0"
            onLoad={handleLoad}
            onError={handleError}
            title={title}
            sandbox="allow-same-origin"
          />
        )
      case 'image':
        return (
          <img
            src={src}
            alt={title}
            className="max-w-full max-h-full object-contain"
            onLoad={handleLoad}
            onError={handleError}
          />
        )
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-background',
        isFullscreen ? 'fixed inset-0 z-50' : 'relative h-full',
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="touch-manipulation h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <span className="text-sm font-medium truncate">{title}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFullscreen}
            className="touch-manipulation h-10 w-10"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.open(src, '_blank')}
            className="touch-manipulation h-10 w-10"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
        
        <div
          ref={contentRef}
          className="w-full h-full transition-transform duration-100"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {renderContent()}
        </div>
      </div>

      {/* Controls Footer */}
      <div className="flex-shrink-0 border-t bg-card safe-area-inset-bottom">
        {/* Zoom Controls */}
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-b">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            className="touch-manipulation h-10 w-10"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetZoom}
            className="touch-manipulation min-w-[60px]"
          >
            {Math.round(scale * 100)}%
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            disabled={scale >= MAX_SCALE}
            className="touch-manipulation h-10 w-10"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleResetZoom}
            className="touch-manipulation h-10 w-10 ml-2"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Page Navigation (for multi-page documents) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePreviousPage}
              disabled={currentPage <= 1}
              className="touch-manipulation min-h-[44px]"
            >
              <ChevronLeft className="h-5 w-5 mr-1" />
              Previous
            </Button>
            
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            
            <Button
              variant="outline"
              size="lg"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="touch-manipulation min-h-[44px]"
            >
              Next
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Hook for managing document viewer state
 */
export function useMobileDocumentViewer() {
  const [isOpen, setIsOpen] = useState(false)
  const [document, setDocument] = useState<{
    src: string
    type: 'pdf' | 'html' | 'image'
    title?: string
    totalPages?: number
  } | null>(null)

  const openDocument = useCallback((doc: typeof document) => {
    setDocument(doc)
    setIsOpen(true)
  }, [])

  const closeDocument = useCallback(() => {
    setIsOpen(false)
    setDocument(null)
  }, [])

  return {
    isOpen,
    document,
    openDocument,
    closeDocument,
  }
}
