import 'server-only';
import { destinoEnlace, esLinea, estadoClienteDe, lineaDe, lista, type EstadoCliente, type Linea } from '@/lib/boveda/consultas';
import { contenidoSeccion, vinetasDe } from '@/lib/boveda/parser';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { esFechaValida } from '@/lib/fechas';

/**
 * Economía del negocio: lo acordado con cada cliente y lo cobrado.
 *
 * Cada cliente tiene una nota por cada periodo de su trato, normalmente un año desde que
 * empieza (de septiembre a agosto, por ejemplo), en
 * `clientes/<cliente>/cobros/<cliente>-cobros-<año en que empieza>.md`:
 *
 *  - En sus propiedades, el **plan** del año: una línea por concepto. Las líneas sin `paga`
 *    son trabajo de Facundo (mantenimiento, desarrollo). Las que llevan `paga` son servicios
 *    de terceros (dominio, hosting), y dicen quién paga al proveedor y, si paga Facundo, si
 *    se cobran aparte o salen de su cuota.
 *  - En su cuerpo, los **cobros**: una casilla por cobro, que se marca al cobrar.
 *
 * Con eso salen los tres casos que hay:
 *
 *  | Trato                               | Cobra al cliente | Paga él | Le queda |
 *  |-------------------------------------|------------------|---------|----------|
 *  | Lo pago yo y se lo cobro aparte     | 50 + 12          | 12      | 50       |
 *  | Lo pago yo y va incluido (familia)  | 50               | 12      | 38       |
 *  | Lo paga el cliente                  | 50               | 0       | 50       |
 *
 * Formato completo en `docs/economia.md`.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/**
 * `mes` y `año` son cuotas: salen en lo que queda cada mes. `sesion` y `hora` son tarifas (la
 * consultoría): no suman nada fijo, lo que entra es lo que se apunta en los cobros de cada mes
 */
export type Periodicidad = 'mes' | 'año' | 'sesion' | 'hora';

export interface LineaPlan {
  concepto: string;
  importe: number;
  cada: Periodicidad;
  /** Quién paga al proveedor. Sin este campo, la línea es trabajo propio que se cobra */
  paga?: 'yo' | 'cliente';
  /** Si paga Facundo: `aparte` se le cobra al cliente además; `incluido` sale de su cuota */
  cobro?: 'aparte' | 'incluido';
  renueva?: string;
}

export type EstadoCobro = 'cobrado' | 'atrasado' | 'pendiente' | 'programado';

export interface Cobro {
  /** La línea tal cual está en la nota: identifica la casilla al marcarla desde el panel */
  linea: string;
  /** `YYYY-MM` al que corresponde */
  mes: string;
  concepto: string;
  importe: number;
  cobrado: boolean;
  fechaCobro?: string;
  estado: EstadoCobro;
}

export interface PlanAnual {
  nota: Nota;
  /** Nombre de la nota del cliente */
  cliente: string;
  anio: number;
  /** Primer y último mes en que rige el plan, `YYYY-MM`. Por defecto, doce meses desde `desde` */
  desde: string;
  hasta: string;
  lineas: LineaPlan[];
  /** Lo que el cliente paga cada mes */
  cuotaMensual: number;
  /** Lo que se le cobra una vez al año */
  cobrosAnuales: LineaPlan[];
  /** Lo que se le cobra por sesión o por hora, sin cuota fija */
  tarifas: LineaPlan[];
  /** Lo que Facundo paga a proveedores, repartido por meses */
  gastoMensual: number;
  /**
   * Lo que le queda cada mes, con los cobros anuales repartidos. En un plan solo de tarifas
   * (sesiones, horas), la media de lo cobrado en los meses ya cerrados del plan: ver `estimado`
   */
  netoMensual: number;
  /** El neto sale de la media de lo cobrado, no de una cuota fija */
  estimado: boolean;
  cobros: Cobro[];
}

/** Lo que ha dejado un cliente en los últimos doce meses, este incluido */
export interface Rentabilidad {
  /** Casillas marcadas: dinero que ha entrado de verdad */
  cobrado: number;
  /** Lo que Facundo ha pagado a proveedores por él (dominios, hosting…), según el plan de cada mes */
  coste: number;
  margen: number;
}

