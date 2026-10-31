import type { Metadata } from 'next';
import Link from 'next/link';
import { Markdown } from '@/components/markdown';
import { Inbox, Plus } from 'lucide-react';
import { Chip, EnlaceBoton, Encabezado, Estado, Tarjeta, Vacio, type Tono } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { capturas } from '@/lib/boveda/inbox';
import { cuandoEs, fechaLarga, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Inbox' };

const TONO_CATEGORIA: Record<string, Tono> = { idea: 'acento', tarea: 'neutro', nota: 'neutro' };

export default async function PaginaInbox({ searchParams }: PageProps<'/inbox'>) {
  const boveda = await obtenerBoveda();
  const { guardada } = await searchParams;
  const hoy = hoyMadrid();
  const lista = capturas(boveda);

  return (
    <>
      <Encabezado
        titulo="Inbox"
        subtitulo={`${lista.length} ${lista.length === 1 ? 'nota pendiente' : 'notas pendientes'} de procesar`}
        acciones={
          <EnlaceBoton href="/capturar" icono={Plus} principal>
            Apuntar
          </EnlaceBoton>
        }
      />

      {typeof guardada === 'string' && (
        <p role="status" className="mb-3 rounded-xl bg-superficie px-5 py-3.5 sm:mb-4 sm:px-6">
          <Estado nivel="bien">Guardada en la bóveda. Llegará a Obsidian en unos minutos, en cuanto tu PC sincronice.</Estado>
        </p>
      )}

      {/* Una tarjeta con una fila por nota, como las listas de Hoy; al pie, qué se hace con ellas */}
      <Tarjeta sinRelleno>
        {lista.length === 0 ? (
          <div className="p-5 sm:p-6">
            <Vacio icono={Inbox}>El inbox está vacío.</Vacio>
          </div>
        ) : (
        <ul className="divide-y divide-borde">
          {lista.map((captura) => (
            <li key={captura.nota.ruta} className="px-5 py-4 sm:px-6">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={hrefNota(captura.nota.ruta)} className="text-[15px] font-semibold leading-snug hover:text-acento">
                    {captura.nota.titulo}
                  </Link>
                  {captura.categoria && (
                    <Chip tono={TONO_CATEGORIA[captura.categoria] ?? 'neutro'}>{captura.categoria}</Chip>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-tenue first-letter:uppercase">
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
                    <Markdown texto={captura.resumen} rutas={boveda.rutas} titulos={boveda.titulos} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        )}
        <p className="border-t border-borde px-5 py-3.5 text-[13px] text-tenue sm:px-6">
          Procésalas en Obsidian: muévelas a su sitio o conviértelas en tareas.
        </p>
      </Tarjeta>
    </>
  );
}
