'use client'

import React from 'react'

export function SidebarLayout({
  sidebar,
  children,
}: React.PropsWithChildren<{ sidebar: React.ReactNode }>) {
  return (
    <div className="relative isolate flex h-screen w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar - always visible */}
      <div className="fixed inset-y-0 left-0 w-64 overflow-y-auto">{sidebar}</div>

      {/* Content */}
      <main className="flex flex-1 flex-col pb-2 pt-2 pr-2 pl-64 min-h-0">
        <div className="flex-1 flex flex-col p-6 rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 min-h-0 overflow-hidden">
          <div className="mx-auto max-w-6xl w-full flex-1 flex flex-col min-h-0">{children}</div>
        </div>
      </main>
    </div>
  )
}
