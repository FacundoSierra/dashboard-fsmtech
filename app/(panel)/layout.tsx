import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { BarraOrdenes } from '@/components/barra-ordenes';
import { BuscadorCabecera } from '@/components/buscador-cabecera';
import { ZONA_TOQUE } from '@/components/estilos';
import { BarraInferior, BarraLateral, Marca } from '@/components/navegacion';
import { verificarSesion } from '@/lib/sesion';

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  await verificarSesion();

  return (
    <div className="min-h-screen">
      {/* Lo primero que alcanza el Tab: sin él, hay que pasar por todo el menú antes de llegar a la página */}
      {/* Fuera de la pantalla, por arriba, hasta que llega el foco (con `sr-only` perdía el relleno al verse) */}
      <a
        href="#contenido"
        className="no-imprimir fixed left-3 top-3 z-50 -translate-y-[200%] rounded-lg bg-acento-fuerte px-4 py-3 text-sm font-medium text-white focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <BarraLateral />

      <div className="lg:pl-60 print:pl-0">
        <header className="no-imprimir sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <Link href="/" className={`${ZONA_TOQUE} flex items-center gap-2 rounded-lg lg:hidden`} aria-label="Inicio">
              <Marca />
            </Link>

            <BuscadorCabecera />

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <BarraOrdenes />
              <Link
                href="/capturar"
                className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-acento-fuerte px-3 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Apuntar</span>
                <span className="sr-only sm:hidden">Apuntar</span>
              </Link>
            </div>
          </div>
        </header>

        {/* `tabIndex={-1}`: el salto lleva el foco aquí, y el siguiente Tab sigue por la página */}
        <main id="contenido" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-6 outline-none sm:px-6 lg:pb-12 print:p-0">
          {children}
        </main>
      </div>

      <BarraInferior />
    </div>
  );
}
