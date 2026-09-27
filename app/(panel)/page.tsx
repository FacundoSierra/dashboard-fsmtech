import Link from 'next/link';
import { Suspense } from 'react';
import { Bell, CalendarClock, CheckSquare, Flame, Hourglass, Inbox, History } from 'lucide-react';
import { ListaAvisos } from '@/components/avisos';
import { NuevoObjetivo } from '@/components/tarea-editable';
import { ListaTareas, ListaTareasEditable } from '@/components/tareas';
import { Chip, EnlaceAccion, Estado, Kpi, Medidor, Tarjeta, Vacio, euros } from '@/components/ui';
import { calcularAvisos } from '@/lib/avisos';
import { esPrioritaria, obtenerBoveda, proyectos, resumenHoy, reunionesProximas } from '@/lib/boveda/consultas';
import { capturas } from '@/lib/boveda/inbox';
import { ultimaSubidaDelPc } from '@/lib/boveda/sincronizacion';
import type { Boveda, Tarea } from '@/lib/boveda/tipos';
import { economia } from '@/lib/economia';
import { cuandoEs, diasEntre, esFechaValida, fechaHoraMadrid, fechaLarga, haceTiempo, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral } from '@/lib/vigilancia/estado';
import { reposLocales } from '@/lib/vigilancia/repos-locales';

const CAPTURAS_VISIBLES = 4;
const AVISOS_VISIBLES = 5;
const MES_CORTO = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
/** La regla de la bóveda: lo que lleva más de una semana esperando se dice en voz alta */
const DIAS_ESPERANDO_MUCHO = 7;