export interface EconomiaCliente {
  nota: Nota;
  linea: Linea;
  estado: EstadoCliente;
  rentabilidad: Rentabilidad;
  /** El plan en vigor este mes */
  plan?: PlanAnual;
  /** Si no hay plan en vigor, el siguiente que va a empezar */
  proximo?: PlanAnual;
  planes: PlanAnual[];
  cobradoAnio: number;
  /** Lo que ya debería haber cobrado y no ha cobrado (este mes y anteriores) */
  pendiente: number;
  atrasados: Cobro[];
}

export interface PuntoMensual {
  mes: string;
  importe: number;
}

export interface Renovacion {
  fecha: string;
  concepto: string;
  /** Nombre de la nota del cliente */
  origen: string;
  automatica: boolean;
}

/** Algo que el negocio paga solo, cada mes o cada año: una herramienta, una suscripción */
export interface Suscripcion {
  concepto: string;
  importe: number;
  cada: 'mes' | 'año';
  /** Día del primer cargo, `AAAA-MM-DD`. Los siguientes caen el mismo día de cada mes o año */
  desde: string;
  /** Día en que ya no se cobra, porque se da de baja: ese cargo no cuenta */
  baja?: string;
  linea?: Linea;
  /** El siguiente cargo después de hoy. Sin él, ya no se cobra más */
  proximo?: string;
  /** Lo cargado este año hasta hoy */
  pagadoAnio: number;
  /** Lo que supone cada mes, con lo anual repartido. Cero si ya no se cobra */
  alMes: number;
}

export interface PagoSuelto {
  fecha: string;
  concepto: string;
  importe: number;
}

/** Los gastos del negocio que no son de ningún cliente (`negocio/gastos-fsmtech.md`) */
export interface GastosNegocio {
  /** La nota de gastos, si la hay */
  nota?: Nota;
  suscripciones: Suscripcion[];
  /** Los pagos sueltos de este año, hasta hoy */
  sueltos: PagoSuelto[];
  /** Suscripciones y pagos sueltos de este año, hasta hoy */
  pagadoAnio: number;
  /** Lo que suponen al mes las suscripciones que siguen en vigor */
  alMes: number;
}

/** Este año hasta hoy: lo cobrado menos todo lo pagado */
export interface Balance {
  /** Casillas marcadas */
  cobrado: number;
  /** Lo que pagas por tus clientes según sus planes (`paga: yo`), mes a mes hasta este */
  porClientes: number;
  /** Los gastos del negocio: suscripciones y pagos sueltos */
  negocio: number;
  resultado: number;
}

export interface Economia {
  clientes: EconomiaCliente[];
  negocio: GastosNegocio;
  balance: Balance;
  /** Lo que queda cada mes, sumando los planes en vigor */
  netoMensual: number;
  /** Lo que pagan los clientes al mes, con los cobros anuales repartidos */
  ingresoMensual: number;
  gastoMensual: number;
  /** Cobrado de verdad este año: casillas marcadas */
  cobradoAnio: number;
  pendiente: number;
  atrasados: { cliente: EconomiaCliente; cobro: Cobro }[];
  /** Clientes con plan en vigor este mes */
  conPlan: number;
  principal?: { cliente: EconomiaCliente; porcentaje: number };
  /** Neto de cada mes, del primer plan a hoy (máximo 24 meses) */
  serie: PuntoMensual[];
  variacion: number;
  renovaciones: Renovacion[];
}

// ── Meses ────────────────────────────────────────────────────────────────────

const mesDe = (fecha: string) => fecha.slice(0, 7);
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function sumarMeses(mes: string, n: number): string {
  const [anio, m] = mes.split('-').map(Number);
  const total = anio * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  for (let mes = desde; mes <= hasta; mes = sumarMeses(mes, 1)) meses.push(mes);
  return meses;
}

/** `2026-09` → `sep 2026`; con `largo`, `septiembre de 2026` */
export function nombreMes(mes: string, largo = false): string {
  const [anio, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { month: largo ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(anio, m - 1, 1)))
    .replace('.', '');
}

export { mesDe, sumarMeses };

// ── Lectura del plan ─────────────────────────────────────────────────────────

/**
 * Importes escritos a la española: `58`, `58,50`, `1.200` y `1.200,50`. Con el punto como
 * decimal, «1.200 €» se leería como 1,2 €.
 */
export function numero(valor: unknown): number | undefined {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  const limpio = valor.replace(/[€\s]/g, '');
  const normalizado = /,\d{1,2}$/.test(limpio)
    ? limpio.replace(/\./g, '').replace(',', '.')
    : /\.\d{3}$/.test(limpio)
      ? limpio.replace(/\./g, '')
      : limpio.replace(',', '.');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : undefined;
}

