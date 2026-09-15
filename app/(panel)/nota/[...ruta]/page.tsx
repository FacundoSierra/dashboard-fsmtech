import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { Markdown } from '@/components/markdown';
import { Tarjeta, TituloBloque } from '@/components/ui';
import { buscarNota, notasQueEnlazan, obtenerBoveda } from '@/lib/boveda/consultas';
import { hrefNota } from '@/lib/rutas';

function valorPropiedad(valor: unknown): string {
  if (Array.isArray(valor)) return valor.map(valorPropiedad).join(', ');
  if (valor && typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function tieneValor(valor: unknown): boolean {
  return valor !== null && valor !== undefined && valor !== '' && !(Array.isArray(valor) && valor.length === 0);
}

export async function generateMetadata({ params }: PageProps<'/nota/[...ruta]'>): Promise<Metadata> {
  const { ruta } = await params;
  const nota = buscarNota(await obtenerBoveda(), ruta);
  return { title: nota?.titulo ?? 'Nota' };
}

export default async function PaginaNota({ params }: PageProps<'/nota/[...ruta]'>) {
  const { ruta } = await params;
  const boveda = await obtenerBoveda();
  const nota = buscarNota(boveda, ruta);
  if (!nota) notFound();

  const propiedades = Object.entries(nota.propiedades).filter(([, valor]) => tieneValor(valor));
  const entrantes = notasQueEnlazan(boveda, nota);

  return (
    <article className="mx-auto max-w-3xl">
      <p className="mb-3 break-all font-mono text-xs text-tenue">{nota.ruta}</p>

      {propiedades.length > 0 && (
        <Tarjeta className="mb-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {propiedades.map(([clave, valor]) => (
              <Fragment key={clave}>
                <dt className="text-tenue">{clave}</dt>
                <dd className="min-w-0 break-words">
                  <Markdown texto={valorPropiedad(valor)} rutas={boveda.rutas} enLinea />
                </dd>
              </Fragment>
            ))}
          </dl>
        </Tarjeta>
      )}

      <Markdown texto={nota.cuerpo} rutas={boveda.rutas} />

      {entrantes.length > 0 && (
        <Tarjeta className="mt-10">
          <TituloBloque>Enlazada desde</TituloBloque>
          <ul className="space-y-1.5 text-sm">
            {entrantes.map((otra) => (
              <li key={otra.ruta}>
                <Link href={hrefNota(otra.ruta)} className="hover:text-acento">
                  {otra.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </article>
  );
}
