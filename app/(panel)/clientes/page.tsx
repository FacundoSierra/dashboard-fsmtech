import type { Metadata } from 'next';
import Link from 'next/link';
import { Markdown } from '@/components/markdown';
import { Chip, Encabezado, Fila, Tarjeta, Vacio, tonoEstado } from '@/components/ui';
import { clientes, obtenerBoveda } from '@/lib/boveda/consultas';
import { cuandoEs, fechaLarga, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Clientes' };

export default async function PaginaClientes() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const lista = clientes(boveda, hoy);

  return (
    <>
      <Encabezado titulo="Clientes" subtitulo={`${lista.length} clientes`} />
      {lista.length === 0 ? (
        <Vacio>No hay fichas de cliente.</Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((cliente) => {
            const reunion = cliente.proximaReunion;
            return (
              <Tarjeta key={cliente.nota.ruta} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-tight">
                      <Link href={hrefNota(cliente.nota.ruta)} className="hover:text-acento">
                        {cliente.nota.titulo}
                      </Link>
                    </h2>
                    {cliente.sector && <p className="mt-0.5 text-sm text-tenue">{cliente.sector}</p>}
                  </div>
                  {cliente.tareasAbiertas > 0 && <Chip tono="acento">{cliente.tareasAbiertas} pendientes</Chip>}
                </div>

                {reunion?.fecha && (
                  <Link
                    href={hrefNota(reunion.nota.ruta)}
                    className="block rounded-xl bg-acento-suave px-3 py-2 text-sm text-acento"
                  >
                    <span className="font-medium">Reunión {cuandoEs(reunion.fecha, hoy)}</span> · {fechaLarga(reunion.fecha)}
                    {reunion.hora && `, ${reunion.hora}`}
                  </Link>
                )}

                <div className="space-y-2 text-sm">
                  <Fila etiqueta="Proyectos">
                    {cliente.proyectos.length === 0
                      ? '—'
                      : cliente.proyectos.map((proyecto) => (
                          <Link
                            key={proyecto.nota.ruta}
                            href={hrefNota(proyecto.nota.ruta)}
                            className="inline-flex items-center gap-1.5 hover:text-acento"
                          >
                            {proyecto.nota.titulo.split(' — ')[0]}
                            <Chip tono={tonoEstado(proyecto.estado)}>{proyecto.estado}</Chip>
                          </Link>
                        ))}
                  </Fila>
                  <Fila etiqueta="Contactos">
                    {cliente.contactos.length === 0
                      ? '—'
                      : cliente.contactos.map((persona) => (
                          <Link key={persona.ruta} href={hrefNota(persona.ruta)} className="hover:text-acento">
                            {persona.titulo}
                          </Link>
                        ))}
                  </Fila>
                  {cliente.web && (
                    <Fila etiqueta="Web">
                      <a href={cliente.web} target="_blank" rel="noreferrer" className="truncate text-acento hover:underline">
                        {cliente.web.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </Fila>
                  )}
                </div>

                {cliente.ideas.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-tenue">
                      Ideas y oportunidades
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      {cliente.ideas.map((idea, i) => (
                        <li key={i}>
                          <Markdown texto={idea.texto} rutas={boveda.rutas} enLinea />{' '}
                          <Link href={hrefNota(idea.origen.ruta)} className="text-tenue hover:text-acento">
                            · {idea.origen.titulo}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
