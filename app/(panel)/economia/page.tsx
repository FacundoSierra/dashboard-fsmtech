import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarClock, Coins, FileText, HandCoins, Paperclip, PieChart, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react';
import { BotonCobro } from '@/components/boton-cobro';
import { ZONA_TOQUE } from '@/components/estilos';
import { CobroExtra, NuevaRenovacion } from '@/components/formularios-economia';
import { GraficoIngresos } from '@/components/grafico-ingresos';
import { BarrasHorizontales, FranjaCobros } from '@/components/graficos';
import {
  Chip,
  Encabezado,
  Estado,
  FILA,
  Filtro,
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
import { LINEAS, esLinea, lineaDe, obtenerBoveda, type Linea } from '@/lib/boveda/consultas';
import { documentos, facturaDe, hrefArchivo, type Documento } from '@/lib/documentos/documentos';
import {
  cobrosPorCobrar,
  economia,
  mediaSinCuota,
  mesesDelPlan,
  nombreMes,
  planVigente,
  sinCuotaFija,
  type Balance,
  type Cobro,
  type CobroDebido,
  type EconomiaCliente,
  type GastosNegocio,
  type LineaPlan,
  type PlanAnual,
  type Renovacion,
} from '@/lib/economia';
import { cuandoEs, diasEntre, fechaCorta, hoyMadrid } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral } from '@/lib/vigilancia/estado';

export const metadata: Metadata = { title: 'Economía' };

