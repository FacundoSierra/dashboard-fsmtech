'use client';

import Form from 'next/form';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { BOTON_PRINCIPAL, CAMPO } from './estilos';

/**
 * `/nota/clientes/cni/reuniones/2026-10-28-cni-precios` → «cni precios»: el nombre de la nota, sin
 * la fecha del principio (si se renombró, suele ser lo que cambia) y con espacios
 */
function terminoDe(ruta: string): string {
  const ultimo = ruta.split('/').filter(Boolean).at(-1) ?? '';
  let nombre = ultimo;
  try {
    nombre = decodeURIComponent(ultimo);
  } catch {
    // Un `%` suelto: se busca tal cual
  }
  const sinFecha = nombre.replace(/^\d{4}-\d{2}-\d{2}-(?=.)/, '');
  return sinFecha.replace(/[-_]+/g, ' ').trim();
}

/**
 * El título y el buscador de la página de «no está»: necesita la ruta, que solo se lee en el navegador.
 * Si era una nota, lo dice y propone buscarla por su nombre
 */
export function BuscarLoQueFalta() {
  const ruta = usePathname();
  const esNota = ruta.startsWith('/nota/');
  const termino = terminoDe(ruta);

  return (
    <>
      <h1 className="text-lg font-semibold">{esNota ? 'Esa nota ya no está aquí' : 'Esta página no existe'}</h1>
      <p className="mt-2 text-sm text-tenue">
        {esNota
          ? 'Puede que se haya renombrado o movido en Obsidian. Búscala por su nombre:'
          : 'Puede que el enlace esté mal escrito. Busca lo que querías en las notas:'}
      </p>
      <Form action="/buscar" className="mt-4 flex gap-2 text-left">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar en las notas</span>
          <input type="search" name="q" defaultValue={termino} className={CAMPO} />
        </label>
        <button type="submit" className={BOTON_PRINCIPAL}>
          <Search className="size-4" aria-hidden />
          Buscar
        </button>
      </Form>
    </>
  );
}
