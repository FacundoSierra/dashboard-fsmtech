const ZONA_HORARIA = 'Europe/Madrid';
const MS_DIA = 86_400_000;

/** Fecha de hoy en España como `YYYY-MM-DD`; el servidor de Vercel está en UTC */
export function hoyMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function aUTC(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_DIA);
}

/** `2026-09-16` → `miércoles, 16 de septiembre` */
export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(aUTC(fecha)));
}

/** Distancia legible respecto a hoy: `hoy`, `mañana`, `en 10 días`, `hace 3 días` */
export function cuandoEs(fecha: string, hoy: string): string {
  const dias = diasEntre(hoy, fecha);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}
