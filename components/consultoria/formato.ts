/**
 * Cómo se escriben en pantalla las cosas de la consultoría: unidades, porcentajes, estados,
 * calendarios y lo que falta para una fecha. El dinero y las fechas sueltas, con `lib/consultoria/formato.ts`.
 *
 * Sin nada del servidor: lo usan los componentes de los dos lados.
 */
import { diasEntre } from '@/lib/consultoria/calendario';
import type { Herramienta } from '@/lib/consultoria/tipos';
import { esApex, type Calendario, type EstadoHerramienta, type ReglaCompania, type TipoComision } from '@/lib/consultoria/reglas';
import { euros } from '@/lib/consultoria/formato';

const DOS_DECIMALES = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const HASTA_DOS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });

/** 1129.6 → «1.129,60», para las columnas donde la unidad ya está en el título */
export function dosDecimales(valor: number) {
  return DOS_DECIMALES.format(valor);
}

/** 1129.6 → «1.129,60 u» */
export function unidades(valor: number) {
  return `${DOS_DECIMALES.format(valor)} u`;
}

/** 10 → «10 %», 12.5 → «12,5 %» */
export function pct(valor: number) {
  return `${HASTA_DOS.format(valor)} %`;
}

/** 2.5 → «2,50 €/u» */
export function euroPorUnidad(valor: number) {
  return `${euros(valor)}/u`;
}

export const NOMBRE_ESTADO: Record<EstadoHerramienta, string> = {
  prevista: 'Prevista',
  firmada: 'Firmada',
  confirmada: 'Confirmada',
  incidencia: 'Con incidencia',
  cobrada: 'Cobrada',
  anulada: 'Anulada',
};

export const NOMBRE_CALENDARIO: Record<Calendario, string> = {
  INTESA: 'INTESA',
  AVANZA: 'AVANZA',
  AXA_PIAS: 'AXA PIAS',
  RANKING: 'Ranking',
};

export const NOMBRE_TIPO_COMISION: Record<TipoComision, string> = {
  anticipada: 'Anticipada',
  anualizada: 'Anualizada',
  unica: 'Única',
  sobre_recibo: 'Sobre recibo',
  sobre_saldo: 'Sobre saldo',
};

export const NOMBRE_REGLA: Record<ReglaCompania, string> = {
  axa_pias: 'Como AXA PIAS: efecto el día 10',
  por_pago: 'Según el pago: domiciliación o transferencia',
  sin_calendario: 'Sin calendario: el efecto, a mano',
};

/** Las que no se cobran de una vez: la firma lleva 0 u para cobrar y las de producción, para el nivel */
export function cobraPocoAPoco(tipo: TipoComision) {
  return tipo === 'sobre_recibo' || tipo === 'sobre_saldo';
}

/** «300,00 €/mes», «5.000,00 € única» o «sin dato» (lo importado del histórico no la trae) */
export function aportacionDe(h: Pick<Herramienta, 'aportacion' | 'periodicidad'>) {
  if (h.aportacion === null) return 'sin dato';
  return h.periodicidad === 'mensual' ? `${euros(h.aportacion)}/mes` : `${euros(h.aportacion)} única`;
}

/** «2026-11-01» → «Noviembre de 2026», para los títulos */
export function mesConMayuscula(mes: string) {
  const [anio, numero] = mes.split('-');
  const nombre = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(anio), Number(numero) - 1, 1)),
  );
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${anio}`;
}

/** «2026-11-01» → «noviembre», cuando el año se da por supuesto */
export function soloElMes(mes: string) {
  const [anio, numero] = mes.split('-');
  return new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(anio), Number(numero) - 1, 1)),
  );
}

/** «faltan 4 años», «faltan 7 meses», «falta 1 día»… o null si ya pasó */
export function cuantoFalta(hoy: string, fecha: string): string | null {
  const dias = diasEntre(hoy, fecha);
  if (dias <= 0) return null;
  const [a1, m1, d1] = hoy.split('-').map(Number);
  const [a2, m2, d2] = fecha.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses >= 12) {
    const anios = Math.floor(meses / 12);
    return anios === 1 ? 'falta 1 año' : `faltan ${anios} años`;
  }
  if (meses >= 1) return meses === 1 ? 'falta 1 mes' : `faltan ${meses} meses`;
  return dias === 1 ? 'falta 1 día' : `faltan ${dias} días`;
}

/** «1 herramienta», «3 herramientas» */
export function cuantas(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Un número para un campo de texto: 81.6 → «81,6». Null o undefined, vacío */
export function aCampo(valor: number | null | undefined) {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

/**
 * Lo que se ha tecleado, como número: «81,6», «1.129,60» o «81.6». Vacío o ilegible, null.
 * Con coma, los puntos son de miles; sin ella, el punto es el decimal.
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '').replace('€', '').replace('%', '');
  if (!limpio) return null;
  const numero = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio);
  return Number.isFinite(numero) ? numero : null;
}

/** ¿Tiene como mucho dos decimales? Lo que guarda la base (`numeric(…, 2)`) */
export function conDosDecimales(valor: number) {
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/** El nombre de una compañía por su código («PLU» → «Plus Ultra»); si no está, el código */
export function nombreDeCompania(codigo: string, companias: { codigo: string; nombre: string }[]) {
  return companias.find((c) => c.codigo === codigo)?.nombre ?? codigo;
}

/** «TopPlan · APEX» si es una aportación extraordinaria enlazada a su herramienta; si no, el producto */
export function productoConApex(h: { producto: string; aportacionDe: string | null }) {
  return esApex(h) ? `${h.producto} · APEX` : h.producto;
}

/** Lo que hace falta de una herramienta para ofrecerla como madre de una APEX en el formulario de la firma */
export type MadrePosible = Pick<
  Herramienta,
  'id' | 'clienteId' | 'compania' | 'producto' | 'pago' | 'aportacion' | 'periodicidad' | 'mesProduccion' | 'estado'
>;

/**
 * Las herramientas de las que puede colgar una APEX (spec 11.3), como `puedeSerSuMadre` de los
 * scripts: ni únicas (una única sin enlace es una APEX de antes o una prima única), ni APEX, ni
 * anuladas. `incluir` es la madre que ya tiene la que se cambia, aunque ya no cumpla: si faltara
 * entre las opciones, guardar la desengancharía sin querer.
 */
export function madresPosibles(herramientas: Herramienta[], incluir: string | null = null): MadrePosible[] {
  return herramientas
    .filter((h) => h.id === incluir || (h.periodicidad !== 'unica' && !esApex(h) && h.estado !== 'anulada'))
    .map(({ id, clienteId, compania, producto, pago, aportacion, periodicidad, mesProduccion, estado }) => ({
      id,
      clienteId,
      compania,
      producto,
      pago,
      aportacion,
      periodicidad,
      mesProduccion,
      estado,
    }));
}

/** El detalle de un mes en Liquidaciones, abierto y a la vista */
export function enlaceAlMes(mes: string) {
  const clave = mes.slice(0, 7);
  return `/consultoria/liquidaciones?anio=${mes.slice(0, 4)}&mes=${clave}#mes-${clave}`;
}
