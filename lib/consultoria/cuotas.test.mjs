// Pruebas de las comisiones recurrentes (REQ-002, spec 5.1 de docs/specs/req-002-comisiones-recurrentes.md):
// la regla de cobro de las cuotas (`reglas.ts`), lo que se programa, lo que se corta al anular, los
// importes y el recuento, también en la casilla de OVB (`scripts/consultoria-comun.mjs`). Con
// `npm test`. Las series son inventadas; las cifras de la n.º 6 son los totales del documento de OVB,
// sin nombres.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AJUSTES_DE_SERIE,
  COMPANIAS_DE_SERIE,
  CUOTAS_CADA_MESES,
  MESES_DE_CUOTAS_POR_DELANTE,
  calcularImportes,
  calcularLiquidacion,
  cobroDeLaCuota,
  cuotasDeLaSerie,
  cuotasQueFaltan,
  cuotasQueSeCortan,
  esCuota,
  nombreDelPeriodo,
  numeroDeLaCuota,
  periodoCorto,
  periodoNatural,
  proponerFirma,
  recuentoDelMes,
  textoDeHerramientas,
  textoDelRecuento,
  unidadesAcumuladas,
  ventanaDeProgramacion,
} from "./reglas.ts";
import { CUADRO_VIGENTE, NIVELES_DE_SERIE } from "./cuadro.ts";
import { herramientasDeLaCasilla, liquidacionesPorMes } from "../../scripts/consultoria-comun.mjs";

const SERIE = "00000000-0000-4000-8000-000000000002";
const codigos = (avisos) => avisos.map((a) => a.codigo).sort();

/** Un contexto con todo de serie: el cuadro vigente, las compañías de serie y sin cierres */
function contexto({ herramientas = [], unidadesPrevias = 0 } = {}) {
  return {
    cuadro: CUADRO_VIGENTE,
    companias: COMPANIAS_DE_SERIE,
    cierres: [],
    niveles: NIVELES_DE_SERIE,
    ajustes: { ...AJUSTES_DE_SERIE, unidadesPrevias },
    herramientas,
  };
}

/** Una firma del RC Integral de Plus Ultra (sin calendario: el efecto, a mano), con 37 u para el nivel */
const firmaDelRc = (fechaEfecto, extra = {}) => ({
  compania: "PLU",
  producto: "RC Integral",
  pago: "domiciliacion",
  fecha: "2026-03-20",
  fechaEfecto,
  unidadesNivel: 37,
  ...extra,
});

/** La serie del RC: efecto el 2026-06-01, trimestral, y la firma cobra ella misma la primera (la de abril-junio) */
const RC = { fechaEfecto: "2026-06-01", cuotasCadaMeses: 3, laFirmaCobraLaPrimera: true };

