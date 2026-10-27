// Pruebas de la aportación extraordinaria (APEX) enlazada a su herramienta (REQ-001, spec 11): el
// recuento de herramientas y APEX de un mes (`reglas.ts`), que usan las pantallas, y la línea de la
// casilla de los cobros de OVB que escriben los scripts (`scripts/consultoria-comun.mjs`). Con
// `npm test`. Los datos son inventados; los importes de noviembre y diciembre de 2026 son los de las
// notas del 2026-10-25 (spec 6), sin nombres.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { calcularImportes, esApex, recuentoDelMes, textoDeHerramientas, textoDelRecuento } from "./reglas.ts";
import { herramientasDeLaCasilla, liquidacionesPorMes, puedeSerSuMadre } from "../../scripts/consultoria-comun.mjs";

/** Una línea de liquidación como las de `leerLineasGuardadas`, con sus importes de verdad (IRPF al 15 %) */
function linea(mes, unidades, valorUnidad, pctHucha, { prevista = false, aportacionDe = null } = {}) {
  const { bruto, hucha } = calcularImportes(unidades, valorUnidad, pctHucha, 15);
  return { mes, prevista, cobrada: false, unidades, bruto, hucha, pctIrpf: 15, aportacionDe };
}

const MADRE = "00000000-0000-4000-8000-000000000001";

/** Noviembre de 2026 en las notas: tres PIAS confirmados, un TopPlan previsto y su APEX de 5.000 € prevista */
function noviembre({ enganchada }) {
  return [
    linea("2026-11-01", 40.8, 2, 10),
    linea("2026-11-01", 204, 2, 10),
    linea("2026-11-01", 57.6, 2, 10),
    linea("2026-11-01", 225, 2.5, 10, { prevista: true }),
    linea("2026-11-01", 15, 2.5, 0, { prevista: true, aportacionDe: enganchada ? MADRE : null }),
  ];
}

const sinCuenta = (lineas) => liquidacionesPorMes({ lineas }).meses;

/** La de antes del cambio, tal cual, para comprobar que sin APEX la casilla sale exactamente igual */
function casillaDeAntes(lineas) {
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const n = lineas.length;
  const previstas = lineas.filter((l) => l.prevista).length;
  if (n === 0) return "sin herramientas";
  if (previstas === 0) return plural(n, "herramienta", "herramientas");
  if (previstas === n) return n === 1 ? "1 herramienta prevista" : `${n} herramientas previstas`;
  return `${plural(n, "herramienta", "herramientas")} (${plural(previstas, "prevista", "previstas")})`;
}

describe("el recuento de un mes: herramientas y APEX", () => {
  test("una APEX es la que tiene aportacionDe; una única sin enlace no lo es", () => {
    assert.equal(esApex({ aportacionDe: MADRE }), true);
    assert.equal(esApex({ aportacionDe: null }), false);
    assert.equal(esApex({}), false);
  });

  test("sin APEX enganchadas, todas son herramientas (como antes): 5 y 2 previstas", () => {
    assert.deepEqual(recuentoDelMes(noviembre({ enganchada: false })), { herramientas: 5, apex: 0, previstas: 2 });
  });

  test("con la APEX enganchada: 4 herramientas y 1 APEX, y las previstas siguen siendo 2 (cuentan también la APEX)", () => {
    assert.deepEqual(recuentoDelMes(noviembre({ enganchada: true })), { herramientas: 4, apex: 1, previstas: 2 });
  });

  test("un mes vacío", () => {
    assert.deepEqual(recuentoDelMes([]), { herramientas: 0, apex: 0, previstas: 0 });
  });

  test("el texto de las pantallas: «4 herramientas y 1 APEX · 2 previstas»", () => {
    assert.equal(textoDelRecuento({ herramientas: 4, apex: 1, previstas: 2 }), "4 herramientas y 1 APEX · 2 previstas");
  });

  test("sin APEX, sin «y 0 APEX»; sin previstas, sin la segunda parte", () => {
    assert.equal(textoDelRecuento({ herramientas: 4, apex: 0, previstas: 2 }), "4 herramientas · 2 previstas");
    assert.equal(textoDelRecuento({ herramientas: 4, apex: 1, previstas: 0 }), "4 herramientas y 1 APEX");
    assert.equal(textoDelRecuento({ herramientas: 5, apex: 0, previstas: 0 }), "5 herramientas");
  });

  test("singular y plural: «1 herramienta», «1 prevista»; APEX no cambia en plural", () => {
    assert.equal(textoDelRecuento({ herramientas: 1, apex: 1, previstas: 1 }), "1 herramienta y 1 APEX · 1 prevista");
    assert.equal(textoDelRecuento({ herramientas: 1, apex: 0, previstas: 0 }), "1 herramienta");
    assert.equal(textoDelRecuento({ herramientas: 2, apex: 3, previstas: 5 }), "2 herramientas y 3 APEX · 5 previstas");
    assert.equal(textoDeHerramientas({ herramientas: 0, apex: 2 }), "2 APEX");
  });

  test("sin nada: «sin herramientas»", () => {
    assert.equal(textoDelRecuento({ herramientas: 0, apex: 0, previstas: 0 }), "sin herramientas");
  });
});

