import Link from 'next/link';
import type { ReactNode } from 'react';
import { cerrarSesion } from '@/app/login/acciones';
import { Navegacion } from '@/components/navegacion';
import { verificarSesion } from '@/lib/sesion';

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  await verificarSesion();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-borde bg-fondo/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          FSMTECH
        </Link>
        <div className="min-w-0 flex-1">
          <Navegacion />
        </div>
        <form action={cerrarSesion}>
          <button type="submit" className="text-sm text-tenue hover:text-texto">
            Salir
          </button>
        </form>
      </header>
      <main className="flex-1 py-6 sm:py-8">{children}</main>
    </div>
  );
}
