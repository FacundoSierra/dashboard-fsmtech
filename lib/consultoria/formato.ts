/**
 * Dinero, fechas y textos de la consultoría, siempre en español de España: copiados tal cual de
 * `src/lib/formato.ts` y `src/lib/huella.ts` de FSM-Finance (REQ-001, spec 7.1), para que los
 * importes y las fechas se escriban igual que allí. Solo los que se usan: `euros`, `eurosConSigno`,
 * `fechaCorta`, `diaYMes`, `mesCorto` y `normalizar` (el buscador de la lista de clientes).
 */

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  // Sin esto, el español deja "2874,61 €" en las cifras de cuatro dígitos
  useGrouping: "always",
});

/** 1234.5 → "1.234,50 €". Los negativos llevan el signo menos delante. */
export function euros(importe: number) {
  return EUROS.format(importe);
}

/** El importe con su signo explícito: "+2.279,92 €" o "−91,91 €". */
export function eurosConSigno(importe: number) {
  const signo = importe > 0 ? "+" : "−";
  return `${signo}${EUROS.format(Math.abs(importe))}`;
}

/** "2024-05-23" → "23/05/2024" */
export function fechaCorta(fecha: string) {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2024-05-23" → "23 may", para listas de un solo mes donde el año sobra */
export function diaYMes(fecha: string) {
  const [, mes, dia] = fecha.split("-");
  return `${Number(dia)} ${MESES_CORTOS[Number(mes) - 1]}`;
}

/** "2024-05-01" → "may '24" */
export function mesCorto(fecha: string) {
  const [anio, mes] = fecha.split("-");
  return `${MESES_CORTOS[Number(mes) - 1]} '${anio.slice(2)}`;
}

/** Sin acentos, sin mayúsculas, sin espacios de más y sin signos: para comparar conceptos. */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
