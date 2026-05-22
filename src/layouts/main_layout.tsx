import * as React from 'react'

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-10 shrink-0 bg-gray-100 dark:bg-gray-800">
        <div className="flex items-center justify-center p-4 text-center text-gray-600 dark:text-gray-300">
          Header (placeholder)
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center">
        {children}
      </main>

      <footer className="shrink-0 bg-gray-100 dark:bg-gray-800">
        <div className="flex items-center justify-center p-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Footer (placeholder)
        </div>
      </footer>
    </div>
  )
}