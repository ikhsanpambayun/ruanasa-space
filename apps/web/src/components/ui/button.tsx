import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Varian Button sesuai TAD v1.6 Section 4.3 (primary, secondary, danger, text).
 * Tinggi 44px di mobile (tap target minimum), 40px di desktop.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-label-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-sand',
        outline: 'border border-border bg-card text-primary-dark hover:bg-accent',
        danger: 'bg-danger text-primary-foreground hover:bg-danger-dark',
        'danger-soft': 'bg-danger-light text-danger hover:bg-danger-light/70',
        text: 'text-primary hover:bg-accent',
      },
      size: {
        default: 'h-11 px-4 md:h-10',
        sm: 'h-9 px-3',
        lg: 'h-12 px-6',
        icon: 'size-11 md:size-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Komponen tombol dasar.
 *
 * @param props - Atribut button native, `variant`, `size`, dan `asChild` untuk merender elemen lain.
 * @returns Elemen button yang sudah di-style.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
