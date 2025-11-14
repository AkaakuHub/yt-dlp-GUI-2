import React from 'react'
import { cn } from './cn'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-[var(--border-primary)] bg-[var(--input-background)] px-2 text-[var(--text-primary)] outline-none ring-0',
        'transition-colors focus:border-[var(--accent-primary)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

