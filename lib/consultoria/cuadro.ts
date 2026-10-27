/**
 * El cuadro de comisiones de OVB (anexo A-4), versión 3TM/2026, como datos (REQ-001, ADR-006 y
 * spec sección 3.6). Solo los productos que vende Facundo; el resto, en el PDF. El resumen de
 * negocio está en `consultoria/cuadro-de-comisiones.md` de la bóveda.
 *
 * - **No importa nada en tiempo de ejecución**: solo `import type` de `./reglas`, que Node y Next
 *   borran. Lo importan la aplicación (`@/lib/consultoria/cuadro`) y los scripts
 *   (`../src/lib/consultoria/cuadro.ts`), y entra en las reglas por el contexto
 *   (`ContextoReglas.cuadro`), así que `reglas.ts` sigue sin importar nada.
 * - **Cuando llegue un cuadro nuevo**: se cambia este archivo con la versión nueva, el `git diff`
 *   dice qué ha cambiado y se ajustan las pruebas. Lo ya guardado no cambia: cada herramienta
 *   guarda sus unidades, su reserva y su €/unidad.
 * - Lo que el cuadro no deja cerrado va en `provisional`, para enseñarlo.
 */
import type { Cuadro, Nivel } from "./reglas";

/**
 * Los siete niveles del plan de carrera. Financial Trainee y Financial Consultant se alcanzan por
 * unidades; desde Gestor de Equipo, a mano (`desdeMes`), porque piden equipo. Son los de serie
 * cuando el consultor no tiene niveles guardados.
 */
export const NIVELES_DE_SERIE: Nivel[] = [
  { nombre: "Financial Trainee", valorUnidad: 2, desdeUnidades: 0, desdeMes: null },
  { nombre: "Financial Consultant", valorUnidad: 2.5, desdeUnidades: 1000, desdeMes: null },
  { nombre: "Gestor de Equipo", valorUnidad: 3.5, desdeUnidades: null, desdeMes: null },
  { nombre: "Coordinador de Zona", valorUnidad: 4.5, desdeUnidades: null, desdeMes: null },
  { nombre: "Director de Agencia", valorUnidad: 5, desdeUnidades: null, desdeMes: null },
  { nombre: "Director Regional", valorUnidad: 5.5, desdeUnidades: null, desdeMes: null },
  { nombre: "Director Nacional", valorUnidad: 6, desdeUnidades: null, desdeMes: null },
];