function textoPlano(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim().toLowerCase() : undefined;
}

function periodicidad(valor: unknown): Periodicidad {
  const cada = textoPlano(valor) ?? '';
  if (/^(año|ano|anual|year)/.test(cada)) return 'año';
  if (/^(sesi[oó]n|sesiones|visita)/.test(cada)) return 'sesion';
  if (/^(hora|horas|h)$/.test(cada)) return 'hora';
  return 'mes';
}

function lineaDePlan(valor: unknown): LineaPlan | null {
  if (!valor || typeof valor !== 'object') return null;
  const l = valor as Record<string, unknown>;
  const concepto = typeof l.concepto === 'string' ? l.concepto.trim() : '';
  const importe = numero(l.importe);
  if (!concepto || importe === undefined) return null;

  const paga = textoPlano(l.paga);
  const cobro = textoPlano(l.cobro);
  return {
    concepto,
    importe,
    cada: periodicidad(l.cada),
    paga: paga === 'yo' ? 'yo' : paga === 'cliente' ? 'cliente' : undefined,
    // Si paga Facundo y no se dice nada, se entiende que se lo cobra aparte
    cobro: paga === 'yo' ? (cobro === 'incluido' ? 'incluido' : 'aparte') : undefined,
    renueva: esFechaValida(l.renueva) ? l.renueva : undefined,
  };
}

/** Lo que se le cobra al cliente: el trabajo propio y lo que se le repercute */
const seCobra = (l: LineaPlan) => l.paga === undefined || (l.paga === 'yo' && l.cobro === 'aparte');
const loPagoYo = (l: LineaPlan) => l.paga === 'yo';
/** Lo que supone cada mes: las tarifas no suman nada fijo */
const alMes = (l: LineaPlan) => (l.cada === 'mes' ? l.importe : l.cada === 'año' ? l.importe / 12 : 0);
const esTarifa = (l: LineaPlan) => l.cada === 'sesion' || l.cada === 'hora';

// ── Lectura de los cobros ────────────────────────────────────────────────────

/**
 * `- [x] 2026-10 — Mantenimiento y hosting — 58 € — cobrado 2026-10-03`
 * Acepta raya, semiraya o guion entre las partes, y texto de más al final (un enlace a la factura).
 */
export const RE_COBRO = /^\s*[-*+] \[([ xX])\] (\d{4}-\d{2})\s*[—–-]\s*(.+?)\s*[—–-]\s*([\d.,]+)\s*€(.*)$/;

function cobrosDe(nota: Nota, mesActual: string): Cobro[] {
  const seccion = contenidoSeccion(nota, 'cobros') ?? '';
  return seccion.split(/\r?\n/).flatMap((linea): Cobro[] => {
    const partes = linea.match(RE_COBRO);
    if (!partes || !RE_MES.test(partes[2])) return [];
    const importe = numero(partes[4]);
    if (importe === undefined) return [];
    const cobrado = partes[1] !== ' ';
    const mes = partes[2];
    return [
      {
        linea: linea.trim(),
        mes,
        concepto: partes[3],
        importe,
        cobrado,
        fechaCobro: partes[5].match(/cobrado (\d{4}-\d{2}-\d{2})/)?.[1],
        estado: cobrado ? 'cobrado' : mes < mesActual ? 'atrasado' : mes === mesActual ? 'pendiente' : 'programado',
      },
    ];
  });
}