export default async function PaginaEconomia({ searchParams }: PageProps<'/economia'>) {
  const { linea: pedida } = await searchParams;
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const anio = Number(hoy.slice(0, 4));
  const linea = esLinea(pedida) ? pedida : undefined;
  const datos = economia(boveda, hoy, { linea });
  // Solo las líneas de negocio que tienen algún cliente: con una sola, el filtro sobra
  const lineas = [...new Set(boveda.notas.filter((n) => n.propiedades.tipo === 'cliente').map(lineaDe))] as Linea[];
  const conRentabilidad = datos.clientes
    .filter((c) => c.rentabilidad.cobrado > 0 || c.rentabilidad.coste > 0)
    .sort((a, b) => b.rentabilidad.margen - a.rentabilidad.margen);
  const hayPlanes = datos.clientes.some((c) => c.planes.length > 0);
  const docs = documentos(boveda);
  const debidos = cobrosPorCobrar(datos, hoy);
  // Lo que dejan los clientes menos lo que cuesta el negocio al mes: la cifra de Hoy
  const queda = datos.netoMensual - datos.negocio.alMes;

  return (
    <>
      <Encabezado titulo="Economía" subtitulo={`Lo acordado con cada cliente en ${anio} y lo que te han pagado`} />

      {(lineas.length > 1 || linea) && (
        <nav aria-label="Línea de negocio" className="-mt-2 mb-5 flex flex-wrap gap-2">
          {[undefined, ...lineas].map((valor) => (
            <Filtro key={valor ?? 'todas'} href={valor ? `/economia?linea=${valor}` : '/economia'} activo={linea === valor}>
              {valor ? LINEAS[valor] : 'Todas las líneas'}
            </Filtro>
          ))}
        </nav>
      )}

      {!hayPlanes ? (
        <div className="space-y-6">
        <Tarjeta>
          <Pendiente titulo="Todavía no hay planes de cobro">
            <p>
              Cada cliente lleva una nota por año en <code>clientes/&lt;cliente&gt;/cobros/&lt;cliente&gt;-cobros-{anio}.md</code>, con lo acordado
              (mantenimiento, dominio, hosting y quién paga cada cosa) y una casilla por cobro. El formato está en{' '}
              <code>docs/economia.md</code>. O dile a Claude el trato de cada cliente y lo apunta.
            </p>
          </Pendiente>
        </Tarjeta>
          <GastosDelNegocio negocio={datos.negocio} anio={anio} hoy={hoy} linea={linea} />
        </div>
      ) : (
        <div className="space-y-6">
          {/*
            Dos cifras que antes se llamaban igual: «Te queda al mes» ya descuenta los gastos del
            negocio (es la que sale en Hoy) y el «Margen de los clientes», no. Cada una con su nombre
          */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              destacada
              etiqueta="Te queda al mes"
              valor={euros(queda)}
              icono={Wallet}
              detalle={`Con los gastos del negocio: ${euros(datos.negocio.alMes)} al mes`}
            />
            <Kpi
              etiqueta="Margen de los clientes"
              valor={euros(datos.netoMensual)}
              icono={TrendingUp}
              detalle={
                `Al mes, te pagan ${euros(datos.ingresoMensual)} y pagas ${euros(datos.gastoMensual)} por ellos` +
                (datos.clientes.some((c) => c.plan?.estimado) ? '. Las sesiones, por su media' : '')
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
          </div>

          {/* Lo que más se hace en esta pantalla, arriba: antes, en el móvil, el primer botón estaba a casi 3.000 px */}
          <PorCobrar debidos={debidos} docs={docs} hoy={hoy} />

          <TarjetaBalance
            balance={datos.balance}
            anio={anio}
            alMes={{ tePagan: datos.ingresoMensual, porClientes: datos.gastoMensual, negocio: datos.negocio.alMes, queda }}
          />

          {/* grid-cols-1 es minmax(0, 1fr): sin él, la columna del móvil crece con su contenido. `items-start`: cada tarjeta, de su alto */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
            <Tarjeta titulo="Margen de los clientes, mes a mes" icono={TrendingUp} className="xl:col-span-3">
              {datos.serie.length < 2 ? (
                <Vacio>La evolución se dibuja a partir del segundo mes con planes.</Vacio>
              ) : (
                <>
                  <GraficoIngresos
                    titulo="Margen de los clientes, mes a mes"
                    puntos={datos.serie.map((p) => ({
                      eje: nombreMes(p.mes).split(' ')[0],
                      anio: p.mes.slice(2, 4),
                      etiqueta: nombreMes(p.mes, true),
                      valor: p.importe,
                      texto: euros(p.importe),
                    }))}
                  />
                  <details className="mt-1 text-sm">
                    {/* 20 px de texto y 12 arriba y abajo: 44 px de toque, sin quitarle el triángulo */}
                    <summary className="cursor-pointer py-3 text-tenue hover:text-texto">Ver como tabla</summary>
                    <table className={TABLA}>
                      <thead>
                        <tr>
                          <th className={TH}>Mes</th>
                          <th className={`${TH} text-right`}>Margen</th>
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
                titulo="Margen de cada cliente al mes"
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
                <TarjetaCliente key={c.nota.ruta} cliente={c} anio={anio} hoy={hoy} docs={docs} />
              ))}
            </div>
          </section>

          {/* Lo que no es del día a día, después de los clientes */}
          <Tarjeta titulo="Lo que te ha dejado cada cliente · últimos 12 meses" icono={HandCoins}>
            {conRentabilidad.length === 0 ? (
              <Vacio>Aún no hay cobros marcados en los últimos doce meses.</Vacio>
            ) : (
              <>
                <BarrasHorizontales
                  titulo="Lo que te ha dejado cada cliente en los últimos doce meses"
                  barras={conRentabilidad.map((c) => ({
                    clave: c.nota.nombre,
                    etiqueta: c.nota.titulo,
                    valor: Math.max(0, c.rentabilidad.margen),
                    texto: euros(c.rentabilidad.margen),
                    detalle: `cobrado ${euros(c.rentabilidad.cobrado)} − pagado a proveedores ${euros(c.rentabilidad.coste)}`,
                  }))}
                />
                <p className="mt-4 text-xs text-tenue">
                  Lo cobrado de verdad (casillas marcadas) menos lo que pagas tú por cada cliente según su plan: dominios, hosting y demás.
                  No cuenta tus horas.
                </p>
              </>
            )}
          </Tarjeta>

          <GastosDelNegocio negocio={datos.negocio} anio={anio} hoy={hoy} linea={linea} />
        </div>
      )}

      <div className="mt-6">
        <Suspense
          fallback={<div className="h-48 motion-safe:animate-pulse rounded-xl border border-borde bg-superficie" aria-label="Cargando renovaciones" />}
        >
          <Renovaciones
            manuales={datos.renovaciones}
            clientes={datos.clientes.map((c) => ({ ruta: c.nota.ruta, titulo: c.nota.titulo }))}
            hoy={hoy}
          />
        </Suspense>
      </div>
    </>
  );
}

// ── Balance y gastos del negocio ─────────────────────────────────────────────

/** Lo cobrado este año menos todo lo pagado, y la misma cuenta al mes con lo de hoy */
function TarjetaBalance({
  balance,
  anio,
  alMes,
}: {
  balance: Balance;
  anio: number;
  alMes: { tePagan: number; porClientes: number; negocio: number; queda: number };
}) {
  const filas = [
    { etiqueta: 'Cobrado', detalle: 'Casillas marcadas', valor: balance.cobrado, signo: '+' },
    { etiqueta: 'Pagado por tus clientes', detalle: 'Hosting, dominios, bases de datos… según sus planes', valor: balance.porClientes, signo: '−' },
    { etiqueta: 'Gastos del negocio', detalle: 'Tus herramientas y suscripciones, y los pagos sueltos', valor: balance.negocio, signo: '−' },
  ];
  const { queda } = alMes;

  return (
    <Tarjeta titulo={`Balance de ${anio}, hasta hoy`} icono={Scale}>
      <dl className="divide-y divide-borde text-sm">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
            <dt className="min-w-0">
              {f.etiqueta}
              <span className="block text-xs text-tenue">{f.detalle}</span>
            </dt>
            <dd className="cifras shrink-0">
              {f.valor ? f.signo : ''}
              {euros(f.valor, true)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 pt-2.5">
          <dt className="font-semibold">Resultado</dt>
          <dd className="cifras text-lg font-semibold">
            {balance.resultado > 0 ? '+' : balance.resultado < 0 ? '−' : ''}
            {euros(Math.abs(balance.resultado), true)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-tenue">
        Al mes, con los planes y las suscripciones de hoy: te pagan {euros(alMes.tePagan, true)}, pagas{' '}
        {euros(alMes.porClientes, true)} por tus clientes y {euros(alMes.negocio, true)} del negocio.{' '}
        {queda >= 0 ? `Te quedan ${euros(queda, true)} al mes` : `Pierdes ${euros(-queda, true)} al mes`}.
      </p>
    </Tarjeta>
  );
}

// ── Por cobrar ───────────────────────────────────────────────────────────────

/**
 * Los cobros de este mes y los atrasados de todos los clientes, con su botón. Los marcados hoy
 * se quedan en la lista con «Deshacer», en su sitio; sin nada que cobrar ni marcado hoy, no ocupa sitio
 */
function PorCobrar({ debidos, docs, hoy }: { debidos: CobroDebido[]; docs: Documento[]; hoy: string }) {
  if (debidos.length === 0) return null;
  const faltan = debidos.filter((d) => !d.cobro.cobrado).length;
  const claves = clavesEstables(debidos.map((d) => ({ ruta: d.plan.nota.ruta, cobro: d.cobro })));

  return (
    <Tarjeta titulo={faltan ? `Por cobrar · ${faltan}` : 'Por cobrar · todo marcado'} icono={Coins} sinRelleno>
      <div id="por-cobrar" className="scroll-mt-20" />
      <ul className="divide-y divide-borde">
        {debidos.map(({ cliente, plan, cobro }, i) => (
          <FilaCobro
            key={claves[i]}
            cobro={cobro}
            ruta={plan.nota.ruta}
            cliente={cliente.nota.nombre}
            titulo={cliente.nota.titulo}
            docs={docs}
            hoy={hoy}
          />
        ))}
      </ul>
    </Tarjeta>
  );
}

/**
 * Una clave por cobro que no cambia al marcarlo: la línea sí cambia (gana «— cobrado …»), y con
 * ella de clave React montaría un botón nuevo y se perdería el «Deshacer» de la fila
 */
function clavesEstables(cobros: { ruta: string; cobro: Cobro }[]): string[] {
  const vistas = new Map<string, number>();
  return cobros.map(({ ruta, cobro }) => {
    const base = `${ruta}|${cobro.mes}|${cobro.concepto}`;
    const veces = vistas.get(base) ?? 0;
    vistas.set(base, veces + 1);
    return veces ? `${base}|${veces}` : base;
  });
}

/** Lo que paga el negocio y no es de ningún cliente: de `negocio/gastos-fsmtech.md` */
function GastosDelNegocio({ negocio, anio, hoy, linea }: { negocio: GastosNegocio; anio: number; hoy: string; linea?: Linea }) {
  const hay = negocio.suscripciones.length > 0 || negocio.sueltos.length > 0;
  return (
    <Tarjeta
      titulo="Gastos del negocio"
      icono={Receipt}
      sinRelleno
      accion={
        negocio.nota && (
          <Link href={hrefNota(negocio.nota.ruta)} className={`${ZONA_TOQUE} text-xs text-tenue hover:text-acento`}>
            Ver la nota
          </Link>
        )
      }
    >
      {!hay ? (
        <div className="p-4">
          <Vacio>
            {linea
              ? 'No hay gastos del negocio de esta línea. Los generales salen en «Todas las líneas».'
              : 'Tus herramientas y suscripciones van en negocio/gastos-fsmtech.md (plantilla templates/gastos.md). O díselas a Claude y las apunta.'}
          </Vacio>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-borde">
            {negocio.suscripciones.map((s) => (
              <li key={`${s.concepto}-${s.desde}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {s.concepto}
                    {s.baja && (
                      <span className="ml-2">
                        <Chip>{s.baja > hoy ? 'no se renueva' : 'de baja'}</Chip>
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tenue">
                    {euros(s.importe, true)} al {s.cada === 'año' ? 'año' : 'mes'} ·{' '}
                    {s.proximo
                      ? `próximo cargo el ${fechaCorta(s.proximo)} ${s.proximo.slice(0, 4)}`
                      : s.baja! > hoy
                        ? `darse de baja antes del ${fechaCorta(s.baja!)} ${s.baja!.slice(0, 4)}`
                        : `de baja desde el ${fechaCorta(s.baja!)} ${s.baja!.slice(0, 4)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="cifras text-sm">{euros(s.pagadoAnio, true)}</p>
                  <p className="text-xs text-tenue">en {anio}</p>
                </div>
              </li>
            ))}
            {negocio.sueltos.map((p) => (
              <li key={`${p.fecha}-${p.concepto}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.concepto}</p>
                  <p className="text-xs text-tenue">Pago suelto · {fechaCorta(p.fecha)}</p>
                </div>
                <p className="cifras shrink-0 text-sm">{euros(p.importe, true)}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-borde px-4 py-2.5 text-xs text-tenue">
            En {anio}, {euros(negocio.pagadoAnio, true)}. Al mes, lo que sigue cobrándose: {euros(negocio.alMes, true)}.
            {linea ? ' Solo las de esta línea: las generales salen en «Todas las líneas».' : ''} Lo que pagas por un cliente va en
            su nota de cobros.
          </p>
        </>
      )}
    </Tarjeta>
  );
}

// ── Tarjeta de un cliente ────────────────────────────────────────────────────

function estadoCobros(c: EconomiaCliente, plan: PlanAnual | undefined): { nivel: NivelEstado; texto: string } {
  if (!plan) return { nivel: 'sin-datos', texto: 'Sin plan en vigor' };
  // Un plan que todavía no ha empezado no es «sin plan»: se dice cuándo empieza
  if (!c.plan) return { nivel: 'neutro', texto: `Empieza en ${nombreMes(plan.desde, true).replace(/ de \d{4}$/, '')}` };
  if (c.atrasados.length) return { nivel: 'grave', texto: `${c.atrasados.length} sin cobrar` };
  if (c.pendiente) return { nivel: 'aviso', texto: 'Pendiente este mes' };
  return { nivel: 'bien', texto: 'Al día' };
}

function TarjetaCliente({ cliente, anio, hoy, docs }: { cliente: EconomiaCliente; anio: number; hoy: string; docs: Documento[] }) {
  const plan = cliente.plan ?? cliente.proximo;
  const estado = estadoCobros(cliente, plan);
  const claves = plan ? clavesEstables(plan.cobros.map((cobro) => ({ ruta: plan.nota.ruta, cobro }))) : [];

  return (
    <article id={`cliente-${cliente.nota.nombre}`} className="scroll-mt-20 rounded-xl border border-borde bg-superficie shadow-tarjeta">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">
            <Link href={hrefNota(cliente.nota.ruta)} className={`${ZONA_TOQUE} hover:text-acento`}>
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
            {cliente.linea !== 'desarrollo' && <Chip>{LINEAS[cliente.linea]}</Chip>}
          </div>
          {cliente.rentabilidad.cobrado > 0 && (
            <p className="mt-1 text-xs text-tenue">
              En 12 meses te ha dejado <span className="cifras font-medium text-texto">{euros(cliente.rentabilidad.margen, true)}</span>
            </p>
          )}
        </div>
        {plan && <CuotaDelPlan plan={plan} hoy={hoy} />}
      </div>

      {!plan ? (
        <p className="border-t border-borde px-4 py-3 text-xs text-tenue">
          Sin plan de cobros en vigor. Se crea en <code>clientes/{cliente.nota.nombre}/cobros/{cliente.nota.nombre}-cobros-{anio}.md</code>.
        </p>
      ) : (
        <>
          {/* Lo que hay que cobrar ya está arriba, en «Por cobrar»: aquí, la franja y el trato entero */}
          <div className="px-4 pb-4">
            <FranjaCobros meses={mesesDelPlan(plan)} cobros={plan.cobros} nombre={cliente.nota.titulo} />
          </div>

          <details className="border-t border-borde">
            {/* 16 px de texto y 14 arriba y abajo: 44 px de toque, con su triángulo */}
            <summary className="cursor-pointer px-4 py-3.5 text-xs text-tenue hover:text-texto">El trato y todos sus cobros</summary>
            <div className="space-y-3 px-4 pb-2">
              <TablaPlan plan={plan} />
              {plan.cobros.length > 0 && (
                <ul className="divide-y divide-borde rounded-lg border border-borde">
                  {plan.cobros.map((cobro, i) => (
                    <FilaCobro key={claves[i]} cobro={cobro} ruta={plan.nota.ruta} cliente={cliente.nota.nombre} docs={docs} hoy={hoy} />
                  ))}
                </ul>
              )}
              <Link href={hrefNota(plan.nota.ruta)} className="inline-flex min-h-11 items-center gap-1 text-xs text-tenue hover:text-acento">
                <FileText className="size-3.5" aria-hidden />
                Abrir la nota de cobros
              </Link>
            </div>
          </details>

          <div className="border-t border-borde px-4 py-2.5">
            <CobroExtra ruta={plan.nota.ruta} hoy={hoy} />
          </div>
        </>
      )}
    </article>
  );
}

/**
 * Lo que paga y el margen que deja. Sin cuota fija (OVB, que liquida comisiones; un cliente que no
 * paga) lo dice en vez de enseñar «0 €/mes», y si ha ido pagando, la media de lo cobrado
 */
function CuotaDelPlan({ plan, hoy }: { plan: PlanAnual; hoy: string }) {
  const media = sinCuotaFija(plan) ? mediaSinCuota(plan, hoy) : undefined;
  const anual = plan.cobrosAnuales.reduce((t, l) => t + l.importe, 0);
  const cifras: { etiqueta: string; valor: string; ayuda?: string }[] = sinCuotaFija(plan)
    ? [
        { etiqueta: 'Te paga', valor: 'Sin cuota fija' },
        ...(media !== undefined
          ? [{ etiqueta: 'De media', valor: `≈ ${euros(media, true)}/mes`, ayuda: 'Lo cobrado en los meses ya cerrados del trato, entre esos meses. No suma en el margen' }]
          : plan.gastoMensual
            ? [{ etiqueta: 'Margen', valor: `${euros(plan.netoMensual, true)}/mes`, ayuda: 'Lo que pagas tú por él' }]
            : []),
      ]
    : plan.tarifas.length && plan.cuotaMensual === 0 && anual === 0
      ? [
          { etiqueta: 'Tarifa', valor: plan.tarifas.map((t) => `${euros(t.importe, true)}/${t.cada === 'hora' ? 'hora' : 'sesión'}`).join(' · ') },
          { etiqueta: 'Margen de media', valor: `${euros(plan.netoMensual, true)}/mes` },
        ]
      : [
          { etiqueta: 'Te paga', valor: plan.cuotaMensual || !anual ? `${euros(plan.cuotaMensual, true)}/mes` : `${euros(anual, true)}/año` },
          { etiqueta: 'Margen', valor: `${euros(plan.netoMensual, true)}/mes` },
        ];

  return (
    <dl className="flex gap-5 text-right">
      {cifras.map((c) => (
        <div key={c.etiqueta} title={c.ayuda}>
          <dt className="text-xs text-apagado">{c.etiqueta}</dt>
          <dd className="cifras text-sm font-semibold">{c.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

const ESTADO_COBRO: Record<Cobro['estado'], { nivel: NivelEstado; texto: string }> = {
  cobrado: { nivel: 'bien', texto: 'Cobrado' },
  atrasado: { nivel: 'grave', texto: 'Atrasado' },
  pendiente: { nivel: 'aviso', texto: 'Este mes' },
  programado: { nivel: 'sin-datos', texto: 'Por cobrar' },
};

/** Una fila de cobro. Con `titulo` (el del cliente), para la lista de «Por cobrar», que los junta todos */
function FilaCobro({
  cobro,
  ruta,
  cliente,
  titulo,
  docs,
  hoy,
}: {
  cobro: Cobro;
  ruta: string;
  cliente: string;
  titulo?: string;
  docs: Documento[];
  hoy: string;
}) {
  const estado = ESTADO_COBRO[cobro.estado];
  const factura = facturaDe(docs, cliente, cobro.mes, cobro.importe);
  return (
    // Si no caben, el importe y el botón bajan a su línea: al lado, en el móvil, el concepto se cortaba
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      <div className="min-w-0 flex-1 basis-60">
        {titulo && <p className="truncate text-sm font-medium">{titulo}</p>}
        <p className={`break-words text-sm ${titulo ? 'text-tenue' : ''}`}>
          <span className="capitalize">{nombreMes(cobro.mes)}</span> · {cobro.concepto}
        </p>
        <div className="flex flex-wrap items-center gap-x-4">
          <Estado nivel={estado.nivel}>
            {/* Que se parta: en una fila estrecha del móvil, entero se montaba sobre el importe */}
            <span className="whitespace-normal text-xs text-tenue">
              {cobro.cobrado && cobro.fechaCobro ? `Cobrado el ${fechaCorta(cobro.fechaCobro)}` : estado.texto}
            </span>
          </Estado>
          {factura ? (
            <a
              href={hrefArchivo(factura)}
              target="_blank"
              rel="noreferrer"
              className={`${ZONA_TOQUE} inline-flex items-center gap-1 text-xs text-acento hover:underline`}
            >
              <Paperclip className="size-3" aria-hidden />
              Factura
            </a>
          ) : (
            cobro.estado !== 'programado' && (
              <Link
                href={`/documentos?cliente=${encodeURIComponent(cliente)}&categoria=factura&cobro=${cobro.mes}#subir`}
                className={`${ZONA_TOQUE} inline-flex items-center gap-1 text-xs text-apagado hover:text-acento`}
              >
                <Paperclip className="size-3" aria-hidden />
                Sin factura
              </Link>
            )
          )}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="cifras text-sm font-medium">{euros(cobro.importe, true)}</span>
        {cobro.estado !== 'programado' && (
          <BotonCobro ruta={ruta} linea={cobro.linea} cobrado={cobro.cobrado} marcadoHoy={cobro.fechaCobro === hoy} />
        )}
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
  // OVB: sin líneas en el plan, lo que entra son las casillas de cada liquidación
  if (plan.lineas.length === 0) {
    return <p className="text-xs text-tenue">Sin cuota fija ni tarifa en el plan: lo que entra se apunta en los cobros de cada mes.</p>;
  }
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
                {euros(linea.importe, true)}/{linea.cada === 'sesion' ? 'sesión' : linea.cada}
              </td>
              <td className={`${TD} text-tenue`}>{quienPaga(linea)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={FILA}>
            <td className={`${TD} text-xs text-tenue`} colSpan={3}>
              {sinCuotaFija(plan) ? 'Sin cuota fija' : `Te paga ${euros(plan.cuotaMensual, true)} al mes`}
              {plan.cobrosAnuales.length > 0 &&
                ` y ${plan.cobrosAnuales.map((l) => `${euros(l.importe, true)} al año por ${l.concepto}`).join(', ')}`}
              . Pagas tú {euros(plan.gastoMensual, true)} al mes a proveedores. Margen:{' '}
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
async function Renovaciones({
  manuales,
  clientes,
  hoy,
}: {
  manuales: Renovacion[];
  /** Las fichas donde se puede apuntar una renovación */
  clientes: { ruta: string; titulo: string }[];
  hoy: string;
}) {
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
      {clientes.length > 0 && (
        <div className="border-t border-borde px-4 py-2.5">
          <NuevaRenovacion clientes={clientes} hoy={hoy} />
        </div>
      )}
    </Tarjeta>
  );
}
