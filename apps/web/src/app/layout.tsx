import type { Metadata } from 'next';
import { Jost } from 'next/font/google';

import { Providers } from '@/components/providers/Providers';

import './globals.css';

const jost = Jost({
  variable: '--font-jost',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ruanasa Space',
  description:
    'Platform manajemen event wellness: daftar, bayar, dan ikuti kelas yoga dengan mudah.',
};

/**
 * Root layout aplikasi.
 *
 * @param props - `children` halaman aktif.
 * @returns Struktur HTML dasar dengan font dan provider global.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="id">
      <body className={jost.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
