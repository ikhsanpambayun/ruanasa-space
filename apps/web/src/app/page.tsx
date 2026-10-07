import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/**
 * Halaman sementara untuk memverifikasi design tokens dan komponen shadcn/ui.
 * Akan digantikan Event Listing di P8-FE-001.
 *
 * @returns Halaman verifikasi foundation.
 */
export default function Home(): React.JSX.Element {
  return (
    <main className="container py-8">
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Ruanasa Space</CardTitle>
          <CardDescription>Foundation frontend siap digunakan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input placeholder="Nomor WhatsApp" />
          <div className="flex gap-2">
            <Button>Daftar Sekarang</Button>
            <Button variant="secondary">Lihat Detail</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
