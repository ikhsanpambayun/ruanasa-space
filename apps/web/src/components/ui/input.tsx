import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Komponen input teks. Tinggi 44px di mobile dan 40px di desktop, radius 4px (UIUX Spec 3.4).
 *
 * @param props - Atribut input native.
 * @returns Elemen input yang sudah di-style.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-sm border border-input bg-card px-3 text-body-md text-foreground transition-colors file:border-0 file:bg-transparent placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:h-10',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
