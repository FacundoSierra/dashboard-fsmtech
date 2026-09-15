import Link from 'next/link';
import type { ReactNode } from 'react';
import { cerrarSesion } from '@/app/login/acciones';
import { Navegacion } from '@/components/navegacion';
import { verificarSesion } from '@/lib/sesion';

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  await verificarSesion();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borde bg-fondo/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-nowrap sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          FSMTECH
        </Link>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          <Navegacion />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <Link href="/buscar" aria-label="Buscar" className="rounded-lg p-2 text-tenue hover:text-texto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <Link href="/capturar" className="whitespace-nowrap rounded-lg bg-acento px-3 py-1.5 text-sm font-medium text-white">
            + Apuntar
          </Link>
          <form action={cerrarSesion}>
            <button type="submit" className="px-2 py-1.5 text-sm text-tenue hover:text-texto">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 py-6 sm:py-8">{children}</main>
    </div>
  );
}
