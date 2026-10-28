'use client';

import Form from 'next/form';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';

/**
 * El buscador de la cabecera. En `/buscar` no sale: la página ya tiene el suyo, con la consulta
 * escrita, y con los dos se veía uno vacío encima del otro
 */
export function BuscadorCabecera() {
  const ruta = usePathname();
  if (ruta === '/buscar') return null;

  return (
    <Form action="/buscar" className="relative min-w-0 flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-apagado" aria-hidden />
      <input
        type="search"
        name="q"
        placeholder="Buscar en las notas"
        aria-label="Buscar en las notas"
        className="h-11 w-full rounded-lg border border-borde bg-superficie pl-8 pr-3 text-sm outline-none placeholder:text-apagado focus:border-acento focus:ring-2 focus:ring-acento/25"
      />
    </Form>
  );
}
