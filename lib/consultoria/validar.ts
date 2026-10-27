/**
 * Leer lo que llega del navegador a las acciones de la consultoría (y a los filtros de sus
 * consultas). **Nada de lo que llega es de fiar**, aunque el formulario ya lo haya validado: cada
 * función devuelve el valor limpio o lanza `DatoNoValido` con el mensaje para el usuario, que la
 * acción devuelve tal cual. Los límites son los de las columnas de la migración 0001.
 *
 * Solo importa las reglas (las fechas sobre `AAAA-MM-DD`): también vale en el navegador.
 */
import { primerDiaDelMes, ultimoDiaDelMes } from "./reglas";

/** Un dato que no vale: su mensaje es para el usuario, en español y sin detalles internos */
export class DatoNoValido extends Error {}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new DatoNoValido(mensaje);
}

/** Los máximos de `numeric(12,2)`, `numeric(10,2)` y `numeric(6,2)` */
export const MAXIMO = { euros: 9_999_999_999.99, unidades: 99_999_999.99, valorUnidad: 9_999.99 } as const;

const DOS_DECIMALES = "Pon los importes, las unidades y los porcentajes con dos decimales como mucho.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿No viene? `undefined`, `null` o un texto vacío */
export function vacio(valor: unknown): boolean {
  return valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "");
}

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

export function uuid(valor: unknown, mensaje: string): string {
  exigir(esUuid(valor), mensaje);
  return valor;
}

/** Una fecha `AAAA-MM-DD` que existe, o null */
export function fechaONula(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  try {
    primerDiaDelMes(valor);
    return valor;
  } catch {
    return null;
  }
}

export function fecha(valor: unknown, mensaje: string): string {
  const leida = fechaONula(valor);
  exigir(leida, mensaje);
  return leida;
}

/** El día 1 del mes de `AAAA-MM` o de una fecha `AAAA-MM-DD`, o null */
export function mesONulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const leida = fechaONula(/^\d{4}-\d{2}$/.test(valor) ? `${valor}-01` : valor);
  return leida ? primerDiaDelMes(leida) : null;
}

export function mes(valor: unknown, mensaje: string): string {
  const leido = mesONulo(valor);
  exigir(leido, mensaje);
  return leido;
}

/** El último día del mes de `AAAA-MM` o de una fecha: el cobro estimado */
export function finDeMes(valor: unknown, mensaje: string): string {
  return ultimoDiaDelMes(mes(valor, mensaje));
}

/**
 * Un número (no un texto) con dos decimales como mucho, entre `minimo` y `maximo`, o mayor que
 * `mayorQue`. Se devuelve redondeado a sus centésimas, sin −0
 */
export function cantidad(
  valor: unknown,
  mensaje: string,
  limites: { minimo?: number; mayorQue?: number; maximo: number },
): number {
  exigir(typeof valor === "number" && Number.isFinite(valor), mensaje);
  const centesimas = Math.round(valor * 100);
  exigir(Math.abs(valor * 100 - centesimas) < 1e-6, DOS_DECIMALES);
  const limpio = centesimas === 0 ? 0 : centesimas / 100;
  exigir(limites.minimo === undefined || limpio >= limites.minimo, mensaje);
  exigir(limites.mayorQue === undefined || limpio > limites.mayorQue, mensaje);
  exigir(limpio <= limites.maximo, mensaje);
  return limpio;
}

/** Como `cantidad`, pero si no viene, null. **0 sí viene**: un porcentaje 0 es un valor */
export function cantidadONula(
  valor: unknown,
  mensaje: string,
  limites: { minimo?: number; mayorQue?: number; maximo: number },
): number | null {
  return vacio(valor) ? null : cantidad(valor, mensaje, limites);
}

/** Un porcentaje del 0 al 100, o null si no viene */
export function porcentajeONulo(valor: unknown, mensaje: string): number | null {
  return cantidadONula(valor, mensaje, { minimo: 0, maximo: 100 });
}

export function entero(valor: unknown, mensaje: string, minimo: number, maximo: number): number {
  exigir(typeof valor === "number" && Number.isInteger(valor) && valor >= minimo && valor <= maximo, mensaje);
  return valor;
}

export function enteroONulo(valor: unknown, mensaje: string, minimo: number, maximo: number): number | null {
  return vacio(valor) ? null : entero(valor, mensaje, minimo, maximo);
}

/** Un texto recortado; vacío, null. Los caracteres se cuentan como `char_length` de Postgres */
export function textoONulo(valor: unknown, maximo: number, mensajeLargo: string): string | null {
  if (vacio(valor)) return null;
  exigir(typeof valor === "string", mensajeLargo);
  const limpio = valor.trim();
  exigir([...limpio].length <= maximo, mensajeLargo);
  return limpio;
}

/** Uno de los valores de la lista */
export function unoDe<T extends string>(valor: unknown, lista: readonly T[], mensaje: string): T {
  exigir(typeof valor === "string" && (lista as readonly string[]).includes(valor), mensaje);
  return valor as T;
}

/** El código de una compañía, como sale en la liquidación: `AXA`, `INTESA`, `ALL` */
export function codigoDeCompania(valor: unknown, mensaje: string): string {
  const codigo = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  exigir(/^[A-Z0-9_]{2,10}$/.test(codigo), mensaje);
  return codigo;
}

/** Una lista de identificadores, sin repetir */
export function uuids(valor: unknown, mensaje: string, maximo = 1000): string[] {
  exigir(Array.isArray(valor) && valor.length <= maximo && valor.every(esUuid), mensaje);
  return [...new Set(valor as string[])];
}