function planDe(nota: Nota, mesActual: string): PlanAnual | null {
  const p = nota.propiedades;
  const anio = numero(p.anio);
  const cliente = lista(p.cliente).map(destinoEnlace)[0] ?? nota.ruta.split('/')[1];
  if (!anio || !cliente) return null;

  const lineas = (Array.isArray(p.plan) ? p.plan : []).map(lineaDePlan).filter((l): l is LineaPlan => l !== null);
  // El trato va por años desde que empieza, no por años naturales: sin `hasta`, dura doce meses
  const desde = typeof p.desde === 'string' && RE_MES.test(p.desde) ? p.desde : `${anio}-01`;
  const hasta = typeof p.hasta === 'string' && RE_MES.test(p.hasta) ? p.hasta : sumarMeses(desde, 11);

  const mensuales = lineas.filter((l) => l.cada === 'mes');
  const cuotaMensual = mensuales.filter(seCobra).reduce((t, l) => t + l.importe, 0);
  const cobrosAnuales = lineas.filter((l) => l.cada === 'año' && seCobra(l));
  const tarifas = lineas.filter((l) => esTarifa(l) && seCobra(l));
  const gastoMensual = lineas.filter(loPagoYo).reduce((t, l) => t + alMes(l), 0);
  const cobros = cobrosDe(nota, mesActual);

  // Solo tarifas, sin cuota: lo que entra cada mes no se sabe de antemano. Se toma la media de
  // lo cobrado en los meses del plan que ya han terminado (el de hoy aún puede cambiar)
  const estimado = tarifas.length > 0 && cuotaMensual === 0 && cobrosAnuales.length === 0;
  const cerrados = mesesEntre(desde, [hasta, sumarMeses(mesActual, -1)].sort()[0]);
  const mediaTarifas =
    estimado && cerrados.length
      ? cobros.filter((c) => c.cobrado && c.mes >= desde && c.mes < mesActual).reduce((t, c) => t + c.importe, 0) / cerrados.length
      : 0;
  const ingreso = lineas.filter(seCobra).reduce((t, l) => t + alMes(l), 0) + mediaTarifas;

  return {
    nota,
    cliente,
    anio,
    desde,
    hasta,
    lineas,
    cuotaMensual,
    cobrosAnuales,
    tarifas,
    gastoMensual,
    netoMensual: ingreso - gastoMensual,
    estimado,
    cobros,
  };
}

/** El plan que rige en un mes: el de ese año, si el mes cae dentro */
function planEnMes(planes: PlanAnual[], mes: string): PlanAnual | undefined {
  return planes.find((p) => mes >= p.desde && mes <= p.hasta);
}

// ── Renovaciones ─────────────────────────────────────────────────────────────

