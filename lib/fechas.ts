const ZONA_HORARIA = 'Europe/Madrid';
const MS_DIA = 86_400_000;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha y hora en España (`YYYY-MM-DD` y `HH:mm`); el servidor de Vercel está en UTC */
export function fechaHoraMadrid(ahora: Date = new Date()): { fecha: string; hora: string } {
  const partes: Record<string, string> = {};
  const formato = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (const { type, value } of formato.formatToParts(ahora)) partes[type] = value;
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export function hoyMadrid(ahora: Date = new Date()): string {
  return fechaHoraMadrid(ahora).fecha;
}

function aUTC(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(aUTC(fecha) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` que existe en el calendario (descarta `2026-02-30`) */
export function esFechaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && RE_FECHA.test(valor) && sumarDias(valor, 0) === valor;
}

/** Lunes de la semana de `fecha` */
export function inicioSemana(fecha: string): string {
  const diaSemana = new Date(aUTC(fecha)).getUTCDay();
  return sumarDias(fecha, -((diaSemana + 6) % 7));
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

/** `2026-09-16` → `16 de septiembre` */
export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(
    new Date(aUTC(fecha)),
  );
}

/** Distancia legible respecto a hoy: `hoy`, `mañana`, `en 10 días`, `hace 3 días` */
export function cuandoEs(fecha: string, hoy: string): string {
  const dias = diasEntre(hoy, fecha);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

/** Tiempo transcurrido desde un instante ISO: `hace 5 min`, `hace 3 h`, `hace 2 días` */
export function haceTiempo(iso: string, ahora: number = Date.now()): string {
  const minutos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** Instante ISO → `21 sep, 14:05` en hora de Madrid */
export function fechaHoraCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA_HORARIA,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace('.', '');
}