describe("la regla: cada periodo natural se cobra el mes siguiente a su último mes", () => {
  test("los valores de serie: trimestral o semestral, seis meses por delante", () => {
    assert.deepEqual([...CUOTAS_CADA_MESES], [3, 6]);
    assert.equal(MESES_DE_CUOTAS_POR_DELANTE, 6);
  });

  test("abril-junio (los días 1, 15 y 30, el último del mes): se cobra en julio", () => {
    for (const dia of ["2026-04-01", "2026-05-15", "2026-06-30"]) {
      assert.equal(periodoNatural(dia, 3), "2026-04-01", dia);
      assert.equal(cobroDeLaCuota(periodoNatural(dia, 3), 3), "2026-07-31", dia);
      assert.equal(cobroDeLaCuota(dia, 3), "2026-07-31", `${dia}, sin llevarla antes al día 1`);
    }
  });

  test("julio-septiembre: en octubre", () => {
    for (const dia of ["2026-07-01", "2026-08-15", "2026-09-30"]) {
      assert.equal(periodoNatural(dia, 3), "2026-07-01", dia);
      assert.equal(cobroDeLaCuota(periodoNatural(dia, 3), 3), "2026-10-31", dia);
    }
  });

  test("octubre-diciembre: en enero del año siguiente (el paso de año)", () => {
    for (const dia of ["2026-10-01", "2026-11-15", "2026-12-31"]) {
      assert.equal(periodoNatural(dia, 3), "2026-10-01", dia);
      assert.equal(cobroDeLaCuota(periodoNatural(dia, 3), 3), "2027-01-31", dia);
    }
  });

  test("enero-marzo: en abril", () => {
    for (const dia of ["2026-01-01", "2026-02-15", "2026-03-31"]) {
      assert.equal(periodoNatural(dia, 3), "2026-01-01", dia);
      assert.equal(cobroDeLaCuota(periodoNatural(dia, 3), 3), "2026-04-30", dia);
    }
  });

  test("los dos semestres: enero-junio en julio y julio-diciembre en enero", () => {
    assert.equal(periodoNatural("2026-03-01", 6), "2026-01-01");
    assert.equal(cobroDeLaCuota(periodoNatural("2026-03-01", 6), 6), "2026-07-31");
    assert.equal(periodoNatural("2026-09-01", 6), "2026-07-01");
    assert.equal(cobroDeLaCuota(periodoNatural("2026-09-01", 6), 6), "2027-01-31");
  });

  test("el semestral lleva el aviso de la regla deducida, y el trimestral no", () => {
    const semestral = cuotasQueFaltan(
      { fechaEfecto: "2026-09-01", cuotasCadaMeses: 6, laFirmaCobraLaPrimera: false },
      { desde: null, hasta: "2027-01-01", guardadas: [] },
    );
    assert.deepEqual(semestral.cuotas, [{ numero: 1, periodo: "2026-07-01", fechaCobro: "2027-01-31" }]);
    assert.deepEqual(codigos(semestral.avisos), ["dato_provisional"]);
    assert.match(semestral.avisos[0].texto, /deducido/);

    const trimestral = cuotasQueFaltan(
      { fechaEfecto: "2026-09-01", cuotasCadaMeses: 3, laFirmaCobraLaPrimera: false },
      { desde: null, hasta: "2027-01-01", guardadas: [] },
    );
    assert.deepEqual(trimestral.avisos, []);
  });

  test("cómo se nombra un periodo y qué número de cuota es", () => {
    assert.equal(nombreDelPeriodo("2026-07-01", 3), "julio-septiembre de 2026");
    assert.equal(nombreDelPeriodo("2026-11-15", 3), "octubre-diciembre de 2026");
    assert.equal(nombreDelPeriodo("2027-01-01", 6), "enero-junio de 2027");
    assert.equal(periodoCorto("2026-07-01", 3), "jul-sep");
    assert.equal(periodoCorto("2026-07-01", 6), "jul-dic");
    assert.equal(numeroDeLaCuota(RC, "2026-04-01"), 1);
    assert.equal(numeroDeLaCuota(RC, "2027-01-01"), 4);
  });
});

describe("la firma de una serie: el cobro es el de su primera cuota", () => {
  test("un efecto del 1 de abril trimestral cobra la primera en julio, no en mayo", () => {
    const propuesta = proponerFirma(firmaDelRc("2026-04-01", { cuotasCadaMeses: 3 }), contexto());
    assert.equal(propuesta.fechaEfecto, "2026-04-01");
    assert.equal(propuesta.fechaCobro, "2026-07-31");
    assert.equal(propuesta.tipoComision, "sobre_recibo");
    assert.equal(propuesta.unidades, 0);
    assert.equal(propuesta.unidadesNivel, 37);
    // La regla de las cuotas es de Facundo: el «cobro sin confirmar» de Plus Ultra no sale
    assert.ok(!codigos(propuesta.avisos).includes("cobro_sin_confirmar"));
  });

  test("sin cuotasCadaMeses, la misma firma sale en mayo, como hoy, y todo igual que sin decirlo", () => {
    const hoy = proponerFirma(firmaDelRc("2026-04-01"), contexto());
    assert.equal(hoy.fechaCobro, "2026-05-31");
    assert.ok(codigos(hoy.avisos).includes("cobro_sin_confirmar"));
    assert.deepEqual(proponerFirma(firmaDelRc("2026-04-01", { cuotasCadaMeses: undefined }), contexto()), hoy);
    assert.deepEqual(proponerFirma(firmaDelRc("2026-04-01", { cuotasCadaMeses: null }), contexto()), hoy);
  });

  test("semestral: julio-diciembre en enero, con el aviso de la regla deducida", () => {
    const propuesta = proponerFirma(firmaDelRc("2026-09-01", { cuotasCadaMeses: 6 }), contexto());
    assert.equal(propuesta.fechaCobro, "2027-01-31");
    assert.ok(propuesta.avisos.some((a) => a.codigo === "dato_provisional" && /semestrales/.test(a.texto)));
  });
});

