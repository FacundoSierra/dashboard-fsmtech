import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, ZONA_TOQUE } from '@/components/estilos';
import { Encabezado, Filtro, Tarjeta } from '@/components/ui';
import { GRUPOS_BUSQUEDA, buscar, esGrupoBusqueda, sinTildes, type GrupoBusqueda } from '@/lib/boveda/busqueda';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Buscar' };

/** Los que se ven de golpe, y los que añade cada «Ver más»: con 50 de una vez eran siete pantallas */
const POR_TANDA = 20;

function hrefBusqueda(consulta: string, grupo?: GrupoBusqueda, ver?: number): string {
  const parametros = new URLSearchParams({ q: consulta });
  if (grupo) parametros.set('carpeta', grupo);
  if (ver) parametros.set('ver', String(ver));
  return `/buscar?${parametros}`;
}

export default async function PaginaBuscar({ searchParams }: PageProps<'/buscar'>) {
  const { q, carpeta, ver } = await searchParams;
  const consulta = typeof q === 'string' ? q.trim().slice(0, 200) : '';
  const grupo = esGrupoBusqueda(carpeta) ? carpeta : undefined;
  const cuantos = Math.max(POR_TANDA, Math.min(Number(typeof ver === 'string' ? ver : 0) || 0, 2000));
  const boveda = await obtenerBoveda();
  const todos = consulta ? buscar(boveda, consulta) : [];
  const deLaCarpeta = grupo ? todos.filter((r) => r.grupo === grupo) : todos;
  const resultados = deLaCarpeta.slice(0, cuantos);
  const grupos = (Object.keys(GRUPOS_BUSQUEDA) as GrupoBusqueda[])
    .map((valor) => ({ valor, total: todos.filter((r) => r.grupo === valor).length }))
    .filter((g) => g.total > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Buscar" />

      {/* El buscador de la cabecera no sale en esta página: con los dos, uno vacío y otro con la consulta */}
      <Form action="/buscar" className="mb-5 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={consulta}
          autoFocus={!consulta}
          placeholder="Clientes, proyectos, tareas, ideas…"
          aria-label="Buscar en las notas"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-2 outline-none focus:border-acento focus:ring-2 focus:ring-acento/30"
        />
        <button type="submit" className={BOTON_PRINCIPAL}>
          Buscar
        </button>
      </Form>

      {consulta && todos.length > 0 && grupos.length > 1 && (
        <nav aria-label="Por carpeta" className="mb-4 flex flex-wrap gap-2">
          <Filtro href={hrefBusqueda(consulta)} activo={!grupo}>
            Todo · {todos.length}
          </Filtro>
          {grupos.map((g) => (
            <Filtro key={g.valor} href={hrefBusqueda(consulta, g.valor)} activo={grupo === g.valor}>
              {GRUPOS_BUSQUEDA[g.valor]} · {g.total}
            </Filtro>
          ))}
        </nav>
      )}

      {consulta && (
        <p className="mb-3 text-sm text-tenue" role="status">
          {todos.length === 0
            ? `Sin resultados para «${consulta}».`
            : grupo && deLaCarpeta.length === 0
              ? `Nada en ${GRUPOS_BUSQUEDA[grupo]}.`
              : `${deLaCarpeta.length} ${deLaCarpeta.length === 1 ? 'resultado' : 'resultados'}${grupo ? ` en ${GRUPOS_BUSQUEDA[grupo]}` : ''}`}
        </p>
      )}

      <ul className="space-y-3">
        {resultados.map((resultado) => (
          <li key={resultado.nota.ruta}>
            <Tarjeta>
              <Link href={hrefNota(resultado.nota.ruta)} className={`${ZONA_TOQUE} font-medium hover:text-acento`}>
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

      {deLaCarpeta.length > resultados.length && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Sin `scroll`: la página no salta arriba, sigue donde estaba y aparecen los siguientes */}
          <Link href={hrefBusqueda(consulta, grupo, cuantos + POR_TANDA)} scroll={false} className={BOTON_SECUNDARIO}>
            Ver más
          </Link>
          <p className="text-sm text-tenue">
            Se ven {resultados.length} de {deLaCarpeta.length}
          </p>
        </div>
      )}
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
      <mark key={inicio} className="rounded bg-acento-suave px-0.5 text-inherit">
        {texto.slice(inicio, fin)}
      </mark>,
    );
    cursor = fin;
  }
  partes.push(texto.slice(cursor));
  return <>{partes}</>;
}
