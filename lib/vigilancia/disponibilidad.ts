import type { Incidencia } from './github';

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;

export type EstadoDia = 'bien' | 'incidencia' | 'sin-datos';

export interface Dia {
  /** `YYYY-MM-DD` en UTC */
  fecha: string;
  estado: EstadoDia;
  /** Minutos caídos ese día, aproximados a la frecuencia de la vigilancia */
  minutosCaida: number;
}

/** Tramo de una incidencia recortado a una ventana; las abiertas llegan hasta ahora */
function solape(incidencia: Incidencia, inicio: number, fin: number, ahora: number): number {
  const desde = new Date(incidencia.desde).getTime();
  const hasta = incidencia.hasta ? new Date(incidencia.hasta).getTime() : ahora;
  return Math.max(0, Math.min(hasta, fin) - Math.max(desde, inicio));
}

/**
 * Los últimos `dias` días de un proyecto, del más antiguo al de hoy. Los días anteriores
 * a que empezara la vigilancia salen «sin datos»: no se sabe si estaban bien.
 */
export function franjaDias(
  proyecto: string,
  incidencias: Incidencia[],
  vigilanciaDesde: string | null,
  dias = 30,
  ahora = Date.now(),
): Dia[] {
  const propias = incidencias.filter((i) => i.proyecto === proyecto);
  const inicioVigilancia = vigilanciaDesde ? new Date(vigilanciaDesde).getTime() : Infinity;
  const hoy = Math.floor(ahora / MS_DIA) * MS_DIA;

  return Array.from({ length: dias }, (_, i) => {
    const inicio = hoy - (dias - 1 - i) * MS_DIA;
    const fin = inicio + MS_DIA;
    const fecha = new Date(inicio).toISOString().slice(0, 10);
    if (fin <= inicioVigilancia) return { fecha, estado: 'sin-datos', minutosCaida: 0 };

    const caido = propias.reduce((total, incidencia) => total + solape(incidencia, inicio, fin, ahora), 0);
    return { fecha, estado: caido > 0 ? 'incidencia' : 'bien', minutosCaida: Math.round(caido / 60_000) };
  });
}

/**
 * Porcentaje del tiempo vigilado en que la web respondió, dentro de `[inicio, fin)`.
 * `null` si en esa ventana no se vigilaba.
 */
export function disponibilidad(
  proyecto: string,
  incidencias: Incidencia[],
  vigilanciaDesde: string | null,
  inicio: number,
  fin: number,
  ahora = Date.now(),
): { porcentaje: number; minutosCaida: number; desde: number } | null {
  if (!vigilanciaDesde) return null;
  const desde = Math.max(inicio, new Date(vigilanciaDesde).getTime());
  const hasta = Math.min(fin, ahora);
  if (hasta <= desde) return null;

  const caido = incidencias
    .filter((i) => i.proyecto === proyecto)
    .reduce((total, incidencia) => total + solape(incidencia, desde, hasta, ahora), 0);
  return { porcentaje: 100 * (1 - caido / (hasta - desde)), minutosCaida: Math.round(caido / 60_000), desde };
}

/** `95` → `1 h 35 min` */
export function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
