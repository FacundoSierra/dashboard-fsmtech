import type { Metadata } from 'next';
import Link from 'next/link';
import { Markdown } from '@/components/markdown';
import { Chip, Encabezado, Tarjeta, Vacio, type Tono } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { capturas } from '@/lib/boveda/inbox';
import { cuandoEs, fechaLarga, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Inbox' };

const TONO_CATEGORIA: Record<string, Tono> = { idea: 'acento', tarea: 'aviso', nota: 'neutro' };

export default async function PaginaInbox({ searchParams }: PageProps<'/inbox'>) {
  const boveda = await obtenerBoveda();
  const { guardada } = await searchParams;
  const hoy = hoyMadrid();
  const lista = capturas(boveda);

  return (
    <>
      <Encabezado titulo="Inbox" subtitulo={`${lista.length} ${lista.length === 1 ? 'nota pendiente' : 'notas pendientes'} de procesar`} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/capturar" className="rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white">
          + Apuntar
        </Link>
        <p className="text-sm text-tenue">Procésalas en Obsidian: muévelas a su sitio o conviértelas en tareas.</p>
      </div>

      {typeof guardada === 'string' && (
        <p role="status" className="mb-4 rounded-xl bg-ok/15 px-3 py-2 text-sm text-ok">
          Guardada en la bóveda. Llegará a Obsidian con la próxima sincronización.
        </p>
      )}

      {lista.length === 0 ? (
        <Vacio>El inbox está vacío.</Vacio>
      ) : (
        <ul className="space-y-3">
          {lista.map((captura) => (
            <li key={captura.nota.ruta}>
              <Tarjeta>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={hrefNota(captura.nota.ruta)} className="font-medium leading-snug hover:text-acento">
                    {captura.nota.titulo}
                  </Link>
                  {captura.categoria && (
                    <Chip tono={TONO_CATEGORIA[captura.categoria] ?? 'neutro'}>{captura.categoria}</Chip>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-tenue first-letter:uppercase">
                  {[captura.fecha && `${fechaLarga(captura.fecha)} (${cuandoEs(captura.fecha, hoy)})`, captura.hora]
                    .filter(Boolean)
                    .join(' · ')}
                  {captura.relacionada && boveda.rutas[captura.relacionada] && (
                    <>
                      {' · '}
                      <Link href={hrefNota(boveda.rutas[captura.relacionada])} className="hover:text-acento">
                        {boveda.titulos[captura.relacionada]}
                      </Link>
                    </>
                  )}
                </p>
                {captura.resumen && (
                  <div className="mt-2 text-sm">
                    <Markdown texto={captura.resumen} rutas={boveda.rutas} />
                  </div>
                )}
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
