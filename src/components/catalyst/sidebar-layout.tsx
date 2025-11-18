'use client'

import React, { useState, useEffect, useRef } from 'react'

const MIN_WIDTH_PX = 200  
const MAX_WIDTH_PX = 480  
const DEFAULT_WIDTH_PX = 256

export function SidebarLayout({
  sidebar,
  titleBar,
  children,
}: React.PropsWithChildren<{ sidebar: React.ReactNode; titleBar?: React.ReactNode }>) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH_PX)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return

      const newWidth = e.clientX

      // Clamp between min and max
      const clampedWidth = Math.min(
        Math.max(newWidth, MIN_WIDTH_PX),
        MAX_WIDTH_PX
      )

      setSidebarWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return (
    <div
      ref={containerRef}
      className="relative isolate flex flex-col h-screen w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950"
    >
      {/* Title Bar - spans full width */}
      {titleBar && (
        <div className="fixed top-0 left-0 right-0 z-20">
          {titleBar}
        </div>
      )}

      {/* Main layout container - below title bar */}
      <div className="flex flex-1 min-h-0" style={{ paddingTop: titleBar ? '32px' : '0' }}>
        {/* Sidebar - resizable */}
        <div
          className="fixed bottom-0 left-0 overflow-y-auto"
          style={{
            width: `${sidebarWidth}px`,
            top: titleBar ? '32px' : '0'
          }}
        >
          {sidebar}
        </div>

        {/* Resize handle - positioned between sidebar and content */}
        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-valuenow={sidebarWidth}
          aria-valuemin={MIN_WIDTH_PX}
          aria-valuemax={MAX_WIDTH_PX}
          tabIndex={0}
          className="fixed z-10 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors"
          style={{
            left: `${sidebarWidth + 6}px`,
            top: titleBar ? '32px' : '0',
            bottom: '0'
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Wider hover target for better UX */}
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* Content */}
        <main
          className="flex flex-1 flex-col min-h-0"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <div className="flex-1 flex flex-col rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 min-h-0 overflow-auto m-2">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
