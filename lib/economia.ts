import 'server-only';
import { contenidoSeccion, vinetasDe } from '@/lib/boveda/parser';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { esFechaValida } from '@/lib/fechas';

/**
 * Economía del negocio, a partir de las fichas de cliente.
 *
 * Las cuotas son **netas**: lo que cobra Facundo después de lo que el cliente paga por
 * su cuenta (dominio, alojamiento). Se escriben en las propiedades de la ficha:
 *
 *   cuota_mensual: 60          # euros netos al mes
 *   cuota_desde: 2026-03-01    # desde cuándo
 *   cuota_hasta: 2026-12-31    # opcional, si deja de cobrarse
 *
 * Si la cuota ha cambiado, en vez de las tres anteriores:
 *
 *   cuotas:
 *     - importe: 40
 *       desde: 2025-11-01
 *     - importe: 60
 *       desde: 2026-04-01
 *
 * Y las renovaciones que no se pueden averiguar solas (dominios `.es`, planes anuales),
 * en una sección «Renovaciones» de la ficha:
 *
 *   ## Renovaciones
 *   - 2027-03-14 — Dominio vm-propiedades.es
 */

export interface Cuota {
  importe: number;
  desde: string;
  hasta?: string;
}

export interface EconomiaCliente {
  nota: Nota;
  cuotas: Cuota[];
  /** Cuota vigente hoy; 0 si no hay */
  actual: number;
  /** Primera fecha en que empezó a pagar */
  desde?: string;
  /** Suma de las cuotas desde el principio hasta este mes, incluido */
  acumulado: number;
}

export interface PuntoMensual {
  /** `YYYY-MM` */
  mes: string;
  importe: number;
}

export interface Renovacion {
  fecha: string;
  concepto: string;
  /** Nombre de la nota de la que sale */
  origen: string;
  automatica: boolean;
}

export interface Economia {
  clientes: EconomiaCliente[];
  /** Ingresos recurrentes de este mes */
  mensual: number;
  /** Lo que suman las cuotas vigentes en un año */
  anual: number;
  /** Lo facturado este año natural según las cuotas */
  esteAnio: number;
  pagan: number;
  /** El cliente que más pesa y cuánto: depender de uno solo es un riesgo */
  principal?: { cliente: EconomiaCliente; porcentaje: number };
  /** Evolución de los ingresos mensuales, del primer cobro a hoy (máximo 24 meses) */
  serie: PuntoMensual[];
  /** Variación de este mes respecto al anterior */
  variacion: number;
  renovaciones: Renovacion[];
}

function numero(valor: unknown): number | undefined {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor.replace(',', '.')))) {
    return Number(valor.replace(',', '.'));
  }
  return undefined;
}

function cuotasDe(nota: Nota): Cuota[] {
  const p = nota.propiedades;

  if (Array.isArray(p.cuotas)) {
    return p.cuotas
      .flatMap((valor): Cuota[] => {
        if (!valor || typeof valor !== 'object') return [];
        const c = valor as Record<string, unknown>;
        const importe = numero(c.importe);
        if (importe === undefined || !esFechaValida(c.desde)) return [];
        return [{ importe, desde: c.desde, hasta: esFechaValida(c.hasta) ? c.hasta : undefined }];
      })
      .sort((a, b) => a.desde.localeCompare(b.desde));
  }

  const importe = numero(p.cuota_mensual);
  if (importe === undefined || !esFechaValida(p.cuota_desde)) return [];
  return [{ importe, desde: p.cuota_desde, hasta: esFechaValida(p.cuota_hasta) ? p.cuota_hasta : undefined }];
}

// ── Meses ────────────────────────────────────────────────────────────────────

const mesDe = (fecha: string) => fecha.slice(0, 7);

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

/** Una cuota cuenta en un mes si empezó antes de que acabara y no terminó antes de que empezara */
function cuentaEnMes(cuota: Cuota, mes: string): boolean {
  return mesDe(cuota.desde) <= mes && (!cuota.hasta || mesDe(cuota.hasta) >= mes);
}

function importeEnMes(cuotas: Cuota[], mes: string): number {
  // Si dos tramos se solapan en un mes de cambio, cuenta el más reciente
  const vigentes = cuotas.filter((c) => cuentaEnMes(c, mes));
  return vigentes.length ? vigentes[vigentes.length - 1].importe : 0;
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
  const fichas = boveda.notas.filter((nota) => nota.propiedades.tipo === 'cliente');

  const clientes = fichas
    .map((nota): EconomiaCliente => {
      const cuotas = cuotasDe(nota);
      const desde = cuotas[0]?.desde;
      const acumulado = desde
        ? mesesEntre(mesDe(desde), mesActual).reduce((total, mes) => total + importeEnMes(cuotas, mes), 0)
        : 0;
      return { nota, cuotas, actual: importeEnMes(cuotas, mesActual), desde, acumulado };
    })
    .sort((a, b) => b.actual - a.actual || a.nota.titulo.localeCompare(b.nota.titulo, 'es'));

  const conCuotas = clientes.filter((c) => c.cuotas.length > 0);
  const mensual = clientes.reduce((total, c) => total + c.actual, 0);

  const primerMes = conCuotas.map((c) => mesDe(c.desde!)).sort()[0];
  const inicioSerie = primerMes ? [primerMes, sumarMeses(mesActual, -(MESES_SERIE - 1))].sort().at(-1)! : mesActual;
  const serie = primerMes
    ? mesesEntre(inicioSerie, mesActual).map((mes) => ({
        mes,
        importe: conCuotas.reduce((total, c) => total + importeEnMes(c.cuotas, mes), 0),
      }))
    : [];

  const anterior = serie.length >= 2 ? serie[serie.length - 2].importe : 0;
  const esteAnio = mesesEntre(`${hoy.slice(0, 4)}-01`, mesActual).reduce(
    (total, mes) => total + conCuotas.reduce((suma, c) => suma + importeEnMes(c.cuotas, mes), 0),
    0,
  );

  const pagan = clientes.filter((c) => c.actual > 0);
  const primero = pagan[0];

  return {
    clientes,
    mensual,
    anual: mensual * 12,
    esteAnio,
    pagan: pagan.length,
    principal: primero && mensual > 0 ? { cliente: primero, porcentaje: (primero.actual / mensual) * 100 } : undefined,
    serie,
    variacion: serie.length >= 2 ? mensual - anterior : 0,
    renovaciones: fichas.flatMap(renovacionesDe).sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

/** `2026-09` → `sep 2026` */
export function nombreMes(mes: string, largo = false): string {
  const [anio, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { month: largo ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(anio, m - 1, 1)))
    .replace('.', '');
}

export { mesDe, sumarMeses };