describe("lo que se programa", () => {
  test("la ventana: del mes siguiente a la última liquidación a seis meses después del de hoy", () => {
    assert.deepEqual(ventanaDeProgramacion("2026-11-01", "2026-07-01"), { desde: "2026-08-01", hasta: "2027-05-01" });
    assert.deepEqual(ventanaDeProgramacion("2026-11-20", null), { desde: null, hasta: "2027-05-01" });
  });

  test("la serie entera, de la del efecto a la última que se cobra hasta un mes (incluido)", () => {
    assert.deepEqual(cuotasDeLaSerie(RC, "2027-01-01"), [
      { numero: 1, periodo: "2026-04-01", fechaCobro: "2026-07-31" },
      { numero: 2, periodo: "2026-07-01", fechaCobro: "2026-10-31" },
      { numero: 3, periodo: "2026-10-01", fechaCobro: "2027-01-31" },
    ]);
    assert.deepEqual(cuotasDeLaSerie(RC, "2026-06-30"), []);
  });

  test("el RC (la firma cobra la primera, desde 2026-08, hasta 2027-05): julio-septiembre, octubre-diciembre y enero-marzo, sin avisos", () => {
    const { cuotas, sinProgramar, avisos } = cuotasQueFaltan(RC, { desde: "2026-08-01", hasta: "2027-05-01", guardadas: [] });
    assert.deepEqual(cuotas, [
      { numero: 2, periodo: "2026-07-01", fechaCobro: "2026-10-31" },
      { numero: 3, periodo: "2026-10-01", fechaCobro: "2027-01-31" },
      { numero: 4, periodo: "2027-01-01", fechaCobro: "2027-04-30" },
    ]);
    assert.deepEqual(sinProgramar, []);
    assert.deepEqual(avisos, []);
  });

  test("no duplica: con julio-septiembre guardada salen las dos siguientes; con las tres, ninguna", () => {
    const una = cuotasQueFaltan(RC, { desde: "2026-08-01", hasta: "2027-05-01", guardadas: ["2026-07-01"] });
    assert.deepEqual(una.cuotas.map((c) => c.periodo), ["2026-10-01", "2027-01-01"]);
    const todas = cuotasQueFaltan(RC, { desde: "2026-08-01", hasta: "2027-05-01", guardadas: ["2026-07-01", "2026-10-01", "2027-01-01"] });
    assert.deepEqual(todas.cuotas, []);
    assert.deepEqual(todas.sinProgramar, []);
  });

  test("una serie nueva (la firma no cobra): también la del periodo del efecto", () => {
    const nueva = { fechaEfecto: "2027-04-01", cuotasCadaMeses: 3, laFirmaCobraLaPrimera: false };
    assert.deepEqual(cuotasQueFaltan(nueva, { desde: "2026-08-01", hasta: "2027-07-01", guardadas: [] }).cuotas, [
      { numero: 1, periodo: "2027-04-01", fechaCobro: "2027-07-31" },
    ]);
    // Con la ventana del 2026-11-01 (hasta 2027-05), todavía ninguna: se programa sola más adelante
    assert.deepEqual(cuotasQueFaltan(nueva, { desde: "2026-08-01", hasta: "2027-05-01", guardadas: [] }).cuotas, []);
  });

  test("lo que se cobraría antes de desde no se programa: va a sinProgramar, con su aviso", () => {
    // La spec dice «una cuota de agosto»: con la regla no hay cuotas en agosto (se cobran en enero, abril,
    // julio y octubre), así que se prueba la de julio con julio y agosto ya liquidados (desde 2026-09)
    const tarde = { fechaEfecto: "2026-05-15", cuotasCadaMeses: 3, laFirmaCobraLaPrimera: false };
    const { cuotas, sinProgramar, avisos } = cuotasQueFaltan(tarde, { desde: "2026-09-01", hasta: "2027-05-01", guardadas: [] });
    assert.deepEqual(sinProgramar, [{ numero: 1, periodo: "2026-04-01", fechaCobro: "2026-07-31" }]);
    assert.deepEqual(cuotas.map((c) => c.fechaCobro), ["2026-10-31", "2027-01-31", "2027-04-30"]);
    assert.deepEqual(codigos(avisos), ["cuotas_sin_programar"]);
    assert.equal(
      avisos[0].texto,
      "La cuota de abril-junio de 2026 se cobraría en julio de 2026, y las liquidaciones hasta agosto de 2026 ya han llegado: no se programa sola. " +
        "Si llegó en esa liquidación, deshazla, programa las cuotas de la serie y vuelve a marcar «Ha llegado»; si no, apúntala a mano.",
    );
    // Si ya está guardada, no es «sin programar»
    assert.deepEqual(cuotasQueFaltan(tarde, { desde: "2026-09-01", hasta: "2027-05-01", guardadas: ["2026-04-01"] }).sinProgramar, []);
  });

  test("el RC convertido después de «Ha llegado» de octubre: julio-septiembre no se programa, y el aviso dice cómo arreglarlo", () => {
    const { cuotas, sinProgramar, avisos } = cuotasQueFaltan(RC, { desde: "2026-11-01", hasta: "2027-05-01", guardadas: [] });
    assert.deepEqual(sinProgramar.map((c) => c.periodo), ["2026-07-01"]);
    assert.deepEqual(cuotas.map((c) => c.periodo), ["2026-10-01", "2027-01-01"]);
    assert.match(avisos[0].texto, /julio-septiembre de 2026 se cobraría en octubre de 2026/);
    assert.match(avisos[0].texto, /deshazla, programa las cuotas de la serie y vuelve a marcar «Ha llegado»/);
  });

  test("sin ninguna liquidación (desde null), todo se programa", () => {
    const { cuotas, sinProgramar } = cuotasQueFaltan(RC, { desde: null, hasta: "2026-10-01", guardadas: [] });
    assert.deepEqual(cuotas.map((c) => c.periodo), ["2026-07-01"]);
    assert.deepEqual(sinProgramar, []);
  });
});

