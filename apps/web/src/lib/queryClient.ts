import { QueryClient } from '@tanstack/react-query';

/**
 * Membuat QueryClient TanStack Query v5 dengan default aplikasi.
 *
 * @returns Instance QueryClient baru (satu per sesi browser, dibuat di Providers).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
