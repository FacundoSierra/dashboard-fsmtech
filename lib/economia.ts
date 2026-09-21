import 'server-only';
import { destinoEnlace, lista } from '@/lib/boveda/consultas';
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

export type Periodicidad = 'mes' | 'año';

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
  /** Lo que Facundo paga a proveedores, repartido por meses */
  gastoMensual: number;
  /** Lo que le queda cada mes, con los cobros anuales repartidos */
  netoMensual: number;
  cobros: Cobro[];
}

export interface EconomiaCliente {
  nota: Nota;
  /** El plan en vigor este mes */
  plan?: PlanAnual;
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

export interface Economia {
  clientes: EconomiaCliente[];
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
  return /^(año|ano|anual|year)/.test(textoPlano(valor) ?? '') ? 'año' : 'mes';
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
const alMes = (l: LineaPlan) => (l.cada === 'mes' ? l.importe : l.importe / 12);

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
  const ingreso = lineas.filter(seCobra).reduce((t, l) => t + alMes(l), 0);
  const gastoMensual = lineas.filter(loPagoYo).reduce((t, l) => t + alMes(l), 0);

  return {
    nota,
    cliente,
    anio,
    desde,
    hasta,
    lineas,
    cuotaMensual,
    cobrosAnuales,
    gastoMensual,
    netoMensual: ingreso - gastoMensual,
    cobros: cobrosDe(nota, mesActual),
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

// ── Resumen ──────────────────────────────────────────────────────────────────

const MESES_SERIE = 24;

export function economia(boveda: Boveda, hoy: string): Economia {
  const mesActual = mesDe(hoy);
  const anioActual = Number(hoy.slice(0, 4));

  const planes = boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'cobros')
    .map((nota) => planDe(nota, mesActual))
    .filter((p): p is PlanAnual => p !== null)
    .sort((a, b) => a.anio - b.anio);

  const fichas = boveda.notas.filter((nota) => nota.propiedades.tipo === 'cliente');

  const clientes = fichas
    .map((nota): EconomiaCliente => {
      const suyos = planes.filter((p) => p.cliente === nota.nombre);
      const cobros = suyos.flatMap((p) => p.cobros);
      const debidos = cobros.filter((c) => c.estado === 'atrasado' || c.estado === 'pendiente');
      return {
        nota,
        plan: planEnMes(suyos, mesActual),
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

  // Renovaciones: las de las fichas y las de las líneas del plan con fecha de renovación
  const vistas = new Set<string>();
  const renovaciones = [
    ...fichas.flatMap(renovacionesDe),
    ...planes.flatMap((p) =>
      p.lineas
        .filter((l) => l.renueva)
        .map((l) => ({ fecha: l.renueva!, concepto: l.concepto, origen: p.cliente, automatica: false })),
    ),
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
    netoMensual,
    ingresoMensual: vigentes.reduce((t, p) => t + p.netoMensual + p.gastoMensual, 0),
    gastoMensual: vigentes.reduce((t, p) => t + p.gastoMensual, 0),
    cobradoAnio: clientes.reduce((t, c) => t + c.cobradoAnio, 0),
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
