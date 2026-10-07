import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Container Card. Padding 16px (mobile) dan 24px (desktop) diatur pada CardHeader/Content/Footer.
 *
 * @param props - Atribut div native.
 * @returns Elemen div bergaya card.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/**
 * Bagian header Card.
 *
 * @param props - Atribut div native.
 * @returns Elemen div header.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 p-4 md:p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

/**
 * Judul Card.
 *
 * @param props - Atribut div native.
 * @returns Elemen div judul.
 */
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-headline-sm text-foreground', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

/**
 * Deskripsi Card.
 *
 * @param props - Atribut div native.
 * @returns Elemen div deskripsi.
 */
const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-body-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

/**
 * Konten utama Card.
 *
 * @param props - Atribut div native.
 * @returns Elemen div konten.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0 md:p-6 md:pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/**
 * Footer Card.
 *
 * @param props - Atribut div native.
 * @returns Elemen div footer.
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center p-4 pt-0 md:p-6 md:pt-0', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
