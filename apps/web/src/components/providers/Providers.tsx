'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { createQueryClient } from '@/lib/queryClient';

/**
 * Provider global client-side: TanStack Query (+ devtools di development) dan toast Sonner (auto-dismiss 4 detik).
 *
 * @param props - `children` yang dibungkus provider.
 * @returns Children dalam provider.
 */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" duration={4000} richColors />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
