'use client';

import Form from 'next/form';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

/**
 * El buscador de la cabecera, en píldora blanca sobre el gris, con el atajo de la barra de órdenes
 * dentro, a la derecha (`children`, el botón de `BarraOrdenes`): desde 768 px es la pastilla
 * «Ctrl K»; en el móvil, un botón redondo al lado. En `/buscar` el buscador no sale (la página ya
 * tiene el suyo, con la consulta escrita) y queda solo el atajo
 */
export function BuscadorCabecera({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  // Con su frase al lado: la pastilla sola, a la izquierda de la cabecera, parecía que se había quedado ahí
  if (ruta === '/buscar')
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {children}
        <span aria-hidden className="hidden truncate text-[13px] text-tenue md:inline">
          para ir a cualquier sección o nota
        </span>
      </div>
    );

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2 md:max-w-md">
      <Form action="/buscar" className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-tenue" aria-hidden />
        <input
          type="search"
          name="q"
          placeholder="Buscar en las notas"
          aria-label="Buscar en las notas"
          className="h-11 w-full rounded-full border border-borde-control bg-superficie pl-11 pr-4 text-sm outline-none placeholder:text-apagado focus:border-acento focus:ring-2 focus:ring-acento/25 md:h-12 md:pr-24"
        />
      </Form>
      <div className="shrink-0 md:absolute md:right-2 md:top-1/2 md:-translate-y-1/2">{children}</div>
    </div>
  );
}
