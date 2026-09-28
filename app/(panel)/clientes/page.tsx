import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarClock, ExternalLink, FileText, FolderLock, Lightbulb } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { Encabezado, Estado, Vacio, euros, nivelEstadoProyecto, porcentaje, type NivelEstado } from '@/components/ui';
import {
  ESTADOS_CLIENTE,
  LINEAS,
  clientes,
  esEstadoCliente,
  esLinea,
  obtenerBoveda,
  type EstadoCliente,
  type Linea,
} from '@/lib/boveda/consultas';
import { documentos } from '@/lib/documentos/documentos';
import { economia, planVigente } from '@/lib/economia';
import { cuandoEs, hoyMadrid } from '@/lib/fechas';
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

/** El embudo, en su orden: de quien aún no es cliente a quien ya no lo es */
const ORDEN: EstadoCliente[] = ['potencial', 'activo', 'pausado', 'perdido'];
const NIVEL: Record<EstadoCliente, NivelEstado> = { potencial: 'neutro', activo: 'bien', pausado: 'aviso', perdido: 'sin-datos' };
const PLURAL: Record<EstadoCliente, string> = { potencial: 'Potenciales', activo: 'Activos', pausado: 'Pausados', perdido: 'Perdidos' };

function hrefFiltro(estado?: EstadoCliente, linea?: Linea): string {
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  if (linea) parametros.set('linea', linea);
  const consulta = parametros.toString();
  return consulta ? `/clientes?${consulta}` : '/clientes';
}

function Filtro({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'true' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        activo ? 'border-acento bg-acento-suave font-medium text-acento' : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
      }`}
    >
      {children}
    </Link>
  );
}

export default async function PaginaClientes({ searchParams }: PageProps<'/clientes'>) {
  const parametros = await searchParams;
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const todos = clientes(boveda, hoy);
  const estado = esEstadoCliente(parametros.estado) ? parametros.estado : undefined;
  const linea = esLinea(parametros.linea) ? parametros.linea : undefined;
  const lineas = [...new Set(todos.map((c) => c.linea))];
  const deLaLinea = todos.filter((c) => !linea || c.linea === linea);
  const lista = deLaLinea
    .filter((c) => !estado || c.estado === estado)
    .sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado) || a.nota.titulo.localeCompare(b.nota.titulo, 'es'));
  const dinero = economia(boveda, hoy);
  const cuotaDe = new Map(dinero.clientes.map((c) => [c.nota.nombre, c]));
  const docsDe = Map.groupBy(documentos(boveda), (d) => d.cliente);

  return (
    <>
      <Encabezado
        titulo="Clientes"
        subtitulo={`${todos.length} clientes${dinero.conPlan ? ` · te quedan ${euros(dinero.netoMensual)} al mes entre todos` : ''}`}
      />

      <div className="mb-5 space-y-2">
        <nav aria-label="Por dónde va cada cliente" className="flex flex-wrap items-center gap-1.5">
          <Filtro href={hrefFiltro(undefined, linea)} activo={!estado}>
            Todos · {deLaLinea.length}
          </Filtro>
          {ORDEN.map((valor, i) => (
            <span key={valor} className="inline-flex items-center gap-1.5">
              {i === 1 && <span aria-hidden className="text-apagado">→</span>}
              <Filtro href={hrefFiltro(valor, linea)} activo={estado === valor}>
                {PLURAL[valor]} · {deLaLinea.filter((c) => c.estado === valor).length}
              </Filtro>
            </span>
          ))}
        </nav>
        {(lineas.length > 1 || linea) && (
          <nav aria-label="Línea de negocio" className="flex flex-wrap gap-1.5">
            <Filtro href={hrefFiltro(estado)} activo={!linea}>
              Todas las líneas
            </Filtro>
            {lineas.map((valor) => (
              <Filtro key={valor} href={hrefFiltro(estado, valor)} activo={linea === valor}>
                {LINEAS[valor]}
              </Filtro>
            ))}
          </nav>
        )}
      </div>

      {lista.length === 0 ? (
        <Vacio>{todos.length ? 'Ningún cliente con estos filtros.' : 'No hay fichas de cliente.'}</Vacio>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((cliente) => {
            const reunion = cliente.proximaReunion;
            const cuenta = cuotaDe.get(cliente.nota.nombre);
            const plan = cuenta ? planVigente(cuenta, hoy) : undefined;
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
                    <Estado nivel={NIVEL[cliente.estado]}>
                      <span className="text-xs text-tenue">
                        {ESTADOS_CLIENTE[cliente.estado]}
                        {cliente.linea !== 'desarrollo' && ` · ${LINEAS[cliente.linea]}`}
                      </span>
                    </Estado>
                  </div>
                </div>

                <dl className="grid grid-cols-3 border-y border-borde text-center">
                  <div className="px-2 py-3">
                    <dt className="text-xs text-apagado">Te queda</dt>
                    <dd className="mt-0.5 text-sm font-semibold" title={plan?.estimado ? 'Media de lo cobrado en los meses cerrados' : undefined}>
                      {plan ? `${plan.estimado ? '≈ ' : ''}${euros(plan.netoMensual)}/mes` : '—'}
                    </dd>
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
                  {plan && cuenta ? (
                    <Link href={`/economia#cliente-${cliente.nota.nombre}`} className="flex items-center justify-between gap-2 text-xs">
                      <Estado
                        nivel={cuenta.atrasados.length ? 'grave' : cuenta.pendiente ? 'aviso' : 'bien'}
                      >
                        <span className="text-xs">
                          {cuenta.atrasados.length
                            ? `${cuenta.atrasados.length} ${cuenta.atrasados.length === 1 ? 'cobro atrasado' : 'cobros atrasados'}`
                            : cuenta.pendiente
                              ? 'Cobro de este mes pendiente'
                              : 'Cobros al día'}
                        </span>
                      </Estado>
                      <span className="text-tenue">
                        {plan.estimado
                          ? `Tarifa ${plan.tarifas.map((t) => `${euros(t.importe)}/${t.cada === 'hora' ? 'hora' : 'sesión'}`).join(' · ')}`
                          : `Te paga ${euros(plan.cuotaMensual)}/mes`}
                        {dinero.netoMensual > 0 && plan.netoMensual > 0 && ` · ${porcentaje((plan.netoMensual / dinero.netoMensual) * 100)} de lo tuyo`}
                      </span>
                    </Link>
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
                  <Link
                    href={`/documentos?cliente=${encodeURIComponent(cliente.nota.nombre)}`}
                    className="inline-flex items-center gap-1 text-tenue hover:text-acento"
                  >
                    <FolderLock className="size-3.5" aria-hidden />
                    Documentos{docsDe.get(cliente.nota.nombre)?.length ? ` · ${docsDe.get(cliente.nota.nombre)!.length}` : ''}
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