describe("anular corta las que no se han cobrado de los periodos que empiezan después", () => {
  const cuotas = [
    { periodo: "2026-04-01", cobrada: true },
    { periodo: "2026-07-01", cobrada: true },
    { periodo: "2026-10-01", cobrada: false },
    { periodo: "2027-01-01", cobrada: false },
    { periodo: "2027-04-01", cobrada: false },
  ];
  const periodos = (lista) => lista.map((c) => c.periodo);

  test("el 2026-11-15 se cortan enero-marzo y abril-junio de 2027; octubre-diciembre se queda pendiente", () => {
    assert.deepEqual(periodos(cuotasQueSeCortan(cuotas, "2026-11-15")), ["2027-01-01", "2027-04-01"]);
  });

  test("el 2027-01-01 se queda también enero-marzo: su periodo empieza ese día", () => {
    assert.deepEqual(periodos(cuotasQueSeCortan(cuotas, "2027-01-01")), ["2027-04-01"]);
  });

  test("una cobrada no se corta nunca", () => {
    assert.deepEqual(periodos(cuotasQueSeCortan(cuotas, "2026-01-01")), ["2026-10-01", "2027-01-01", "2027-04-01"]);
  });
});

describe("el dinero: la cuota, la n.º 6 y el nivel", () => {
  test("una cuota del RC: 1,52 u a 2 €, sin hucha, IRPF 15 → 3,04 · 0 · 0,46 · 2,58", () => {
    assert.deepEqual(calcularImportes(1.52, 2, 0, 15), { bruto: 3.04, hucha: 0, irpf: 0.46, neto: 2.58 });
  });

  test("la n.º 6: el TopPlan (180 · 18 · 15) y la cuota (3,04 · 0 · 15) → 140,28 €, el documento", () => {
    const liquidacion = calcularLiquidacion([
      { bruto: 180, hucha: 18, pctIrpf: 15 },
      { bruto: 3.04, hucha: 0, pctIrpf: 15 },
    ]);
    assert.deepEqual(liquidacion, { comision: 183.04, rc: 18, comisionNeta: 165.04, irpf: 24.76, cargos: 0, importe: 140.28 });
  });

  test("el nivel: la herramienta cuenta sus 37 y las cuotas, 0", () => {
    const herramientas = [
      { mesProduccion: "2026-05-01", unidades: 0, unidadesNivel: 37, estado: "confirmada" },
      { mesProduccion: "2026-05-01", unidades: 1.52, unidadesNivel: 0, estado: "confirmada" },
      { mesProduccion: "2026-05-01", unidades: 1.52, unidadesNivel: 0, estado: "confirmada" },
      { mesProduccion: "2026-05-01", unidades: 1.52, unidadesNivel: 0, estado: "prevista" },
    ];
    assert.equal(unidadesAcumuladas("2027-12-01", contexto({ herramientas })), 37);
    assert.equal(unidadesAcumuladas("2027-12-01", contexto({ herramientas }), { conPrevistas: true }), 37);
  });
});