function saludo(): string {
  const hora = Number(fechaHoraMadrid().hora.slice(0, 2));
  if (hora < 6) return 'Buenas noches';
  if (hora < 13) return 'Buenos días';
  if (hora < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export default async function PaginaHoy() {
  const boveda = await obtenerBoveda();
  const { rutas } = boveda;
  const hoy = hoyMadrid();

  const { daily, objetivos, espera, completado, anteriores } = resumenHoy(boveda, hoy);
  const principales = objetivos.filter((t) => t.nivel === 0);
  const hechos = principales.filter((t) => t.hecha).length;

  const proximas = reunionesProximas(boveda, hoy);
  const urgentes = proyectos(boveda)
    .filter((p) => p.estado === 'activo')
    .flatMap((proyecto) => proyecto.abiertas.filter(esPrioritaria).map((tarea) => ({ tarea, proyecto })));
  const inbox = capturas(boveda);
  const dinero = economia(boveda, hoy);
  const pendientesAnteriores = anteriores.reduce((total, dia) => total + dia.tareas.length, 0);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{saludo()}, Facundo</h1>
        <p className="mt-1 text-sm text-tenue first-letter:uppercase">{fechaLarga(hoy)}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Objetivos de hoy"
          valor={daily ? `${hechos}/${principales.length}` : '—'}
          icono={CheckSquare}
          href={daily ? hrefNota(daily.ruta) : undefined}
          detalle={daily ? (principales.length ? undefined : 'La daily no tiene objetivos') : 'Todavía no hay daily de hoy'}
        >
          {daily && principales.length > 0 && <Medidor valor={hechos} max={principales.length} etiqueta="Objetivos hechos" />}
        </Kpi>
        <Suspense fallback={<KpiCargando etiqueta="Webs en línea" />}>
          <KpiWebs boveda={boveda} />
        </Suspense>
        <Kpi
          etiqueta="Te quedan al mes"
          valor={dinero.conPlan ? euros(dinero.netoMensual) : '—'}
          href="/economia"
          estado={dinero.atrasados.length ? 'grave' : undefined}
          detalle={
            !dinero.conPlan
              ? 'Sin planes de cobro'
              : dinero.atrasados.length
                ? `${euros(dinero.pendiente)} sin cobrar`
                : dinero.pendiente
                  ? `${euros(dinero.pendiente)} por cobrar este mes`
                  : 'Cobros al día'
          }
        />
        <Suspense fallback={<KpiCargando etiqueta="Avisos" />}>
          <KpiAvisos boveda={boveda} hoy={hoy} />
        </Suspense>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border border-borde bg-superficie" />}>
            <TarjetaAvisos boveda={boveda} hoy={hoy} />
          </Suspense>

          <Tarjeta
            titulo="Objetivos"
            icono={CheckSquare}
            accion={daily && <EnlaceAccion href={hrefNota(daily.ruta)}>Abrir la daily</EnlaceAccion>}
          >
            {!daily ? (
              <Vacio>Todavía no hay daily de hoy.</Vacio>
            ) : principales.length === 0 ? (
              <Vacio>La daily de hoy no tiene objetivos.</Vacio>
            ) : (
              <ListaTareasEditable tareas={objetivos} rutas={rutas} ruta={daily.ruta} mover="espera" />
            )}
            <div className="mt-4">
              <NuevoObjetivo creaDiaria={!daily} />
            </div>
            <Suspense fallback={null}>
              <SubidaDelPc />
            </Suspense>
            {completado.length > 0 && (
              <details className="mt-4 border-t border-borde pt-3">
                <summary className="cursor-pointer text-sm text-tenue">Completado hoy · {completado.length}</summary>
                <div className="mt-3">
                  <ListaTareas tareas={completado} rutas={rutas} />
                </div>
              </details>
            )}
          </Tarjeta>

          {daily && espera.length > 0 && (
            <Tarjeta titulo={`A la espera · ${espera.filter((t) => t.nivel === 0 && !t.hecha).length}`} icono={Hourglass}>
              <ListaTareasEditable
                tareas={espera}
                rutas={rutas}
                ruta={daily.ruta}
                mover="objetivos"
                detalle={(tarea) => <DiasEsperando tarea={tarea} hoy={hoy} />}
              />
            </Tarjeta>
          )}

          {pendientesAnteriores > 0 && (
            <Tarjeta titulo={`De días anteriores · ${pendientesAnteriores}`} icono={History}>
              <details>
                <summary className="cursor-pointer text-sm text-tenue">
                  Objetivos sin marcar de las últimas dos semanas que no están en la daily de hoy
                </summary>
                <div className="mt-4 space-y-4">
                  {anteriores.map(({ fecha, nota, tareas }) => (
                    <div key={fecha}>
                      <p className="mb-2 text-xs text-tenue first-letter:uppercase">
                        <Link href={hrefNota(nota.ruta)} className="hover:text-acento">
                          {fechaLarga(fecha)}
                        </Link>{' '}
                        · {cuandoEs(fecha, hoy)}
                      </p>
                      <ListaTareasEditable tareas={tareas} rutas={rutas} ruta={nota.ruta} />
                    </div>
                  ))}
                </div>
              </details>
            </Tarjeta>
          )}
        </div>

        <div className="space-y-6">
          <Tarjeta titulo="Próximas reuniones" icono={CalendarClock} accion={<EnlaceAccion href="/reuniones">Todas</EnlaceAccion>}>
            {proximas.length === 0 ? (
              <Vacio>No hay reuniones previstas.</Vacio>
            ) : (
              <ul className="space-y-3">
                {proximas.slice(0, 4).map((reunion) => (
                  <li key={reunion.nota.ruta}>
                    <Link href={hrefNota(reunion.nota.ruta)} className="group flex items-start gap-3">
                      {reunion.fecha && (
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-borde bg-superficie-2 py-1">
                          <span className="text-base font-semibold leading-none">{Number(reunion.fecha.slice(8, 10))}</span>
                          <span className="mt-0.5 text-[10px] uppercase text-apagado">
                            {MES_CORTO.format(new Date(`${reunion.fecha}T00:00:00Z`)).replace('.', '')}
                          </span>
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug group-hover:text-acento">{reunion.nota.titulo}</span>
                        {reunion.fecha && (
                          <span className="text-xs text-tenue first-letter:uppercase">
                            {cuandoEs(reunion.fecha, hoy)}
                            {reunion.hora && ` · ${reunion.hora}`}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {urgentes.length > 0 && (
            <Tarjeta titulo={`Urgente · ${urgentes.length}`} icono={Flame}>
              <ul className="space-y-3">
                {urgentes.slice(0, 5).map(({ tarea, proyecto }, i) => (
                  <li key={i}>
                    <Link href={hrefNota(proyecto.nota.ruta)} className="mb-1 block text-xs text-tenue hover:text-acento">
                      {proyecto.nota.titulo}
                    </Link>
                    <ListaTareas tareas={[{ ...tarea, nivel: 0 }]} rutas={rutas} />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <Tarjeta
            titulo={`Inbox · ${inbox.length}`}
            icono={Inbox}
            accion={<EnlaceAccion href="/capturar">+ Apuntar</EnlaceAccion>}
          >
            {inbox.length === 0 ? (
              <Vacio>Nada pendiente de procesar.</Vacio>
            ) : (
              <ul className="space-y-2">
                {inbox.slice(0, CAPTURAS_VISIBLES).map((captura) => (
                  <li key={captura.nota.ruta} className="flex items-center justify-between gap-2">
                    <Link href={hrefNota(captura.nota.ruta)} className="min-w-0 truncate text-sm hover:text-acento">
                      {captura.nota.titulo}
                    </Link>
                    {captura.categoria && <Chip>{captura.categoria}</Chip>}
                  </li>
                ))}
              </ul>
            )}
            {inbox.length > CAPTURAS_VISIBLES && (
              <div className="mt-3 text-sm">
                <EnlaceAccion href="/inbox">Ver las {inbox.length}</EnlaceAccion>
              </div>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

/** Lo marcado aquí llega a Obsidian cuando el PC sincroniza: esto dice cuándo lo hizo por última vez */
async function SubidaDelPc() {
  const ultima = await ultimaSubidaDelPc();
  if (!ultima) return null;
  return (
    <p className="mt-3 text-xs text-apagado">
      Lo que marques aquí llega a Obsidian cuando el PC sincroniza. Última subida del PC: {haceTiempo(ultima)}.
    </p>
  );
}

/** `— **Roberto** — desde 2026-09-21`: cuántos días lleva, en voz alta si pasa de una semana */
function DiasEsperando({ tarea, hoy }: { tarea: Tarea; hoy: string }) {
  const desde = tarea.texto.match(/desde (\d{4}-\d{2}-\d{2})/)?.[1];
  if (tarea.nivel > 0 || tarea.hecha || !esFechaValida(desde)) return null;
  const dias = diasEntre(desde, hoy);
  if (dias <= DIAS_ESPERANDO_MUCHO) return null;
  return (
    <span className="ml-2 inline-flex align-middle">
      <Estado nivel="grave">
        <span className="text-xs">{dias} días esperando</span>
      </Estado>
    </span>
  );
}

function KpiCargando({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta" aria-busy="true">
      <span className="text-sm text-tenue">{etiqueta}</span>
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-superficie-2" />
    </div>
  );
}

async function KpiWebs({ boveda }: { boveda: Boveda }) {
  const estado = await estadoGeneral(boveda);
  const conWeb = estado.proyectos.filter((p) => p.web);
  const enLinea = conWeb.filter((p) => p.web?.responde).length;
  const caidas = conWeb.length - enLinea;
  return (
    <Kpi
      etiqueta="Webs en línea"
      valor={`${enLinea}/${conWeb.length}`}
      estado={caidas ? 'critico' : 'bien'}
      href="/estado"
      detalle={caidas ? `${caidas} sin responder` : 'Todas responden'}
    />
  );
}

async function KpiAvisos({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const avisos = calcularAvisos({
    estado: await estadoGeneral(boveda),
    economia: economia(boveda, hoy),
    repos: reposLocales(boveda),
    hoy,
  });
  const serios = avisos.filter((a) => a.nivel === 'critico' || a.nivel === 'grave').length;
  return (
    <Kpi
      etiqueta="Avisos"
      valor={avisos.length}
      estado={serios ? 'grave' : avisos.length ? 'aviso' : 'bien'}
      href="/estado"
      detalle={serios ? `${serios} ${serios === 1 ? 'importante' : 'importantes'}` : avisos.length ? 'Ninguno importante' : 'Todo en orden'}
    />
  );
}

async function TarjetaAvisos({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const avisos = calcularAvisos({
    estado: await estadoGeneral(boveda),
    economia: economia(boveda, hoy),
    repos: reposLocales(boveda),
    hoy,
  });
  if (avisos.length === 0) return null;

  return (
    <Tarjeta
      titulo={`Avisos · ${avisos.length}`}
      icono={Bell}
      sinRelleno
      accion={avisos.length > AVISOS_VISIBLES ? <EnlaceAccion href="/estado">Ver todos</EnlaceAccion> : undefined}
    >
      <ListaAvisos avisos={avisos} limite={AVISOS_VISIBLES} />
    </Tarjeta>
  );
}