describe("la línea de la casilla de OVB", () => {
  test("noviembre de 2026 de las notas de producción, sin enganchar: 924,86 € (542,40 u), como antes de la APEX", () => {
    const [mes] = sinCuenta(noviembre({ enganchada: false }));
    assert.equal(mes.texto, "2026-11 — Liquidación OVB · 5 herramientas (2 previstas) · 542,40 u — 924,86 €");
    assert.deepEqual(mes.liquidacion, { comision: 1204.8, rc: 116.73, comisionNeta: 1088.07, irpf: 163.21, cargos: 0, importe: 924.86 });
  });

  test("noviembre de 2026 con la APEX enganchada: cambia el recuento y nada más (mismas unidades e importe)", () => {
    const [antes] = sinCuenta(noviembre({ enganchada: false }));
    const [despues] = sinCuenta(noviembre({ enganchada: true }));
    assert.equal(despues.texto, "2026-11 — Liquidación OVB · 4 herramientas y 1 APEX (2 previstas) · 542,40 u — 924,86 €");
    assert.deepEqual(despues.liquidacion, antes.liquidacion);
    assert.deepEqual(despues.paso, antes.paso);
  });

  test("diciembre de 2026, sin APEX: como hoy, 399,33 €", () => {
    const [mes] = sinCuenta([linea("2026-12-01", 208.8, 2.5, 10, { prevista: true })]);
    assert.equal(mes.texto, "2026-12 — Liquidación OVB · 1 herramienta prevista · 208,80 u — 399,33 €");
  });

  test("sin APEX, cada caso sale igual que con la de antes", () => {
    const casos = [
      [],
      [linea("2026-11-01", 81.6, 2, 10)],
      [linea("2026-11-01", 81.6, 2, 10, { prevista: true })],
      [linea("2026-11-01", 81.6, 2, 10, { prevista: true }), linea("2026-11-01", 40.8, 2, 10, { prevista: true })],
      [linea("2026-11-01", 81.6, 2, 10), linea("2026-11-01", 40.8, 2, 10)],
      [linea("2026-11-01", 81.6, 2, 10), linea("2026-11-01", 40.8, 2, 10, { prevista: true })],
      [linea("2026-11-01", 81.6, 2, 10), linea("2026-11-01", 40.8, 2, 10), linea("2026-11-01", 15, 2.5, 0, { prevista: true })],
    ];
    for (const lineas of casos) assert.equal(herramientasDeLaCasilla(lineas), casillaDeAntes(lineas));
  });

  test("con APEX: las previstas siempre entre paréntesis, también si lo están todas; sin previstas, sin paréntesis", () => {
    const madre = linea("2026-11-01", 225, 2.5, 10, { prevista: true });
    const apex = linea("2026-11-01", 15, 2.5, 0, { prevista: true, aportacionDe: MADRE });
    assert.equal(herramientasDeLaCasilla([madre, apex]), "1 herramienta y 1 APEX (2 previstas)");
    assert.equal(
      herramientasDeLaCasilla([linea("2026-11-01", 225, 2.5, 10), linea("2026-11-01", 15, 2.5, 0, { aportacionDe: MADRE })]),
      "1 herramienta y 1 APEX",
    );
    assert.equal(herramientasDeLaCasilla([apex]), "1 APEX (1 prevista)");
  });
});

describe("de qué herramienta puede colgar una APEX", () => {
  const apex = { compania: "INTESA", producto: "TopPlan" };
  const topPlan = { compania: "INTESA", producto: "TopPlan", periodicidad: "mensual", estado: "prevista", aportacionDe: null };

  test("la del mismo producto y compañía, no única, sin anular y que no sea ya una APEX", () => {
    assert.equal(puedeSerSuMadre(topPlan, apex), true);
    assert.equal(puedeSerSuMadre({ ...topPlan, producto: " topplan " }, apex), true);
    assert.equal(puedeSerSuMadre(topPlan, { ...apex, producto: "TopPlan · aportación extraordinaria" }), true);
  });

  test("una única (una APEX de antes, sin enlace), una anulada, una APEX u otro producto o compañía, no", () => {
    assert.equal(puedeSerSuMadre({ ...topPlan, periodicidad: "unica" }, apex), false);
    assert.equal(puedeSerSuMadre({ ...topPlan, estado: "anulada" }, apex), false);
    assert.equal(puedeSerSuMadre({ ...topPlan, aportacionDe: MADRE }, apex), false);
    assert.equal(puedeSerSuMadre({ ...topPlan, producto: "Top10" }, apex), false);
    assert.equal(puedeSerSuMadre({ ...topPlan, compania: "AXA" }, apex), false);
  });
});
