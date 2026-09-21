import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarClock, FileText, PieChart, TrendingUp } from 'lucide-react';
import { BotonCobro } from '@/components/boton-cobro';
import { GraficoIngresos } from '@/components/grafico-ingresos';
import { BarrasHorizontales, FranjaCobros } from '@/components/graficos';
import {
  Encabezado,
  Estado,
  FILA,
  Kpi,
  Pendiente,
  TABLA,
  TD,
  TH,
  Tarjeta,
  Vacio,
  euros,
  porcentaje,
  type NivelEstado,
} from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import {
  economia,
  mesesDelPlan,
  nombreMes,
  planVigente,
  type Cobro,
  type EconomiaCliente,
  type LineaPlan,
  type PlanAnual,
  type Renovacion,
} from '@/lib/economia';
import { cuandoEs, diasEntre, fechaCorta, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral } from '@/lib/vigilancia/estado';

export const metadata: Metadata = { title: 'Economía' };

export default async function PaginaEconomia() {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const anio = Number(hoy.slice(0, 4));
  const datos = economia(boveda, hoy);
  const hayPlanes = datos.clientes.some((c) => c.planes.length > 0);

  return (
    <>
      <Encabezado titulo="Economía" subtitulo={`Lo acordado con cada cliente en ${anio} y lo que te han pagado`} />

      {!hayPlanes ? (
        <Tarjeta>
          <Pendiente titulo="Todavía no hay planes de cobro">
            <p>
              Cada cliente lleva una nota por año en <code>clientes/&lt;cliente&gt;/cobros/&lt;cliente&gt;-cobros-{anio}.md</code>, con lo acordado
              (mantenimiento, dominio, hosting y quién paga cada cosa) y una casilla por cobro. El formato está en{' '}
              <code>docs/economia.md</code>. O dile a Claude el trato de cada cliente y lo apunta.
            </p>
          </Pendiente>
        </Tarjeta>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              etiqueta="Te quedan al mes"
              valor={euros(datos.netoMensual)}
              icono={TrendingUp}
              detalle={
                datos.variacion === 0
                  ? `${datos.conPlan} ${datos.conPlan === 1 ? 'cliente' : 'clientes'} con plan`
                  : `${datos.variacion > 0 ? '+' : '−'}${euros(Math.abs(datos.variacion))} respecto al mes pasado`
              }
            />
            <Kpi etiqueta={`Cobrado en ${anio}`} valor={euros(datos.cobradoAnio)} detalle="Casillas marcadas" />
            <Kpi
              etiqueta="Pendiente de cobro"
              valor={euros(datos.pendiente)}
              estado={datos.atrasados.length ? 'grave' : datos.pendiente ? 'aviso' : 'bien'}
              detalle={
                datos.atrasados.length
                  ? `${datos.atrasados.length} ${datos.atrasados.length === 1 ? 'cobro atrasado' : 'cobros atrasados'}`
                  : datos.pendiente
                    ? 'Solo lo de este mes'
                    : 'Al día'
              }
            />
            <Kpi
              etiqueta="Pagas a proveedores"
              valor={euros(datos.gastoMensual)}
              detalle={`Al mes. Te pagan ${euros(datos.ingresoMensual)}`}
            />
          </div>

          {/* grid-cols-1 es minmax(0, 1fr): sin él, la columna del móvil crece con su contenido */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <Tarjeta titulo="Lo que te queda cada mes" icono={TrendingUp} className="xl:col-span-3">
              {datos.serie.length < 2 ? (
                <Vacio>La evolución se dibuja a partir del segundo mes con planes.</Vacio>
              ) : (
                <>
                  <GraficoIngresos
                    titulo="Lo que te queda cada mes"
                    puntos={datos.serie.map((p) => ({
                      eje: nombreMes(p.mes).split(' ')[0],
                      anio: p.mes.slice(2, 4),
                      etiqueta: nombreMes(p.mes, true),
                      valor: p.importe,
                      texto: euros(p.importe),
                    }))}
                  />
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-tenue">Ver como tabla</summary>
                    <table className={`${TABLA} mt-2`}>
                      <thead>
                        <tr>
                          <th className={TH}>Mes</th>
                          <th className={`${TH} text-right`}>Te queda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...datos.serie].reverse().map((p) => (
                          <tr key={p.mes} className={FILA}>
                            <td className={`${TD} first-letter:uppercase`}>{nombreMes(p.mes, true)}</td>
                            <td className={`${TD} cifras text-right`}>{euros(p.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </Tarjeta>

            <Tarjeta titulo="Reparto por cliente" icono={PieChart} className="xl:col-span-2">
              <BarrasHorizontales
                titulo="Lo que te queda al mes de cada cliente"
                barras={datos.clientes
                  .map((c) => ({ c, plan: planVigente(c, hoy) }))
                  .filter(({ plan }) => plan && plan.netoMensual > 0)
                  .map(({ c, plan }) => ({
                    clave: c.nota.nombre,
                    etiqueta: c.nota.titulo,
                    valor: plan!.netoMensual,
                    texto: euros(plan!.netoMensual),
                    detalle: datos.netoMensual ? porcentaje((plan!.netoMensual / datos.netoMensual) * 100) : undefined,
                  }))}
              />
              {/* Con un solo cliente con plan es obvio y no aporta nada */}
              {datos.conPlan > 1 && datos.principal && datos.principal.porcentaje >= 50 && (
                <p className="mt-4 text-xs text-tenue">Más de la mitad de lo que ganas depende de un solo cliente.</p>
              )}
            </Tarjeta>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-tenue">Clientes</h2>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              {datos.clientes.map((c) => (
                <TarjetaCliente key={c.nota.ruta} cliente={c} anio={anio} />
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="mt-6">
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-xl border border-borde bg-superficie" aria-label="Cargando renovaciones" />}
        >
          <Renovaciones manuales={datos.renovaciones} hoy={hoy} />
        </Suspense>
      </div>
    </>
  );
}

// ── Tarjeta de un cliente ────────────────────────────────────────────────────

function estadoCobros(c: EconomiaCliente, plan: PlanAnual | undefined): { nivel: NivelEstado; texto: string } {
  if (!plan) return { nivel: 'sin-datos', texto: 'Sin plan en vigor' };
  if (c.atrasados.length) return { nivel: 'grave', texto: `${c.atrasados.length} sin cobrar` };
  if (c.pendiente) return { nivel: 'aviso', texto: 'Pendiente este mes' };
  return { nivel: 'bien', texto: 'Al día' };
}

function TarjetaCliente({ cliente, anio }: { cliente: EconomiaCliente; anio: number }) {
  const plan = cliente.plan;
  const estado = estadoCobros(cliente, plan);
  const debidos = plan?.cobros.filter((c) => c.estado === 'atrasado' || c.estado === 'pendiente') ?? [];

  return (
    <article id={`cliente-${cliente.nota.nombre}`} className="scroll-mt-20 rounded-xl border border-borde bg-superficie shadow-tarjeta">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">
            <Link href={hrefNota(cliente.nota.ruta)} className="hover:text-acento">
              {cliente.nota.titulo}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Estado nivel={estado.nivel}>
              <span className="text-xs text-tenue">{estado.texto}</span>
            </Estado>
            {plan && (
              <span className="text-xs capitalize text-apagado">
                {nombreMes(plan.desde)} – {nombreMes(plan.hasta)}
              </span>
            )}
          </div>
        </div>
        {plan && (
          <dl className="flex gap-5 text-right">
            <div>
              <dt className="text-xs text-apagado">Te paga</dt>
              <dd className="cifras text-sm font-semibold">{euros(plan.cuotaMensual, true)}/mes</dd>
            </div>
            <div>
              <dt className="text-xs text-apagado">Te queda</dt>
              <dd className="cifras text-sm font-semibold">{euros(plan.netoMensual, true)}/mes</dd>
            </div>
          </dl>
        )}
      </div>

      {!plan ? (
        <p className="border-t border-borde px-4 py-3 text-xs text-tenue">
          Sin plan de cobros en vigor. Se crea en <code>clientes/{cliente.nota.nombre}/cobros/{cliente.nota.nombre}-cobros-{anio}.md</code>.
        </p>
      ) : (
        <>
          <div className="px-4 pb-4">
            <FranjaCobros meses={mesesDelPlan(plan)} cobros={plan.cobros} nombre={cliente.nota.titulo} />
          </div>

          {debidos.length > 0 && (
            <ul className="divide-y divide-borde border-t border-borde">
              {debidos.map((cobro) => (
                <FilaCobro key={cobro.linea} cobro={cobro} ruta={plan.nota.ruta} />
              ))}
            </ul>
          )}

          <details className="border-t border-borde">
            <summary className="cursor-pointer px-4 py-2.5 text-xs text-tenue hover:text-texto">
              El trato y todos sus cobros
            </summary>
            <div className="space-y-4 px-4 pb-4">
              <TablaPlan plan={plan} />
              <ul className="divide-y divide-borde rounded-lg border border-borde">
                {plan.cobros.map((cobro) => (
                  <FilaCobro key={cobro.linea} cobro={cobro} ruta={plan.nota.ruta} />
                ))}
              </ul>
              <Link href={hrefNota(plan.nota.ruta)} className="inline-flex items-center gap-1 text-xs text-tenue hover:text-acento">
                <FileText className="size-3.5" aria-hidden />
                Abrir la nota de cobros
              </Link>
            </div>
          </details>
        </>
      )}
    </article>
  );
}

const ESTADO_COBRO: Record<Cobro['estado'], { nivel: NivelEstado; texto: string }> = {
  cobrado: { nivel: 'bien', texto: 'Cobrado' },
  atrasado: { nivel: 'grave', texto: 'Atrasado' },
  pendiente: { nivel: 'aviso', texto: 'Este mes' },
  programado: { nivel: 'sin-datos', texto: 'Por cobrar' },
};

function FilaCobro({ cobro, ruta }: { cobro: Cobro; ruta: string }) {
  const estado = ESTADO_COBRO[cobro.estado];
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="capitalize">{nombreMes(cobro.mes)}</span> · {cobro.concepto}
        </p>
        <Estado nivel={estado.nivel}>
          <span className="text-xs text-tenue">
            {cobro.cobrado && cobro.fechaCobro ? `Cobrado el ${fechaCorta(cobro.fechaCobro)}` : estado.texto}
          </span>
        </Estado>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="cifras text-sm font-medium">{euros(cobro.importe, true)}</span>
        {cobro.estado !== 'programado' && <BotonCobro ruta={ruta} linea={cobro.linea} cobrado={cobro.cobrado} />}
      </div>
    </li>
  );
}

function quienPaga(linea: LineaPlan): string {
  if (!linea.paga) return 'Tu trabajo';
  if (linea.paga === 'cliente') return 'Lo paga el cliente';
  return linea.cobro === 'incluido' ? 'Lo pagas tú, incluido en tu cuota' : 'Lo pagas tú y se lo cobras aparte';
}

function TablaPlan({ plan }: { plan: PlanAnual }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde">
      <table className={TABLA}>
        <thead>
          <tr>
            <th className={TH}>Concepto</th>
            <th className={`${TH} text-right`}>Importe</th>
            <th className={TH}>Quién paga</th>
          </tr>
        </thead>
        <tbody>
          {plan.lineas.map((linea, i) => (
            <tr key={i} className={FILA}>
              <td className={TD}>
                {linea.concepto}
                {linea.renueva && (
                  <span className="block text-xs text-apagado">
                    Renueva el {fechaCorta(linea.renueva)} de {linea.renueva.slice(0, 4)}
                  </span>
                )}
              </td>
              <td className={`${TD} cifras whitespace-nowrap text-right`}>
                {euros(linea.importe, true)}/{linea.cada}
              </td>
              <td className={`${TD} text-tenue`}>{quienPaga(linea)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={FILA}>
            <td className={`${TD} text-xs text-tenue`} colSpan={3}>
              Te paga {euros(plan.cuotaMensual, true)} al mes
              {plan.cobrosAnuales.length > 0 &&
                ` y ${plan.cobrosAnuales.map((l) => `${euros(l.importe, true)} al año por ${l.concepto}`).join(', ')}`}
              . Pagas tú {euros(plan.gastoMensual, true)} al mes a proveedores. Te quedan{' '}
              <strong className="font-semibold text-texto">{euros(plan.netoMensual, true)} al mes</strong>.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Renovaciones ─────────────────────────────────────────────────────────────

const esDominio = (concepto: string) => /\bdominio\b/i.test(concepto);

/**
 * Las apuntadas en las fichas y en los planes, y las que se averiguan solas (dominios
 * `.com`/`.net` por RDAP). Va aparte porque consulta la red.
 */
async function Renovaciones({ manuales, hoy }: { manuales: Renovacion[]; hoy: string }) {
  const estado = await estadoGeneral(await obtenerBoveda());

  const automaticas: Renovacion[] = estado.proyectos.flatMap(({ proyecto, dominio }) =>
    dominio?.caduca
      ? [
          {
            fecha: dominio.caduca.slice(0, 10),
            concepto: `Dominio ${dominio.nombre}`,
            origen: proyecto.cliente ?? proyecto.nota.nombre,
            automatica: true,
          },
        ]
      : [],
  );
  // Los que el registro no publica y tampoco están apuntados en un plan ni en una ficha
  const sinFecha = estado.proyectos
    .filter((p) => p.dominio && !p.dominio.caduca)
    .map((p) => p.dominio!.nombre)
    // Solo cuenta una renovación del dominio, no la de un certificado del mismo sitio
    .filter((dominio) => !manuales.some((r) => esDominio(r.concepto) && r.concepto.toLowerCase().includes(dominio)));

  // Un mismo dominio puede salir de la ficha, del plan y del registro: cuenta una vez. Solo se
  // juntan renovaciones de dominio; el certificado de ese mismo sitio es otra cosa y se queda
  const vistas = new Set<string>();
  const todas = [...manuales, ...automaticas]
    .filter((r) => {
      const nombre = r.concepto.toLowerCase().match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/)?.[0]?.replace(/^www\./, '');
      const clave = esDominio(r.concepto) && nombre ? `dominio:${nombre}` : `${r.fecha}|${r.concepto}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <Tarjeta titulo="Renovaciones" icono={CalendarClock} sinRelleno>
      <div id="renovaciones" className="scroll-mt-20" />
      {todas.length === 0 ? (
        <div className="p-4">
          <Vacio>No hay renovaciones apuntadas.</Vacio>
        </div>
      ) : (
        <ul className="divide-y divide-borde">
          {todas.map((r) => {
            const dias = diasEntre(hoy, r.fecha);
            const nivel: NivelEstado = dias < 0 ? 'critico' : dias < 30 ? 'grave' : dias < 60 ? 'aviso' : 'bien';
            return (
              <li key={`${r.fecha}-${r.concepto}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.concepto}</p>
                  <p className="text-xs text-tenue">
                    {fechaCorta(r.fecha)} {r.fecha.slice(0, 4)} · {r.automatica ? 'consultado en el registro' : 'apuntado en la bóveda'}
                  </p>
                </div>
                <Estado nivel={nivel}>{cuandoEs(r.fecha, hoy)}</Estado>
              </li>
            );
          })}
        </ul>
      )}
      {sinFecha.length > 0 && (
        <p className="border-t border-borde px-4 py-2.5 text-xs text-tenue">
          {sinFecha.join(', ')}: su registro no publica la caducidad. Apúntala en el plan de cobros (campo{' '}
          <code>renueva</code>) o en la sección «Renovaciones» de la ficha del cliente.
        </p>
      )}
    </Tarjeta>
  );
}
