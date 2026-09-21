import Form from 'next/form';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import { BarraInferior, BarraLateral, Marca } from '@/components/navegacion';
import { verificarSesion } from '@/lib/sesion';

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  await verificarSesion();

  return (
    <div className="min-h-screen">
      <BarraLateral />

      <div className="lg:pl-60 print:pl-0">
        <header className="no-imprimir sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Inicio">
              <Marca />
            </Link>

            <Form action="/buscar" className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-apagado" aria-hidden />
              <input
                type="search"
                name="q"
                placeholder="Buscar en las notas"
                aria-label="Buscar en las notas"
                className="h-9 w-full rounded-lg border border-borde bg-superficie pl-8 pr-3 text-sm outline-none placeholder:text-apagado focus:border-acento focus:ring-2 focus:ring-acento/25"
              />
            </Form>

            <Link
              href="/capturar"
              className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-acento-fuerte px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Apuntar</span>
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 print:p-0">{children}</main>
      </div>

      <BarraInferior />
    </div>
  );
}