const RE_RENOVACION = /^(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(.+)$/;

function renovacionesDe(nota: Nota): Renovacion[] {
  return vinetasDe(contenidoSeccion(nota, 'renovaciones') ?? '').flatMap((linea) => {
    const partes = linea.match(RE_RENOVACION);
    return partes && esFechaValida(partes[1])
      ? [{ fecha: partes[1], concepto: partes[2].trim(), origen: nota.nombre, automatica: false }]
      : [];
  });
}

// ── Gastos del negocio ───────────────────────────────────────────────────────

/**
 * El mismo día, `meses` después. Si ese mes no tiene ese día (un 31, un 29 de febrero), el
 * último del mes: es lo que hacen los cargos de verdad
 */
function mismoDiaTras(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/** Los cargos de una suscripción desde el primero hasta `hasta` (incluido), sin los de después de la baja */
function cargosHasta(s: Pick<Suscripcion, 'desde' | 'cada' | 'baja'>, hasta: string): string[] {
  const paso = s.cada === 'año' ? 12 : 1;
  const cargos: string[] = [];
  // Tope de vueltas: cincuenta años de cargos mensuales, por si una fecha viniera rara
  for (let i = 0; i < 600; i++) {
    const fecha = mismoDiaTras(s.desde, i * paso);
    if (fecha > hasta || (s.baja && fecha >= s.baja)) break;
    cargos.push(fecha);
  }
  return cargos;
}

function suscripcionDe(valor: unknown): Pick<Suscripcion, 'concepto' | 'importe' | 'cada' | 'desde' | 'baja' | 'linea'> | null {
  if (!valor || typeof valor !== 'object') return null;
  const s = valor as Record<string, unknown>;
  const concepto = typeof s.concepto === 'string' ? s.concepto.trim() : '';
  const importe = numero(s.importe);
  // Sin el día del primer cargo no se sabe cuándo se paga
  if (!concepto || importe === undefined || !esFechaValida(s.desde)) return null;
  const linea = textoPlano(s.linea);
  return {
    concepto,
    importe,
    cada: periodicidad(s.cada) === 'año' ? 'año' : 'mes',
    desde: s.desde,
    baja: esFechaValida(s.baja) ? s.baja : undefined,
    linea: esLinea(linea) ? linea : undefined,
  };
}

/** `- 2026-11-03 — Curso de Next — 49,90 €` */
const RE_PAGO_SUELTO = /^(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+?)\s*[—–-]\s*([\d.,]+)\s*€/;

/**
 * Lo que paga el negocio y no es de ningún cliente, de las notas `tipo: gastos`. Con `linea`,
 * solo las suscripciones de esa línea: los gastos generales y los pagos sueltos no son de
 * ninguna y salen en «Todas las líneas»
 */
function gastosNegocio(boveda: Boveda, hoy: string, linea?: Linea): GastosNegocio {
  const notas = boveda.notas.filter((nota) => nota.propiedades.tipo === 'gastos');
  const inicioAnio = `${hoy.slice(0, 4)}-01-01`;

  const suscripciones = notas
    .flatMap((nota) => (Array.isArray(nota.propiedades.suscripciones) ? nota.propiedades.suscripciones : []))
    .map(suscripcionDe)
    .filter((s): s is NonNullable<typeof s> => s !== null && (!linea || s.linea === linea))
    .map((s): Suscripcion => {
      const hastaHoy = cargosHasta(s, hoy);
      // El siguiente al último cargado (o el primero, si aún no ha llegado), si no cae en la baja
      const siguiente = mismoDiaTras(s.desde, hastaHoy.length * (s.cada === 'año' ? 12 : 1));
      const proximo = s.baja && siguiente >= s.baja ? undefined : siguiente;
      return {
        ...s,
        proximo,
        pagadoAnio: hastaHoy.filter((fecha) => fecha >= inicioAnio).length * s.importe,
        alMes: proximo ? (s.cada === 'año' ? s.importe / 12 : s.importe) : 0,
      };
    })
    .sort((a, b) => b.alMes - a.alMes || a.concepto.localeCompare(b.concepto, 'es'));

  const sueltos = linea
    ? []
    : notas
        .flatMap((nota) => vinetasDe(contenidoSeccion(nota, 'pagos sueltos') ?? ''))
        .flatMap((vineta): PagoSuelto[] => {
          const partes = vineta.match(RE_PAGO_SUELTO);
          const importe = partes ? numero(partes[3]) : undefined;
          return partes && esFechaValida(partes[1]) && importe !== undefined
            ? [{ fecha: partes[1], concepto: partes[2].trim(), importe }]
            : [];
        })
        .filter((p) => p.fecha >= inicioAnio && p.fecha <= hoy)
        .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    nota: notas[0],
    suscripciones,
    sueltos,
    pagadoAnio: suscripciones.reduce((t, s) => t + s.pagadoAnio, 0) + sueltos.reduce((t, p) => t + p.importe, 0),
    alMes: suscripciones.reduce((t, s) => t + s.alMes, 0),
  };
}

// ── Resumen ──────────────────────────────────────────────────────────────────

const MESES_SERIE = 24;

/** `linea`: solo los clientes de esa línea de negocio, y todas las cifras sacadas de ellos */
export function economia(boveda: Boveda, hoy: string, filtro: { linea?: Linea } = {}): Economia {
  const mesActual = mesDe(hoy);
  const anioActual = Number(hoy.slice(0, 4));
  const ultimoAnio = mesesEntre(sumarMeses(mesActual, -11), mesActual);

  const fichas = boveda.notas.filter(
    (nota) => nota.propiedades.tipo === 'cliente' && (!filtro.linea || lineaDe(nota) === filtro.linea),
  );
  const deLaLinea = new Set(fichas.map((ficha) => ficha.nombre));

  const planes = boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'cobros')
    .map((nota) => planDe(nota, mesActual))
    .filter((p): p is PlanAnual => p !== null && (!filtro.linea || deLaLinea.has(p.cliente)))
    .sort((a, b) => a.anio - b.anio);

  const clientes = fichas
    .map((nota): EconomiaCliente => {
      const suyos = planes.filter((p) => p.cliente === nota.nombre);
      const cobros = suyos.flatMap((p) => p.cobros);
      const debidos = cobros.filter((c) => c.estado === 'atrasado' || c.estado === 'pendiente');
      const cobrado = cobros.filter((c) => c.cobrado && c.mes >= ultimoAnio[0] && c.mes <= mesActual).reduce((t, c) => t + c.importe, 0);
      const coste = ultimoAnio.reduce((t, mes) => t + (planEnMes(suyos, mes)?.gastoMensual ?? 0), 0);
      return {
        nota,
        linea: lineaDe(nota),
        estado: estadoClienteDe(nota),
        rentabilidad: { cobrado, coste, margen: cobrado - coste },
        plan: planEnMes(suyos, mesActual),
        proximo: [...suyos].sort((a, b) => a.desde.localeCompare(b.desde)).find((p) => p.desde > mesActual),
        planes: suyos,
        cobradoAnio: cobros.filter((c) => c.cobrado && c.mes.startsWith(`${anioActual}-`)).reduce((t, c) => t + c.importe, 0),
        pendiente: debidos.reduce((t, c) => t + c.importe, 0),
        atrasados: cobros.filter((c) => c.estado === 'atrasado'),
      };
    })
    .sort(
      (a, b) =>
        (planEnMes(b.planes, mesActual)?.netoMensual ?? 0) - (planEnMes(a.planes, mesActual)?.netoMensual ?? 0) ||
        a.nota.titulo.localeCompare(b.nota.titulo, 'es'),
    );

  const netoEn = (mes: string) =>
    clientes.reduce((total, c) => total + (planEnMes(c.planes, mes)?.netoMensual ?? 0), 0);

  const vigentes = clientes.map((c) => planEnMes(c.planes, mesActual)).filter((p): p is PlanAnual => Boolean(p));
  const netoMensual = netoEn(mesActual);

  const primerMes = planes.map((p) => p.desde).sort()[0];
  const inicioSerie = primerMes ? [primerMes, sumarMeses(mesActual, -(MESES_SERIE - 1))].sort().at(-1)! : mesActual;
  const serie = primerMes && primerMes <= mesActual ? mesesEntre(inicioSerie, mesActual).map((mes) => ({ mes, importe: netoEn(mes) })) : [];

  const principalCliente = clientes[0];
  const netoPrincipal = principalCliente ? (planEnMes(principalCliente.planes, mesActual)?.netoMensual ?? 0) : 0;

  const negocio = gastosNegocio(boveda, hoy, filtro.linea);
  const cobradoAnio = clientes.reduce((t, c) => t + c.cobradoAnio, 0);
  // Lo pagado por los clientes este año: lo del plan en vigor cada mes, de enero a este
  const porClientes = mesesEntre(`${anioActual}-01`, mesActual).reduce(
    (total, mes) => total + clientes.reduce((t, c) => t + (planEnMes(c.planes, mes)?.gastoMensual ?? 0), 0),
    0,
  );

  // Renovaciones: las de las fichas, las de las líneas del plan con fecha de renovación y las
  // bajas pendientes de los gastos del negocio (lo que se renueva solo no avisa: no hay nada que hacer)
  const vistas = new Set<string>();
  const renovaciones = [
    ...fichas.flatMap(renovacionesDe),
    ...planes.flatMap((p) =>
      p.lineas
        .filter((l) => l.renueva)
        .map((l) => ({ fecha: l.renueva!, concepto: l.concepto, origen: p.cliente, automatica: false })),
    ),
    ...negocio.suscripciones
      .filter((s) => s.baja && s.baja >= hoy)
      .map((s) => ({
        fecha: s.baja!,
        concepto: `Darse de baja de ${s.concepto} (si no, se renueva)`,
        origen: negocio.nota?.nombre ?? 'gastos',
        automatica: false,
      })),
  ]
    .filter((r) => {
      const clave = `${r.origen}|${r.concepto.toLowerCase()}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    clientes,
    negocio,
    balance: {
      cobrado: cobradoAnio,
      porClientes,
      negocio: negocio.pagadoAnio,
      resultado: cobradoAnio - porClientes - negocio.pagadoAnio,
    },
    netoMensual,
    ingresoMensual: vigentes.reduce((t, p) => t + p.netoMensual + p.gastoMensual, 0),
    gastoMensual: vigentes.reduce((t, p) => t + p.gastoMensual, 0),
    cobradoAnio,
    pendiente: clientes.reduce((t, c) => t + c.pendiente, 0),
    atrasados: clientes.flatMap((cliente) => cliente.atrasados.map((cobro) => ({ cliente, cobro }))),
    conPlan: vigentes.length,
    principal:
      netoMensual > 0 && netoPrincipal > 0
        ? { cliente: principalCliente, porcentaje: (netoPrincipal / netoMensual) * 100 }
        : undefined,
    serie,
    variacion: serie.length >= 2 ? serie[serie.length - 1].importe - serie[serie.length - 2].importe : 0,
    renovaciones,
  };
}

/** Plan de un cliente en vigor este mes, para las tarjetas */
export function planVigente(cliente: EconomiaCliente, hoy: string): PlanAnual | undefined {
  return planEnMes(cliente.planes, mesDe(hoy));
}

/** Los meses que cubre un plan, del primero al último */
export function mesesDelPlan(plan: PlanAnual): string[] {
  return mesesEntre(plan.desde, plan.hasta);
}
