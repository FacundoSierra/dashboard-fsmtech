/**
 * Las cuentas de fechas que usa la consultoría, copiadas tal cual de `src/lib/calendario.ts` de
 * FSM-Finance (REQ-001, spec 7.1): así las fechas salen igual que allí. Solo las que se usan
 * (`diasEntre`, `sumarMeses`, `nombreDelMes`, `nombreDelDia`) y las dos de las que dependen.
 *
 * Cuentas de fechas sobre cadenas `AAAA-MM-DD`, en UTC.
 *
 * Nada de `new Date()` con horas locales: un movimiento del día 1 a las 00:30 en horario de
 * verano se iría al día anterior y saldría en la casilla equivocada.
 */
export function aFecha(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function aIso(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

/** Días de una fecha a otra: positivo si `hasta` es posterior */
export function diasEntre(desde: string, hasta: string) {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

export function sumarMeses(iso: string, meses: number) {
  const fecha = aFecha(iso);
  fecha.setUTCDate(1);
  fecha.setUTCMonth(fecha.getUTCMonth() + meses);
  return aIso(fecha);
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «2026-09-27» → «septiembre de 2026» */
export function nombreDelMes(iso: string) {
  const [anio, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1]} de ${anio}`;
}

/** «2026-09-27» → «sábado, 27 de septiembre» */
export function nombreDelDia(iso: string) {
  const fecha = aFecha(iso);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return `${dias[fecha.getUTCDay()]}, ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}`;
}
