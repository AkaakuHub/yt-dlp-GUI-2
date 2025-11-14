import React, { forwardRef } from 'react'
import { cn } from './cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-[var(--border-primary)] bg-[var(--input-background)] px-2 text-[var(--text-primary)] outline-none ring-0',
        'transition-colors focus:border-[var(--accent-primary)]',
        className,
      )}
      {...props}
    />
  ),
)

Input.displayName = 'Input'

