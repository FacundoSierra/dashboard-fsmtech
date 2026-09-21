import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, ExternalLink, FileText, Lightbulb } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { Encabezado, Estado, Vacio, euros, nivelEstadoProyecto, porcentaje } from '@/components/ui';
import { clientes, obtenerBoveda } from '@/lib/boveda/consultas';
import { economia } from '@/lib/economia';
import { cuandoEs, fechaCorta, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Clientes' };

/** `Pablo (Bodegas Agrovello)` → `P`; `Centro de Negocios Inmobiliarios` → `CN` */
function iniciales(nombre: string): string {
  return nombre
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    // Sin palabras de enlace («de», «y») ni signos sueltos
    .filter((parte) => /^\p{Lu}|^\d/u.test(parte))
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('');
}

export default async function PaginaClientes() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const lista = clientes(boveda, hoy);
  const dinero = economia(boveda, hoy);
  const cuotaDe = new Map(dinero.clientes.map((c) => [c.nota.nombre, c]));

  return (
    <>
      <Encabezado
        titulo="Clientes"
        subtitulo={`${lista.length} clientes${dinero.pagan ? ` · ${euros(dinero.mensual)} al mes entre todos` : ''}`}
      />
      {lista.length === 0 ? (
        <Vacio>No hay fichas de cliente.</Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((cliente) => {
            const reunion = cliente.proximaReunion;
            const cuota = cuotaDe.get(cliente.nota.nombre);
            return (
              <article key={cliente.nota.ruta} className="flex flex-col rounded-xl border border-borde bg-superficie shadow-tarjeta">
                <div className="flex items-start gap-3 p-4">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-acento-suave text-sm font-semibold text-acento"
                  >
                    {iniciales(cliente.nota.titulo)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold leading-tight">
                      <Link href={hrefNota(cliente.nota.ruta)} className="hover:text-acento">
                        {cliente.nota.titulo}
                      </Link>
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-tenue">{cliente.sector ?? 'Sin sector'}</p>
                  </div>
                </div>

                <dl className="grid grid-cols-3 border-y border-borde text-center">
                  <div className="px-2 py-3">
                    <dt className="text-xs text-apagado">Cuota</dt>
                    <dd className="mt-0.5 text-sm font-semibold">{cuota?.cuotas.length ? euros(cuota.actual) : '—'}</dd>
                  </div>
                  <div className="border-x border-borde px-2 py-3">
                    <dt className="text-xs text-apagado">Proyectos</dt>
                    <dd className="mt-0.5 text-sm font-semibold">{cliente.proyectos.length}</dd>
                  </div>
                  <div className="px-2 py-3">
                    <dt className="text-xs text-apagado">Pendientes</dt>
                    <dd className="mt-0.5 text-sm font-semibold">{cliente.tareasAbiertas}</dd>
                  </div>
                </dl>

                <div className="flex-1 space-y-3 p-4 text-sm">
                  {cuota?.actual && dinero.mensual ? (
                    <p className="text-xs text-tenue">
                      {porcentaje((cuota.actual / dinero.mensual) * 100)} de tus ingresos
                      {cuota.desde && ` · cliente desde ${fechaCorta(cuota.desde)} de ${cuota.desde.slice(0, 4)}`}
                    </p>
                  ) : null}

                  {reunion?.fecha && (
                    <Link
                      href={hrefNota(reunion.nota.ruta)}
                      className="flex items-center gap-2 rounded-lg bg-acento-suave px-3 py-2 text-acento"
                    >
                      <CalendarClock className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">
                        <span className="font-medium first-letter:uppercase">Reunión {cuandoEs(reunion.fecha, hoy)}</span>
                        {reunion.hora && ` · ${reunion.hora}`}
                      </span>
                    </Link>
                  )}

                  {cliente.proyectos.length > 0 && (
                    <ul className="space-y-1.5">
                      {cliente.proyectos.map((proyecto) => (
                        <li key={proyecto.nota.ruta} className="flex items-center justify-between gap-2">
                          <Link href={hrefNota(proyecto.nota.ruta)} className="min-w-0 truncate hover:text-acento">
                            {proyecto.nota.titulo.split(' — ')[0]}
                          </Link>
                          <Estado nivel={nivelEstadoProyecto(proyecto.estado)}>
                            <span className="text-xs capitalize text-tenue">{proyecto.estado}</span>
                          </Estado>
                        </li>
                      ))}
                    </ul>
                  )}

                  {cliente.contactos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cliente.contactos.map((persona) => (
                        <Link
                          key={persona.ruta}
                          href={hrefNota(persona.ruta)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-borde py-0.5 pl-0.5 pr-2 text-xs hover:border-borde-fuerte"
                        >
                          <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-superficie-2 text-[10px] font-semibold">
                            {iniciales(persona.titulo)}
                          </span>
                          {persona.titulo}
                        </Link>
                      ))}
                    </div>
                  )}

                  {cliente.ideas.length > 0 && (
                    <details>
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-tenue">
                        <Lightbulb className="size-3.5" aria-hidden />
                        {cliente.ideas.length} {cliente.ideas.length === 1 ? 'idea u oportunidad' : 'ideas y oportunidades'}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {cliente.ideas.map((idea, i) => (
                          <li key={i}>
                            <Markdown texto={idea.texto} rutas={boveda.rutas} enLinea />{' '}
                            <Link href={hrefNota(idea.origen.ruta)} className="text-tenue hover:text-acento">
                              · {idea.origen.titulo}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="flex gap-4 border-t border-borde px-4 py-3 text-xs">
                  <Link href={`/informes/${encodeURIComponent(cliente.nota.nombre)}`} className="inline-flex items-center gap-1 text-tenue hover:text-acento">
                    <FileText className="size-3.5" aria-hidden />
                    Informe del mes
                  </Link>
                  {cliente.web && (
                    <a href={cliente.web} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-tenue hover:text-acento">
                      <ExternalLink className="size-3.5" aria-hidden />
                      Web
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
