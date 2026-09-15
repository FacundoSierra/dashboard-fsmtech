import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Encabezado, Tarjeta } from '@/components/ui';
import { buscar, sinTildes } from '@/lib/boveda/busqueda';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Buscar' };

export default async function PaginaBuscar({ searchParams }: PageProps<'/buscar'>) {
  const { q } = await searchParams;
  const consulta = typeof q === 'string' ? q.trim().slice(0, 200) : '';
  const boveda = await obtenerBoveda();
  const resultados = consulta ? buscar(boveda, consulta) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Buscar" />

      <Form action="/buscar" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={consulta}
          autoFocus={!consulta}
          placeholder="Clientes, proyectos, tareas, ideas…"
          aria-label="Buscar en las notas"
          className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-2 outline-none focus:border-acento focus:ring-2 focus:ring-acento/30"
        />
        <button type="submit" className="rounded-lg bg-acento px-4 py-2 font-medium text-white">
          Buscar
        </button>
      </Form>

      {consulta && (
        <p className="mb-3 text-sm text-tenue">
          {resultados.length === 0
            ? `Sin resultados para «${consulta}».`
            : `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`}
        </p>
      )}

      <ul className="space-y-3">
        {resultados.map((resultado) => (
          <li key={resultado.nota.ruta}>
            <Tarjeta>
              <Link href={hrefNota(resultado.nota.ruta)} className="font-medium hover:text-acento">
                <Resaltado texto={resultado.nota.titulo} terminos={resultado.terminos} />
              </Link>
              <p className="break-all font-mono text-xs text-tenue">{resultado.nota.ruta}</p>
              {resultado.fragmento && (
                <p className="mt-2 text-sm leading-relaxed">
                  <Resaltado texto={resultado.fragmento} terminos={resultado.terminos} />
                </p>
              )}
            </Tarjeta>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resaltado({ texto, terminos }: { texto: string; terminos: string[] }) {
  const normalizado = sinTildes(texto);
  // Si normalizar cambia la longitud no se pueden casar las posiciones: se muestra sin resaltar
  if (normalizado.length !== texto.length) return <>{texto}</>;

  const tramos: [number, number][] = [];
  for (const termino of terminos) {
    for (let i = normalizado.indexOf(termino); i !== -1; i = normalizado.indexOf(termino, i + termino.length)) {
      tramos.push([i, i + termino.length]);
    }
  }
  tramos.sort((a, b) => a[0] - b[0]);

  const partes: ReactNode[] = [];
  let cursor = 0;
  for (const [inicio, fin] of tramos) {
    if (inicio < cursor) continue;
    if (inicio > cursor) partes.push(texto.slice(cursor, inicio));
    partes.push(
      <mark key={inicio} className="rounded bg-aviso/25 px-0.5 text-inherit">
        {texto.slice(inicio, fin)}
      </mark>,
    );
    cursor = fin;
  }
  partes.push(texto.slice(cursor));
  return <>{partes}</>;
}
