import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bell, Inbox, Plus } from 'lucide-react';
import { BarraOrdenes } from '@/components/barra-ordenes';
import { BuscadorCabecera } from '@/components/buscador-cabecera';
import { BOTON_ICONO, ZONA_TOQUE } from '@/components/estilos';
import { BarraInferior, BarraLateral, Marca } from '@/components/navegacion';
import { verificarSesion } from '@/lib/sesion';

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  await verificarSesion();

  // El armazón, como la referencia: en el escritorio, una ventana blanca con tres islas grises
  // (el menú, la barra de arriba y la página) separadas 12 px, y las tarjetas blancas dentro de la
  // página. En el móvil, el gris es el suelo y la barra de abajo lleva las secciones. La página se
  // desplaza entera (no la isla), para que las anclas, el desplazamiento y la impresión sigan igual
  return (
    <div className="min-h-screen lg:bg-ventana lg:px-3 lg:pb-3 print:bg-transparent print:p-0">
      {/* Lo primero que alcanza el Tab: sin él, hay que pasar por todo el menú antes de llegar a la página */}
      {/* Fuera de la pantalla, por arriba, hasta que llega el foco (con `sr-only` perdía el relleno al verse) */}
      <a
        href="#contenido"
        className="no-imprimir fixed left-3 top-3 z-50 -translate-y-[200%] rounded-full bg-acento-fuerte px-4 py-3 text-sm font-semibold text-white focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <BarraLateral />

      <div className="lg:pl-[15.75rem] print:pl-0">
        {/* Opaca: lo que pasa por debajo al desplazarse no se transparenta. En el escritorio, la franja
            blanca de arriba es la de la ventana y la isla va dentro */}
        <header className="no-imprimir sticky top-0 z-20 bg-fondo lg:bg-ventana lg:pt-3">
          <div className="mx-auto flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:h-[4.5rem] lg:rounded-2xl lg:bg-fondo lg:px-5">
            <Link href="/" className={`${ZONA_TOQUE} flex items-center rounded-full lg:hidden`} aria-label="Inicio">
              <Marca />
            </Link>

            {/* El buscador en píldora y, dentro, el atajo de la barra de órdenes (en el móvil, un botón redondo) */}
            <BuscadorCabecera>
              <BarraOrdenes />
            </BuscadorCabecera>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link href="/capturar" className={`${BOTON_ICONO} max-lg:border-acento-fuerte max-lg:bg-acento-fuerte max-lg:text-white`}>
                <Plus className="size-5" aria-hidden />
                <span className="sr-only">Apuntar</span>
              </Link>
              <Link href="/inbox" className={`${BOTON_ICONO} max-lg:hidden`}>
                <Inbox className="size-5" aria-hidden />
                <span className="sr-only">Inbox</span>
              </Link>
              <Link href="/estado" className={`${BOTON_ICONO} max-lg:hidden`}>
                <Bell className="size-5" aria-hidden />
                <span className="sr-only">Avisos, en Estado</span>
              </Link>
              {/* Quién eres, como en la referencia: lleva a los dispositivos con los que entras */}
              <Link href="/ajustes" className="ml-2 hidden min-h-11 items-center gap-3 rounded-full pr-2 hover:text-acento lg:flex">
                <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-acento-suave text-sm font-semibold text-acento">
                  FS
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">Facundo Sierra</span>
                  <span className="block text-[13px] text-tenue">Ajustes</span>
                </span>
              </Link>
            </div>
          </div>
        </header>

        {/* La isla de la página: en el escritorio, gris y redondeada; en el móvil, el propio suelo */}
        <div className="lg:mt-3 lg:min-h-[calc(100dvh-6.75rem)] lg:rounded-2xl lg:bg-fondo print:min-h-0 print:rounded-none print:bg-transparent">
          {/* `tabIndex={-1}`: el salto lleva el foco aquí, y el siguiente Tab sigue por la página */}
          <main id="contenido" tabIndex={-1} className="mx-auto max-w-[90rem] px-4 pb-28 pt-5 outline-none sm:px-6 lg:px-7 lg:pb-8 lg:pt-7 print:p-0">
            {children}
          </main>
        </div>
      </div>

      <BarraInferior />
    </div>
  );
}
