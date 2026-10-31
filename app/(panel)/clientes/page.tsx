import type { Metadata } from 'next';
import Link from 'next/link';
import type { Nota, Tarea } from '@/lib/boveda/tipos';
import { CalendarClock, ExternalLink, FileText, FolderLock, Hourglass, Lightbulb, MessagesSquare, Plus, Route } from 'lucide-react';
import { ZONA_TOQUE } from '@/components/estilos';
import { Markdown } from '@/components/markdown';
import { Avatar } from '@/components/piezas';
import { EnlaceBoton, Encabezado, Estado, Filtro, TITULO_TARJETA, Vacio, euros, nivelEstadoProyecto, porcentaje, type NivelEstado } from '@/components/ui';
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
import { economia, mediaSinCuota, planVigente, sinCuotaFija, type PlanAnual } from '@/lib/economia';
import { cuandoEs, diasEntre, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Clientes' };

/** El embudo, en su orden: de quien aún no es cliente a quien ya no lo es */
const ORDEN: EstadoCliente[] = ['potencial', 'activo', 'pausado', 'perdido'];
const NIVEL: Record<EstadoCliente, NivelEstado> = { potencial: 'neutro', activo: 'bien', pausado: 'aviso', perdido: 'sin-datos' };
const PLURAL: Record<EstadoCliente, string> = { potencial: 'Potenciales', activo: 'Activos', pausado: 'Pausados', perdido: 'Perdidos' };
/** Días sin hablar a partir de los cuales se avisa: a un potencial se le enfría antes */
const DIAS_SIN_HABLAR: Partial<Record<EstadoCliente, number>> = { potencial: 14, activo: 30 };

function hrefFiltro(estado?: EstadoCliente, linea?: Linea): string {
  const parametros = new URLSearchParams();
  if (estado) parametros.set('estado', estado);
  if (linea) parametros.set('linea', linea);
  const consulta = parametros.toString();
  return consulta ? `/clientes?${consulta}` : '/clientes';
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
        subtitulo={`${todos.length} clientes${dinero.conPlan ? ` · un margen de ${euros(dinero.netoMensual)} al mes entre todos` : ''}`}
        acciones={
          <EnlaceBoton href="/crear?tipo=cliente" icono={Plus}>
            Cliente
          </EnlaceBoton>
        }
      />

      <div className="mb-5 space-y-2">
        {/* En el orden del embudo, de potencial a perdido: el orden ya lo dice, sin flechas */}
        <nav aria-label="Por dónde va cada cliente" className="flex flex-wrap items-center gap-2">
          <Filtro href={hrefFiltro(undefined, linea)} activo={!estado}>
            Todos · {deLaLinea.length}
          </Filtro>
          {ORDEN.map((valor) => (
            <Filtro key={valor} href={hrefFiltro(valor, linea)} activo={estado === valor}>
              {PLURAL[valor]} · {deLaLinea.filter((c) => c.estado === valor).length}
            </Filtro>
          ))}
        </nav>
        {(lineas.length > 1 || linea) && (
          <nav aria-label="Línea de negocio" className="flex flex-wrap gap-2">
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
        // `items-start`: cada tarjeta, de su alto; estiradas a la de la vecina dejaban huecos de hasta 170 px
        <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((cliente) => {
            const reunion = cliente.proximaReunion;
            const cuenta = cuotaDe.get(cliente.nota.nombre);
            const plan = cuenta ? planVigente(cuenta, hoy) : undefined;
            const media = plan && sinCuotaFija(plan) ? mediaSinCuota(plan, hoy) : undefined;
            return (
              // Una tarjeta del panel, sin borde: se separa del gris por el tono. El círculo, con el tinte
              // de su nombre, como las personas de Hoy
              <article key={cliente.nota.ruta} className="flex flex-col rounded-xl bg-superficie">
                <div className="flex items-start gap-3 px-5 pb-4 pt-5 sm:px-6">
                  <Avatar nombre={cliente.nota.titulo} dosLetras />
                  <div className="min-w-0 flex-1">
                    <h2 className={`leading-tight ${TITULO_TARJETA}`}>
                      <Link href={hrefNota(cliente.nota.ruta)} className={`${ZONA_TOQUE} hover:text-acento`}>
                        {cliente.nota.titulo}
                      </Link>
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-tenue">{cliente.sector ?? 'Sin sector'}</p>
                    <Estado nivel={NIVEL[cliente.estado]}>
                      <span className="text-[13px] text-tenue">
                        {ESTADOS_CLIENTE[cliente.estado]}
                        {cliente.linea !== 'desarrollo' && ` · ${LINEAS[cliente.linea]}`}
                      </span>
                    </Estado>
                  </div>
                </div>

                <dl className="grid grid-cols-3 border-y border-borde text-center">
                  <div className="px-2 py-3">
                    <dt className="text-[13px] text-apagado">{media !== undefined ? 'De media' : 'Margen'}</dt>
                    <dd
                      className="mt-0.5 text-[15px] font-semibold"
                      title={plan?.estimado || media !== undefined ? 'Media de lo cobrado en los meses cerrados' : undefined}
                    >
                      {!plan ? '—' : media !== undefined ? `≈ ${euros(media)}/mes` : `${plan.estimado ? '≈ ' : ''}${euros(plan.netoMensual)}/mes`}
                    </dd>
                  </div>
                  <div className="border-x border-borde px-2 py-3">
                    <dt className="text-[13px] text-apagado">Proyectos</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold">{cliente.proyectos.length}</dd>
                  </div>
                  <div className="px-2 py-3">
                    <dt className="text-[13px] text-apagado">Pendientes</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold">{cliente.tareasAbiertas}</dd>
                  </div>
                </dl>

                <div className="flex-1 space-y-3 px-5 py-4 text-sm sm:px-6">
                  <SeguimientoCliente
                    ultimo={cliente.ultimoContacto}
                    limite={DIAS_SIN_HABLAR[cliente.estado]}
                    proximoPaso={cliente.proximoPaso}
                    esperando={cliente.esperando}
                    hoy={hoy}
                    rutas={boveda.rutas}
                    titulos={boveda.titulos}
                  />
                  {plan && cuenta ? (
                    <Link href={`/economia#cliente-${cliente.nota.nombre}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 text-[13px]">
                      <Estado
                        nivel={cuenta.atrasados.length ? 'grave' : cuenta.pendiente ? 'aviso' : 'bien'}
                      >
                        <span className="text-[13px]">
                          {cuenta.atrasados.length
                            ? `${cuenta.atrasados.length} ${cuenta.atrasados.length === 1 ? 'cobro atrasado' : 'cobros atrasados'}`
                            : cuenta.pendiente
                              ? 'Cobro de este mes pendiente'
                              : 'Cobros al día'}
                        </span>
                      </Estado>
                      <span className="text-tenue">
                        {loQuePaga(plan)}
                        {dinero.netoMensual > 0 && plan.netoMensual > 0 && ` · ${porcentaje((plan.netoMensual / dinero.netoMensual) * 100)} de lo tuyo`}
                      </span>
                    </Link>
                  ) : null}

                  {reunion?.fecha && (
                    <Link
                      href={hrefNota(reunion.nota.ruta)}
                      className="flex min-h-11 items-center gap-2 rounded-lg bg-acento-suave px-3 py-2 text-acento"
                    >
                      <CalendarClock className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">
                        <span className="font-medium first-letter:uppercase">Reunión {cuandoEs(reunion.fecha, hoy)}</span>
                        {reunion.hora && ` · ${reunion.hora}`}
                      </span>
                    </Link>
                  )}

                  {cliente.proyectos.length > 0 && (
                    // Una fila de 44 px por proyecto: a 26 px, en el móvil se tocaba el de al lado
                    <ul>
                      {cliente.proyectos.map((proyecto) => (
                        <li key={proyecto.nota.ruta} className="flex items-center justify-between gap-2">
                          <Link href={hrefNota(proyecto.nota.ruta)} className="flex min-h-11 min-w-0 flex-1 items-center hover:text-acento">
                            <span className="truncate">{proyecto.nota.titulo.split(' — ')[0]}</span>
                          </Link>
                          <Estado nivel={nivelEstadoProyecto(proyecto.estado)}>
                            <span className="text-[13px] capitalize text-tenue">{proyecto.estado}</span>
                          </Estado>
                        </li>
                      ))}
                    </ul>
                  )}

                  {cliente.contactos.length > 0 && (
                    // 36 px visibles y 44 de toque, con 8 entre filas para que las zonas no se pisen
                    <div className="flex flex-wrap gap-2">
                      {cliente.contactos.map((persona) => (
                        <Link
                          key={persona.ruta}
                          href={hrefNota(persona.ruta)}
                          className={`${ZONA_TOQUE} inline-flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-full bg-superficie-2 py-1 pl-1 pr-3 text-[13px] hover:text-acento`}
                        >
                          <Avatar nombre={persona.titulo} tamano="mini" dosLetras />
                          <span className="truncate">{persona.titulo}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {cliente.ideas.length > 0 && (
                    <details>
                      <summary className={`${ZONA_TOQUE} flex cursor-pointer items-center gap-1.5 text-[13px] text-tenue hover:text-texto`}>
                        <Lightbulb className="size-3.5" aria-hidden />
                        {cliente.ideas.length} {cliente.ideas.length === 1 ? 'idea u oportunidad' : 'ideas y oportunidades'}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {cliente.ideas.map((idea, i) => (
                          <li key={i}>
                            <Markdown texto={idea.texto} rutas={boveda.rutas} titulos={boveda.titulos} enLinea />{' '}
                            <Link href={hrefNota(idea.origen.ruta)} className="text-tenue hover:text-acento">
                              · {idea.origen.titulo}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-borde px-5 py-3.5 text-[13px] sm:px-6">
                  <Link href={`/informes/${encodeURIComponent(cliente.nota.nombre)}`} className={`${ZONA_TOQUE} inline-flex items-center gap-1 text-tenue hover:text-acento`}>
                    <FileText className="size-3.5" aria-hidden />
                    Informe del mes
                  </Link>
                  <Link
                    href={`/documentos?cliente=${encodeURIComponent(cliente.nota.nombre)}`}
                    className={`${ZONA_TOQUE} inline-flex items-center gap-1 text-tenue hover:text-acento`}
                  >
                    <FolderLock className="size-3.5" aria-hidden />
                    Documentos{docsDe.get(cliente.nota.nombre)?.length ? ` · ${docsDe.get(cliente.nota.nombre)!.length}` : ''}
                  </Link>
                  {cliente.web && (
                    <a href={cliente.web} target="_blank" rel="noreferrer" className={`${ZONA_TOQUE} inline-flex items-center gap-1 text-tenue hover:text-acento`}>
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

/** «Te paga 50 €/mes», la tarifa o, sin cuota (OVB, CNI), que no la tiene: un «0 €/mes» se leía como que no paga */
function loQuePaga(plan: PlanAnual): string {
  if (plan.estimado) return `Tarifa ${plan.tarifas.map((t) => `${euros(t.importe)}/${t.cada === 'hora' ? 'hora' : 'sesión'}`).join(' · ')}`;
  if (sinCuotaFija(plan)) return 'Sin cuota fija';
  if (plan.cuotaMensual === 0) return `Te paga ${euros(plan.cobrosAnuales.reduce((t, l) => t + l.importe, 0))}/año`;
  return `Te paga ${euros(plan.cuotaMensual)}/mes`;
}

/** Cuándo se habló por última vez, qué toca hacer y qué se le está esperando */
function SeguimientoCliente({
  ultimo,
  limite,
  proximoPaso,
  esperando,
  hoy,
  rutas,
  titulos,
}: {
  ultimo?: string;
  limite?: number;
  proximoPaso?: { tarea: Tarea; proyecto: Nota };
  esperando: Tarea[];
  hoy: string;
  rutas: Record<string, string>;
  titulos: Record<string, string>;
}) {
  const dias = ultimo ? diasEntre(ultimo, hoy) : undefined;
  const frio = limite !== undefined && (dias === undefined || dias > limite);
  return (
    <div className="space-y-1.5 text-[13px]">
      {frio ? (
        <Estado nivel="aviso">
          <span className="text-[13px]">{dias === undefined ? 'Sin reuniones ni contacto apuntados' : `${dias} días sin hablar`}</span>
        </Estado>
      ) : (
        <p className="flex items-center gap-1.5 text-tenue">
          <MessagesSquare className="size-3.5 shrink-0 text-apagado" aria-hidden />
          {ultimo ? `Última reunión o contacto: ${cuandoEs(ultimo, hoy)}` : 'Sin reuniones apuntadas'}
        </p>
      )}
      {proximoPaso && (
        <p className="flex items-start gap-1.5">
          <Route className="mt-0.5 size-3.5 shrink-0 text-apagado" aria-hidden />
          <span className="line-clamp-2 min-w-0">
            <span className="text-apagado">Próximo paso: </span>
            <Markdown texto={proximoPaso.tarea.texto} rutas={rutas} titulos={titulos} enLinea />
          </span>
        </p>
      )}
      {esperando.slice(0, 2).map((tarea) => (
        <p key={tarea.linea} className="flex items-start gap-1.5">
          <Hourglass className="mt-0.5 size-3.5 shrink-0 text-apagado" aria-hidden />
          <span className="line-clamp-2 min-w-0">
            <span className="text-apagado">Esperando: </span>
            <Markdown texto={tarea.texto} rutas={rutas} titulos={titulos} enLinea />
          </span>
        </p>
      ))}
      {esperando.length > 2 && <p className="pl-5 text-apagado">y {esperando.length - 2} más a la espera</p>}
    </div>
  );
}
