"use client"

import React from "react"

interface HeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function Header({
  title,
  description,
  children,
}: HeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
      </div>
    </header>
  )
}