export const CUADRO_VIGENTE: Cuadro = {
  version: "3TM/2026",
  // Por debajo de 50 € no hay transferencia: el saldo pasa a la siguiente liquidación
  minimoTransferencia: 50,
  // El 10 % de la comisión anticipada; el 100 % en un contrato propio; 30 % con más de 600 u y 40 % con más de 1.000
  reserva: {
    pct: 10,
    propio: 100,
    tramos: [
      { masDeUnidades: 1000, pct: 40 },
      { masDeUnidades: 600, pct: 30 },
    ],
  },
  niveles: NIVELES_DE_SERIE,
  productos: [
    // AXA PIAS Proyecto Futuro: PFDina es el mismo PIAS con otra cartera (Facundo, 2026-10-25)
    {
      compania: "AXA",
      nombres: ["PIAS Global+", "PFDina", "PIAS Proyecto Futuro"],
      periodicidad: "mensual",
      tipo: "anticipada",
      reserva: true,
      // Por cada 100 € de prima neta anual, según la duración: 100 €/mes a 26 años o más = 81,6 u
      unidades: {
        base: "prima_anual",
        porCada: 100,
        porDuracion: [
          { hasta: 15, factor: 3.6 },
          { desde: 16, hasta: 20, factor: 4.8 },
          { desde: 21, hasta: 25, factor: 5.8 },
          { desde: 26, factor: 6.8 },
        ],
      },
      // Emitida el 15 o antes, se cobra ese mes; después, el siguiente
      cobro: { dia15: true },
      // Del mes 6 al 45, del 90 % bajando dos puntos al mes (el 8 va al 86 %: 175,44 € de 204 €)
      extorno: {
        meses: 48,
        tramos: [
          { desde: 1, hasta: 4, pct: 100 },
          { desde: 5, hasta: 5, pct: 95 },
          { desde: 6, hasta: 45, pct: 90, bajaPorMes: 2 },
          { desde: 46, hasta: 48, pct: 10 },
        ],
      },
    },
    // Aportación extraordinaria o traspaso a un PIAS: 3 u por cada 1.000 €, el mes siguiente al de la aportación
    {
      compania: "AXA",
      nombres: ["PIAS Global+", "PFDina", "PIAS Proyecto Futuro"],
      periodicidad: "unica",
      tipo: "unica",
      reserva: false,
      unidades: { base: "importe", porCada: 1000, factor: 3 },
      cobro: { meses: 1 },
      efecto: "fecha",
      extorno: null,
    },
    // INTESA (ISL): 2,5 u por cada 1.000 € de primas programadas; el TOP 10 es a 10 años
    {
      compania: "INTESA",
      nombres: ["Top10", "TOP 10"],
      periodicidad: "mensual",
      tipo: "anticipada",
      reserva: true,
      unidades: { base: "primas_programadas", porCada: 1000, factor: 2.5, aniosFijos: 10 },
      extorno: { meses: 48, lineal: true },
    },
    // TOP PLAN y TOP PIAS, hasta 30 años: 300 €/mes a 25 años son 90.000 € → 225 u
    {
      compania: "INTESA",
      nombres: ["TopPlan", "TOP PLAN", "TOP PLAN DB", "TopPIAS", "TOP PIAS", "TOP PIAS DB"],
      periodicidad: "mensual",
      tipo: "anticipada",
      reserva: true,
      unidades: { base: "primas_programadas", porCada: 1000, factor: 2.5, aniosMaximos: 30 },
      extorno: { meses: 60, lineal: true },
    },
    // Aportación extraordinaria o traspaso en INTESA: 3 u por cada 1.000 €, sin extorno
    {
      compania: "INTESA",
      nombres: ["Top10", "TOP 10", "TopPlan", "TOP PLAN", "TOP PLAN DB", "TopPIAS", "TOP PIAS", "TOP PIAS DB"],
      periodicidad: "unica",
      tipo: "unica",
      reserva: false,
      unidades: { base: "importe", porCada: 1000, factor: 3 },
      extorno: { meses: 0 },
    },
    // TOP PREMIUM, prima única: el mismo mes del efecto si se entrega antes del 15
    {
      compania: "INTESA",
      nombres: ["TopPremium", "TOP PREMIUM"],
      periodicidad: "unica",
      tipo: "unica",
      reserva: false,
      unidades: null,
      cobro: { dia15: true },
      extorno: null,
    },
    // Allianz Vida Riesgo Nivelado: 19 u por cada 100 € de prima anual; el primer año, anualizado
    {
      compania: "ALL",
      nombres: ["Vida Riesgo Nivelado"],
      periodicidad: "mensual",
      tipo: "anualizada",
      reserva: true,
      unidades: { base: "prima_anual", porCada: 100, factor: 19 },
      cobro: { meses: 1 },
      extorno: {
        meses: 36,
        tramos: [
          { desde: 1, hasta: 12, pct: 100 },
          { desde: 13, hasta: 24, pct: 75 },
          { desde: 25, hasta: 36, pct: 50 },
        ],
      },
      provisional:
        "no se sabe cuántas de sus unidades se cobran el primer año; se proponen todas hasta que lo diga una liquidación",
    },
    // Plus Ultra no viene en el cuadro: lo de aquí es lo observado en 2026
    {
      compania: "PLU",
      nombres: ["RC Integral"],
      periodicidad: "mensual",
      tipo: "sobre_recibo",
      reserva: false,
      unidades: null,
      cobro: { meses: 1 },
      extorno: null,
      provisional: "Plus Ultra no viene en el cuadro",
    },
    // Avanza Previsión: las unidades equivalen a cinco años, pero se cobra un % del saldo cada trimestre
    {
      compania: "AVANZA",
      nombres: ["Ahorro Flexible", "PIAS", "PPA"],
      periodicidad: "mensual",
      tipo: "sobre_saldo",
      reserva: false,
      unidades: { base: "prima_anual", porCada: 100, factor: 0.15 },
      extorno: null,
      provisional: "comisión sobre saldo, sin confirmar",
    },
    {
      compania: "AVANZA",
      nombres: ["Ahorro Flexible", "PIAS", "PPA"],
      periodicidad: "unica",
      tipo: "sobre_saldo",
      reserva: false,
      unidades: { base: "importe", porCada: 1000, factor: 0.3 },
      extorno: null,
      provisional: "comisión sobre saldo, sin confirmar",
    },
  ],
};