describe("el recuento: una cuota no es una herramienta más", () => {
  /** Una línea de liquidación como las de `leerLineasGuardadas` */
  const linea = (mes, unidades, valorUnidad, pctHucha, { prevista = false, aportacionDe = null, cuotaDe = null } = {}) => {
    const { bruto, hucha } = calcularImportes(unidades, valorUnidad, pctHucha, 15);
    return { mes, prevista, cobrada: false, unidades, bruto, hucha, pctIrpf: 15, aportacionDe, cuotaDe };
  };
  const octubre = [linea("2026-10-01", 90, 2, 10), linea("2026-10-01", 1.52, 2, 0, { cuotaDe: SERIE })];

  test("una cuota es la que tiene cuotaDe", () => {
    assert.equal(esCuota({ cuotaDe: SERIE }), true);
    assert.equal(esCuota({ cuotaDe: null }), false);
    assert.equal(esCuota({}), false);
  });

  test("una herramienta y una cuota: { herramientas: 1, apex: 0, cuotas: 1, previstas: 0 }", () => {
    assert.deepEqual(recuentoDelMes(octubre), { herramientas: 1, apex: 0, cuotas: 1, previstas: 0 });
  });

  test("sin cuotas, el recuento es el de siempre (sin la clave cuotas)", () => {
    assert.deepEqual(recuentoDelMes([linea("2026-10-01", 90, 2, 10)]), { herramientas: 1, apex: 0, previstas: 0 });
  });

  test("una cuota prevista cuenta en las previstas", () => {
    assert.deepEqual(recuentoDelMes([linea("2027-01-01", 1.52, 2, 0, { prevista: true, cuotaDe: SERIE })]), {
      herramientas: 0,
      apex: 0,
      cuotas: 1,
      previstas: 1,
    });
  });

  test("los textos: «1 herramienta y 1 cuota», «2 cuotas», «4 herramientas, 1 APEX y 2 cuotas»", () => {
    assert.equal(textoDelRecuento(recuentoDelMes(octubre)), "1 herramienta y 1 cuota");
    assert.equal(textoDeHerramientas({ herramientas: 0, apex: 0, cuotas: 2 }), "2 cuotas");
    assert.equal(textoDeHerramientas({ herramientas: 4, apex: 1, cuotas: 2 }), "4 herramientas, 1 APEX y 2 cuotas");
    assert.equal(textoDelRecuento({ herramientas: 0, apex: 0, cuotas: 1, previstas: 1 }), "1 cuota · 1 prevista");
    assert.equal(textoDeHerramientas({ herramientas: 4, apex: 1, cuotas: 0 }), "4 herramientas y 1 APEX");
  });

  test("en la casilla de OVB: «1 herramienta y 1 cuota · 91,52 u — 140,28 €»", () => {
    assert.equal(herramientasDeLaCasilla(octubre), "1 herramienta y 1 cuota");
    const [mes] = liquidacionesPorMes({ lineas: octubre }).meses;
    assert.equal(mes.texto, "2026-10 — Liquidación OVB · 1 herramienta y 1 cuota · 91,52 u — 140,28 €");
    assert.equal(herramientasDeLaCasilla([linea("2027-01-01", 1.52, 2, 0, { prevista: true, cuotaDe: SERIE })]), "1 cuota (1 prevista)");
  });

  test("julio sigue diciendo «3 herramientas»: la que cobra su primera cuota es una herramienta", () => {
    const julio = [linea("2026-07-01", 100, 2, 10), linea("2026-07-01", 50, 2, 10), linea("2026-07-01", 1.52, 2, 0)];
    assert.equal(textoDelRecuento(recuentoDelMes(julio)), "3 herramientas");
    assert.equal(herramientasDeLaCasilla(julio), "3 herramientas");
  });
});

describe("errores de programación: RangeError", () => {
  test("cada 1 o 12 meses", () => {
    assert.throws(() => periodoNatural("2026-04-01", 1), RangeError);
    assert.throws(() => periodoNatural("2026-04-01", 12), RangeError);
    assert.throws(() => cobroDeLaCuota("2026-04-01", 12), RangeError);
    assert.throws(() => cuotasDeLaSerie({ ...RC, cuotasCadaMeses: 1 }, "2027-01-01"), RangeError);
    assert.throws(() => proponerFirma(firmaDelRc("2026-04-01", { cuotasCadaMeses: 12 }), contexto()), RangeError);
  });

  test("una fecha mal escrita", () => {
    assert.throws(() => periodoNatural("2026-4-1", 3), RangeError);
    assert.throws(() => cobroDeLaCuota("2026-13-01", 3), RangeError);
    assert.throws(() => cuotasQueSeCortan([{ periodo: "2026-10-01", cobrada: false }], "15/11/2026"), RangeError);
    assert.throws(() => cuotasQueFaltan(RC, { desde: null, hasta: "2027-05-01", guardadas: ["julio"] }), RangeError);
  });
});
