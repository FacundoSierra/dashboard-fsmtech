// Pruebas de las reglas de cobro de la consultoría y del cuadro de comisiones (REQ-001, spec 3.5).
// Con `npm test`. Los clientes y las firmas son inventados. Los cierres son los del calendario de OVB
// de 2026, y las cifras de abril, mayo y julio, los totales de sus liquidaciones: ninguno lleva datos
// de nadie.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AJUSTES_DE_SERIE,
  COMPANIAS_DE_SERIE,
  calcularImportes,
  calcularLiquidacion,
  cargoDelResto,
  cuentaDeComisiones,
  datosDeCompania,
  extornoPropuesto,
  fechasDeLaFirma,
  finDelExtorno,
  hoyEnMadrid,
  irpfDeReclamacion,
  irpfSobreTotal,
  mesesDeLiquidacion,
  mesesHastaCobroPara,
  pctHuchaPara,
  plazoDeIncidencia,
  primerDiaDelMes,
  productoDelCuadro,
  proponerExtorno,
  proponerFirma,
  proximosCierres,
  saldoDeHucha,
  sumarImportes,
  ultimoDiaDelMes,
  unidadesAcumuladas,
  unidadesPropuestas,
  valorUnidadDelMes,
} from "./reglas.ts";
import { CUADRO_VIGENTE, NIVELES_DE_SERIE } from "./cuadro.ts";

const CUADRO = CUADRO_VIGENTE;

const CIERRES = [
  { mes: "2026-03-01", calendario: "INTESA", confirmarHasta: "2026-03-17", incidenciasHasta: "2026-03-19" },
  { mes: "2026-03-01", calendario: "AVANZA", confirmarHasta: "2026-03-20", incidenciasHasta: "2026-03-30" },
  { mes: "2026-03-01", calendario: "AXA_PIAS", confirmarHasta: "2026-03-23", incidenciasHasta: "2026-04-01" },
  { mes: "2026-03-01", calendario: "RANKING", confirmarHasta: "2026-03-31", incidenciasHasta: "2026-04-08" },
  { mes: "2026-10-01", calendario: "INTESA", confirmarHasta: "2026-10-19", incidenciasHasta: "2026-10-21" },
  { mes: "2026-10-01", calendario: "AVANZA", confirmarHasta: "2026-10-22", incidenciasHasta: "2026-10-29" },
  { mes: "2026-10-01", calendario: "AXA_PIAS", confirmarHasta: "2026-10-26", incidenciasHasta: "2026-11-03" },
  { mes: "2026-10-01", calendario: "RANKING", confirmarHasta: "2026-10-31", incidenciasHasta: "2026-11-05" },
  { mes: "2026-11-01", calendario: "INTESA", confirmarHasta: "2026-11-17", incidenciasHasta: "2026-11-19" },
  { mes: "2026-11-01", calendario: "AVANZA", confirmarHasta: "2026-11-20", incidenciasHasta: "2026-11-26" },
  { mes: "2026-11-01", calendario: "AXA_PIAS", confirmarHasta: "2026-11-23", incidenciasHasta: "2026-12-02" },
  { mes: "2026-11-01", calendario: "RANKING", confirmarHasta: "2026-11-30", incidenciasHasta: "2026-12-03" },
];

/** Un contexto con los cierres de prueba, el cuadro vigente y, salvo que se diga otra cosa, todo lo de serie */
function contexto({
  unidadesPrevias = 0,
  herramientas = [],
  niveles = NIVELES_DE_SERIE,
  companias = [],
  cuadro = CUADRO,
  pctHucha = AJUSTES_DE_SERIE.pctHucha,
  pctIrpf = AJUSTES_DE_SERIE.pctIrpf,
} = {}) {
  return { cuadro, companias, cierres: CIERRES, niveles, ajustes: { unidadesPrevias, pctHucha, pctIrpf }, herramientas };
}

/** Las fechas de una firma con el contexto de prueba */
const fechas = (entrada, ctx = contexto()) => fechasDeLaFirma({ pago: "domiciliacion", ...entrada }, ctx);
const codigos = (avisos) => avisos.map((a) => a.codigo).sort();
const fila = (bruto, hucha, irpf, neto) => ({ bruto, hucha, irpf, neto });
/** Líneas de liquidación al 15 % a partir de los importes de cada fila */
const lineas = (filas, pctIrpf = 15) => filas.map((f) => ({ bruto: f.bruto, hucha: f.hucha, pctIrpf }));
const liquidacion = (comision, rc, comisionNeta, irpf, cargos, importe) => ({ comision, rc, comisionNeta, irpf, cargos, importe });
const sinTramo = { unidades: 81.6, propio: false };

describe("valores de serie y cuadro", () => {
  test("ajustes y los siete niveles", () => {
    assert.deepEqual(AJUSTES_DE_SERIE, { unidadesPrevias: 0, pctHucha: 10, pctIrpf: 15 });
    assert.deepEqual(
      NIVELES_DE_SERIE.map((n) => [n.nombre, n.valorUnidad, n.desdeUnidades, n.desdeMes]),
      [
        ["Financial Trainee", 2, 0, null],
        ["Financial Consultant", 2.5, 1000, null],
        ["Gestor de Equipo", 3.5, null, null],
        ["Coordinador de Zona", 4.5, null, null],
        ["Director de Agencia", 5, null, null],
        ["Director Regional", 5.5, null, null],
        ["Director Nacional", 6, null, null],
      ],
    );
    assert.equal(CUADRO.niveles, NIVELES_DE_SERIE);
  });

  test("el cuadro 3TM/2026: mínimo de 50 €, reserva y sus tramos", () => {
    assert.equal(CUADRO.version, "3TM/2026");
    assert.equal(CUADRO.minimoTransferencia, 50);
    assert.deepEqual(CUADRO.reserva, {
      pct: 10,
      propio: 100,
      tramos: [
        { masDeUnidades: 1000, pct: 40 },
        { masDeUnidades: 600, pct: 30 },
      ],
    });
  });

  test("las cinco compañías de la migración (spec 2.1)", () => {
    assert.deepEqual(
      COMPANIAS_DE_SERIE.map((c) => [c.codigo, c.nombre, c.regla, c.calendario, c.pctHucha, c.mesesHastaCobro]),
      [
        ["AXA", "AXA", "axa_pias", "AXA_PIAS", null, 0],
        ["INTESA", "INTESA", "por_pago", "INTESA", null, 0],
        ["AVANZA", "AVANZA", "por_pago", "AVANZA", null, 0],
        ["ALL", "Allianz", "sin_calendario", null, null, 1],
        ["PLU", "Plus Ultra", "sin_calendario", null, null, 1],
      ],
    );
  });

  test("buscar un producto: por compañía, nombre y periodicidad, sin mayúsculas, acentos ni lo de tras « · »", () => {
    assert.equal(productoDelCuadro("AXA", "PIAS Global+", "mensual", CUADRO).tipo, "anticipada");
    assert.equal(productoDelCuadro("axa", " pfdina ", "mensual", CUADRO).tipo, "anticipada");
    assert.equal(productoDelCuadro("AXA", "PIAS Global+", "unica", CUADRO).tipo, "unica");
    assert.equal(productoDelCuadro("INTESA", "TopPlan · aportación extraordinaria", "unica", CUADRO).tipo, "unica");
    assert.equal(productoDelCuadro("ALL", "Vida Riesgo Nivelado", "mensual", CUADRO).tipo, "anualizada");
    assert.equal(productoDelCuadro("PLU", "RC Íntegral", "mensual", CUADRO).tipo, "sobre_recibo");
    assert.equal(productoDelCuadro("AXA", "TopPlan", "mensual", CUADRO), null); // de otra compañía
    assert.equal(productoDelCuadro("AXA", "", "mensual", CUADRO), null);
  });
});

describe("importes por fila y liquidación con el IRPF sobre el total", () => {
  test("1. 40,8 × 2 · 204 × 2 · 81,6 × 2: liquidación de 652,80 con importe 499,39", () => {
    const filas = [calcularImportes(40.8, 2, 10, 15), calcularImportes(204, 2, 10, 15), calcularImportes(81.6, 2, 10, 15)];
    assert.deepEqual(
      filas.map((f) => [f.bruto, f.hucha]),
      [
        [81.6, 8.16],
        [408, 40.8],
        [163.2, 16.32],
      ],
    );
    assert.deepEqual(calcularLiquidacion(lineas(filas)), liquidacion(652.8, 65.28, 587.52, 88.13, 0, 499.39));
  });

  test("2. con 225 × 2,50 y 15 × 2,50 (todas al 10 %): comisión 1.252,80 e importe 958,39", () => {
    const filas = [
      calcularImportes(40.8, 2, 10, 15),
      calcularImportes(204, 2, 10, 15),
      calcularImportes(81.6, 2, 10, 15),
      calcularImportes(225, 2.5, 10, 15),
      calcularImportes(15, 2.5, 10, 15),
    ];
    assert.deepEqual(calcularLiquidacion(lineas(filas)), liquidacion(1252.8, 125.28, 1127.52, 169.13, 0, 958.39));
  });

  test("3. 208,8 × 2,50: 522,00 / 52,20 / IRPF 70,47 / 399,33", () => {
    assert.deepEqual(calcularLiquidacion(lineas([calcularImportes(208.8, 2.5, 10, 15)])), liquidacion(522, 52.2, 469.8, 70.47, 0, 399.33));
  });

  test("4. las trampas del redondeo por fila: 4,515 → 4,52 y 8,165 → 8,17", () => {
    assert.deepEqual(calcularImportes(16.72, 2, 10, 15), fila(33.44, 3.34, 4.52, 25.58));
    assert.deepEqual(calcularImportes(32.66, 2.5, 10, 15), fila(81.65, 8.17, 11.02, 62.46));
    assert.equal(calcularImportes(15.05, 2, 0, 15).irpf, 4.52); // 30,10 × 15 %, que en coma flotante daría 4,51
  });

  test("25. IRPF sobre el total frente a fila a fila: 19,14 y no 19,15", () => {
    const filas = [calcularImportes(40.8, 2, 10, 15), calcularImportes(30.1, 2, 10, 15)];
    assert.deepEqual(filas, [fila(81.6, 8.16, 11.02, 62.42), fila(60.2, 6.02, 8.13, 46.05)]);
    assert.equal(sumarImportes(filas).irpf, 19.15); // fila a fila, orientativo
    assert.deepEqual(calcularLiquidacion(lineas(filas)), liquidacion(141.8, 14.18, 127.62, 19.14, 0, 108.48));
  });

  test("26. abril de 2026: dos líneas de 163,20 dan 249,70", () => {
    const filas = [calcularImportes(81.6, 2, 10, 15), calcularImportes(81.6, 2, 10, 15)];
    assert.deepEqual(calcularLiquidacion(lineas(filas)), liquidacion(326.4, 32.64, 293.76, 44.06, 0, 249.7));
  });

  test("27. mayo y julio de 2026: IRPF sobre el total de 327,74 y de 422,08", () => {
    assert.equal(irpfSobreTotal(327.74, 15), 49.16);
    assert.equal(irpfSobreTotal(422.08, 15), 63.31);
    // Mayo: la RC de cada fila redondeada (16,32 + 20,10) da 36,42
    const mayo = [calcularImportes(81.6, 2, 10, 15), calcularImportes(100.48, 2, 10, 15)];
    assert.deepEqual(calcularLiquidacion(lineas(mayo)), liquidacion(364.16, 36.42, 327.74, 49.16, 0, 278.58));
    // Julio: una de las filas sin reserva (0 %)
    const julio = [calcularImportes(81.6, 2, 10, 15), calcularImportes(151.2, 2, 10, 15), calcularImportes(1.52, 2, 0, 15)];
    assert.deepEqual(calcularLiquidacion(lineas(julio)), liquidacion(468.64, 46.56, 422.08, 63.31, 0, 358.77));
  });

  test("con dos % de IRPF en el mismo mes, uno sobre el total de cada uno", () => {
    const resultado = calcularLiquidacion([
      { bruto: 100, hucha: 10, pctIrpf: 15 },
      { bruto: 33.33, hucha: 3.33, pctIrpf: 7 },
    ]);
    assert.equal(resultado.irpf, 15.6); // 15 % de 90,00 (13,50) y 7 % de 30,00 (2,10)
  });

  test("una liquidación sin comisiones, solo con cargos; y sumar nada da cero, sin −0", () => {
    assert.deepEqual(calcularLiquidacion([], [-30]), liquidacion(0, 0, 0, 0, -30, -30));
    assert.deepEqual(sumarImportes([]), fila(0, 0, 0, 0));
    assert.deepEqual(calcularLiquidacion([]), liquidacion(0, 0, 0, 0, 0, 0));
  });

  test("un número que no es finito no se calcula", () => {
    assert.throws(() => calcularImportes(Number.NaN, 2, 10, 15), RangeError);
    assert.throws(() => calcularImportes(10, Number.POSITIVE_INFINITY, 10, 15), RangeError);
    assert.throws(() => calcularLiquidacion([{ bruto: Number.NaN, hucha: 0, pctIrpf: 15 }]), RangeError);
  });
});

describe("cuenta de comisiones", () => {
  const ENERO = calcularLiquidacion([], [-30]).importe;
  const FEBRERO = calcularLiquidacion([], [15]).importe;
  const ABRIL = calcularLiquidacion(lineas([calcularImportes(81.6, 2, 10, 15), calcularImportes(81.6, 2, 10, 15)])).importe;

  test("28 y 35. 2026: enero −30, febrero +15 y abril 249,70 → a pagar 0 · 0 · 234,70", () => {
    const cuenta = [
      { mes: "2026-01-01", importe: ENERO },
      { mes: "2026-02-01", importe: FEBRERO },
      { mes: "2026-04-01", importe: ABRIL },
    ];
    const esperado = [
      { mes: "2026-01-01", importe: -30, saldoAnterior: 0, aPagar: 0, saldoDespues: -30 },
      { mes: "2026-02-01", importe: 15, saldoAnterior: -30, aPagar: 0, saldoDespues: -15 },
      { mes: "2026-04-01", importe: 249.7, saldoAnterior: -15, aPagar: 234.7, saldoDespues: 0 },
    ];
    assert.deepEqual(cuentaDeComisiones(cuenta), esperado);
    assert.deepEqual(cuentaDeComisiones(cuenta, 0, CUADRO.minimoTransferencia), esperado);
  });

  test("35. por debajo de 50 € no hay transferencia, aunque sea positivo; con 50 justos, sí", () => {
    assert.deepEqual(
      cuentaDeComisiones([
        { mes: "2026-05-01", importe: 40 },
        { mes: "2026-06-01", importe: 30 },
      ]),
      [
        { mes: "2026-05-01", importe: 40, saldoAnterior: 0, aPagar: 0, saldoDespues: 40 },
        { mes: "2026-06-01", importe: 30, saldoAnterior: 40, aPagar: 70, saldoDespues: 0 },
      ],
    );
    assert.equal(cuentaDeComisiones([{ mes: "2026-05-01", importe: 50 }])[0].aPagar, 50);
    assert.equal(cuentaDeComisiones([{ mes: "2026-05-01", importe: 49.99 }])[0].saldoDespues, 49.99);
    // Con otro mínimo (si cambia el cuadro)
    assert.equal(cuentaDeComisiones([{ mes: "2026-05-01", importe: 40 }], 0, 30)[0].aPagar, 40);
  });

  test("va por orden de mes aunque lleguen desordenadas, y arranca del saldo inicial", () => {
    const pasos = cuentaDeComisiones(
      [
        { mes: "2026-04-01", importe: 249.7 },
        { mes: "2026-02-01", importe: 15 },
      ],
      -30,
    );
    assert.deepEqual(
      pasos.map((p) => [p.mes, p.aPagar, p.saldoDespues]),
      [
        ["2026-02-01", 0, -15],
        ["2026-04-01", 234.7, 0],
      ],
    );
  });

  test("23. una liquidación de 958,39 con el cargo del resto de un extorno (−308,00) deja 650,39", () => {
    const filas = [
      calcularImportes(40.8, 2, 10, 15),
      calcularImportes(204, 2, 10, 15),
      calcularImportes(81.6, 2, 10, 15),
      calcularImportes(225, 2.5, 10, 15),
      calcularImportes(15, 2.5, 10, 15),
    ];
    assert.equal(calcularLiquidacion(lineas(filas)).importe, 958.39);
    assert.deepEqual(
      calcularLiquidacion(lineas(filas), [cargoDelResto(308, 0)]),
      liquidacion(1252.8, 125.28, 1127.52, 169.13, -308, 650.39),
    );
  });
});

describe("los meses de la cuenta de comisiones (mesesDeLiquidacion)", () => {
  /** Una línea de `consultoria_lineas` al 15 %, con su bruto y su reserva por fila */
  const linea = (mes, unidades, valor, cobrada = false, pctHucha = 10) => {
    const { bruto, hucha } = calcularImportes(unidades, valor, pctHucha, 15);
    return { mes, cobrada, bruto, hucha, pctIrpf: 15 };
  };
  /** 2026 como en las liquidaciones de OVB: enero y febrero solo con cargos, abril con dos PIAS */
  const DE_2026 = {
    lineas: [linea("2026-04-01", 81.6, 2, true), linea("2026-04-01", 81.6, 2, true)],
    cargos: [
      { importe: -30, mes: "2026-01-01", aplicado: true },
      { importe: 15, mes: "2026-02-01", aplicado: true },
    ],
    llegadas: ["2026-01-01", "2026-02-01", "2026-04-01"],
  };
  const resumen = (m) => [m.mes, m.llegada, m.liquidacion.importe, m.paso.saldoAnterior, m.paso.aPagar, m.paso.saldoDespues];

  test("2026: enero y febrero sin transferencia y abril como el documento (a pagar 234,70)", () => {
    const { meses, sinMes } = mesesDeLiquidacion({ ...DE_2026, minimoTransferencia: CUADRO.minimoTransferencia });
    assert.deepEqual(meses.map(resumen), [
      ["2026-01-01", true, -30, 0, 0, -30],
      ["2026-02-01", true, 15, -30, 0, -15],
      ["2026-04-01", true, 249.7, -15, 234.7, 0],
    ]);
    assert.deepEqual(meses[2].liquidacion, liquidacion(326.4, 32.64, 293.76, 44.06, 0, 249.7));
    assert.equal(meses[2].pendiente, null);
    assert.equal(sinMes, 0);
  });

  test("lo que no ha llegado se espera entero, y un cargo sin aplicar entra solo en el primer mes por llegar", () => {
    const { meses } = mesesDeLiquidacion({
      lineas: [...DE_2026.lineas, linea("2026-11-01", 81.6, 2), linea("2026-11-01", 81.6, 2), linea("2026-12-01", 208.8, 2.5)],
      cargos: [...DE_2026.cargos, { importe: -30, mes: null, aplicado: false }],
      llegadas: DE_2026.llegadas,
    });
    assert.deepEqual(meses.slice(3).map(resumen), [
      ["2026-11-01", false, 219.7, 0, 219.7, 0],
      ["2026-12-01", false, 399.33, 0, 399.33, 0],
    ]);
    assert.equal(meses[3].liquidacion.cargos, -30);
    assert.equal(meses[4].liquidacion.cargos, 0);
  });

  test("en un mes que ha llegado, lo que se quedó sin cobrar va aparte y no cambia lo que se pagó", () => {
    const { meses } = mesesDeLiquidacion({
      lineas: [...DE_2026.lineas, linea("2026-04-01", 40.8, 2)],
      cargos: [...DE_2026.cargos, { importe: -20, mes: "2026-04-01", aplicado: false }],
      llegadas: DE_2026.llegadas,
    });
    assert.deepEqual(resumen(meses[2]), ["2026-04-01", true, 249.7, -15, 234.7, 0]);
    // 81,60 − 8,16 = 73,44; IRPF 11,02; con el resto de −20,00 sin aplicar: 42,42
    assert.deepEqual(meses[2].pendiente, liquidacion(81.6, 8.16, 73.44, 11.02, -20, 42.42));
  });

  test("un mes solo con el resto de un extorno previsto: sin transferencia y el saldo pasa al siguiente", () => {
    const { meses } = mesesDeLiquidacion({
      lineas: [linea("2027-04-01", 204, 2.5)],
      cargos: [{ importe: cargoDelResto(308, 0), mes: "2027-03-01", aplicado: false }],
      llegadas: [],
    });
    assert.deepEqual(meses.map(resumen), [
      ["2027-03-01", false, -308, 0, 0, -308],
      // 510,00 − 51,00 = 459,00; IRPF 68,85: 390,15 − 308,00
      ["2027-04-01", false, 390.15, -308, 82.15, 0],
    ]);
  });

  test("un mes que llegó vacío sale con todo a 0; sin ningún mes por llegar, lo sin aplicar no tiene dónde ir", () => {
    const { meses, sinMes } = mesesDeLiquidacion({
      lineas: [],
      cargos: [{ importe: -12.5, mes: null, aplicado: false }],
      llegadas: ["2026-06-01"],
      meses: ["2026-06-01"],
    });
    assert.deepEqual(meses.map(resumen), [["2026-06-01", true, 0, 0, 0, 0]]);
    assert.equal(sinMes, -12.5);
  });

  test("un cargo aplicado sin el mes de su liquidación es un error de programación", () => {
    assert.throws(() => mesesDeLiquidacion({ lineas: [], cargos: [{ importe: -30, mes: null, aplicado: true }], llegadas: [] }), RangeError);
  });
});

describe("compañías y reserva", () => {
  test("datos de una compañía: de las de serie con la lista vacía, y una desconocida no lanza", () => {
    assert.equal(datosDeCompania("AXA", []).regla, "axa_pias");
    assert.equal(datosDeCompania(" plu ", []).nombre, "Plus Ultra");
    assert.deepEqual(datosDeCompania("XYZ", COMPANIAS_DE_SERIE), {
      codigo: "XYZ",
      nombre: "XYZ",
      regla: "sin_calendario",
      calendario: null,
      pctHucha: null,
      mesesHastaCobro: null,
    });
  });

  test("29. RC Integral de Plus Ultra no lleva RC: 0, aunque sea propio o pase de 600 u", () => {
    const ctx = contexto();
    assert.equal(pctHuchaPara("PLU", "RC Integral", "mensual", ctx, sinTramo), 0);
    assert.equal(pctHuchaPara("PLU", " rc  integral ", "mensual", ctx, sinTramo), 0);
    assert.equal(pctHuchaPara("PLU", "RC Integral", "mensual", ctx, { unidades: 700, propio: true }), 0);
    // Un producto de PLU fuera del cuadro: la de la compañía o la de Ajustes
    assert.equal(pctHuchaPara("PLU", "Otro seguro", "mensual", ctx, sinTramo), 10);
    const comision = calcularImportes(1.52, 2, pctHuchaPara("PLU", "RC Integral", "mensual", ctx, sinTramo), 15);
    assert.equal(comision.hucha, 0);
    assert.deepEqual(calcularLiquidacion(lineas([comision])), liquidacion(3.04, 0, 3.04, 0.46, 0, 2.58));
  });

  test("34. reserva por tramos: 600 u → 10 %, 600,10 → 30 %, 1.000 → 30 %, 1.000,10 → 40 %, propio → 100 %", () => {
    const ctx = contexto();
    const pias = (unidades, propio = false) => pctHuchaPara("AXA", "PIAS Global+", "mensual", ctx, { unidades, propio });
    assert.deepEqual([pias(600), pias(600.1), pias(1000), pias(1000.1), pias(81.6, true)], [10, 30, 30, 40, 100]);
    // La aportación extraordinaria no lleva RC: ni propia
    assert.equal(pctHuchaPara("AXA", "PIAS Global+", "unica", ctx, { unidades: 15, propio: true }), 0);
  });

  test("34. la propuesta avisa cuando la reserva sube", () => {
    const grande = proponerFirma(
      { compania: "AXA", producto: "PIAS Global+", pago: "domiciliacion", fecha: "2026-10-20", unidades: 700 },
      contexto(),
    );
    assert.equal(grande.pctHucha, 30);
    assert.ok(codigos(grande.avisos).includes("reserva_por_tramo"));
    const propio = proponerFirma(
      { compania: "AXA", producto: "PIAS Global+", pago: "domiciliacion", fecha: "2026-10-20", unidades: 81.6, propio: true },
      contexto(),
    );
    assert.equal(propio.pctHucha, 100);
    assert.equal(propio.importes.hucha, propio.importes.bruto);
    assert.match(propio.avisos.find((a) => a.codigo === "reserva_por_tramo").texto, /propio/);
  });

  test("un 0 en la compañía es un valor: no cae a la de Ajustes", () => {
    const companias = COMPANIAS_DE_SERIE.map((c) => (c.codigo === "ALL" ? { ...c, pctHucha: 0 } : c));
    assert.equal(pctHuchaPara("ALL", "Vida Riesgo Nivelado", "mensual", contexto({ companias }), sinTramo), 0);
    const conCinco = COMPANIAS_DE_SERIE.map((c) => (c.codigo === "ALL" ? { ...c, pctHucha: 5 } : c));
    assert.equal(pctHuchaPara("ALL", "Vida Riesgo Nivelado", "mensual", contexto({ companias: conCinco }), sinTramo), 5);
    assert.equal(pctHuchaPara("AXA", "PIAS Global+", "mensual", contexto({ pctHucha: 12 }), sinTramo), 12);
  });

  test("meses hasta el cobro: el del cuadro, si no el de la compañía, si no el de su regla", () => {
    const ctx = contexto();
    assert.equal(mesesHastaCobroPara("AXA", "PIAS Global+", "mensual", "2026-11-10", ctx), 0); // dia15
    assert.equal(mesesHastaCobroPara("AXA", "PIAS Global+", "mensual", "2026-11-20", ctx), 1);
    assert.equal(mesesHastaCobroPara("AXA", "PIAS Global+", "unica", "2026-11-05", ctx), 1);
    assert.equal(mesesHastaCobroPara("INTESA", "TopPlan", "mensual", "2026-12-01", ctx), 0); // el de INTESA
    assert.equal(mesesHastaCobroPara("ALL", "Vida Riesgo Nivelado", "mensual", "2026-04-01", ctx), 1);
    assert.equal(mesesHastaCobroPara("XYZ", "", "mensual", "2026-04-01", ctx), 1);
    const sinDato = COMPANIAS_DE_SERIE.map((c) => ({ ...c, mesesHastaCobro: null }));
    assert.equal(mesesHastaCobroPara("AXA", "Otro", "mensual", "2026-11-10", contexto({ companias: sinDato })), 0);
    assert.equal(mesesHastaCobroPara("PLU", "Otro", "mensual", "2026-11-10", contexto({ companias: sinDato })), 1);
  });
});

describe("unidades del cuadro", () => {
  const propuestas = (compania, producto, periodicidad, aportacion, duracionAnios) =>
    unidadesPropuestas(compania, producto, periodicidad, { aportacion, duracionAnios }, CUADRO);

  test("36. PIAS: 100 €/mes a 26 años 81,6 · 300 a 25 208,8 · 250 a 30 204 · 50 a 30 40,8 · 100 a 15 43,2", () => {
    assert.deepEqual(
      [
        propuestas("AXA", "PIAS Global+", "mensual", 100, 26).unidades,
        propuestas("AXA", "PIAS Global+", "mensual", 300, 25).unidades,
        propuestas("AXA", "PFDina", "mensual", 250, 30).unidades,
        propuestas("AXA", "PIAS Global+", "mensual", 50, 30).unidades,
        propuestas("AXA", "PIAS Global+", "mensual", 100, 15).unidades,
      ],
      [81.6, 208.8, 204, 40.8, 43.2],
    );
    assert.equal(propuestas("AXA", "PIAS Global+", "mensual", 100, 18).unidades, 57.6); // 16–20: 4,80
    assert.deepEqual(propuestas("AXA", "PIAS Global+", "mensual", 100, 26), { unidades: 81.6, unidadesNivel: null, avisos: [] });
  });

  test("36. INTESA: TopPlan 300 €/mes a 25 años 225; a 35 cuenta 30 años, con aviso; Top10 300 €/mes 90", () => {
    assert.equal(propuestas("INTESA", "TopPlan", "mensual", 300, 25).unidades, 225);
    // El cuadro cuenta como mucho 30 años: 300 × 12 × 30 = 108.000 € → 270 u (la spec dice 225: ver el informe)
    const largo = propuestas("INTESA", "TopPlan", "mensual", 300, 35);
    assert.equal(largo.unidades, 270);
    assert.deepEqual(codigos(largo.avisos), ["duracion_maxima"]);
    assert.equal(propuestas("INTESA", "Top10", "mensual", 300).unidades, 90); // a 10 años fijos, sin duración
  });

  test("36. aportación extraordinaria de 5.000 € → 15; Allianz VRN de 50 €/mes → 114; AVANZA 100 €/mes → 0 y 1,8 para el nivel", () => {
    assert.equal(propuestas("AXA", "PIAS Global+", "unica", 5000).unidades, 15);
    assert.equal(propuestas("INTESA", "TopPlan", "unica", 5000).unidades, 15);
    const allianz = propuestas("ALL", "Vida Riesgo Nivelado", "mensual", 50);
    assert.equal(allianz.unidades, 114);
    assert.deepEqual(codigos(allianz.avisos), ["dato_provisional"]);
    const avanza = propuestas("AVANZA", "Ahorro Flexible", "mensual", 100);
    assert.deepEqual([avanza.unidades, avanza.unidadesNivel], [0, 1.8]);
    assert.deepEqual(codigos(avanza.avisos), ["dato_provisional"]);
    // RC Integral: sobre recibo, sin regla de unidades: 0 de una vez y las de nivel, a mano
    assert.deepEqual([propuestas("PLU", "RC Integral", "mensual", 20).unidades, propuestas("PLU", "RC Integral", "mensual", 20).unidadesNivel], [0, null]);
  });

  test("37. sin duración en un PIAS o un TopPlan, no propone; fuera del cuadro, tampoco", () => {
    const pias = propuestas("AXA", "PIAS Global+", "mensual", 100);
    assert.deepEqual([pias.unidades, codigos(pias.avisos)], [null, ["falta_duracion"]]);
    const topPlan = propuestas("INTESA", "TopPlan", "mensual", 300);
    assert.deepEqual([topPlan.unidades, codigos(topPlan.avisos)], [null, ["falta_duracion"]]);
    const fuera = propuestas("AXA", "Otro producto", "mensual", 100, 26);
    assert.deepEqual([fuera.unidades, fuera.unidadesNivel, codigos(fuera.avisos)], [null, null, ["producto_fuera_del_cuadro"]]);
    // Sin aportación, sin propuesta y sin aviso; TOP PREMIUM no tiene regla de unidades
    assert.deepEqual(propuestas("AXA", "PIAS Global+", "mensual", undefined, 26), { unidades: null, unidadesNivel: null, avisos: [] });
    assert.equal(propuestas("INTESA", "TopPremium", "unica", 10000).unidades, null);
  });

  test("las unidades dadas mandan sobre las del cuadro", () => {
    const propuesta = proponerFirma(
      { compania: "AXA", producto: "PIAS Global+", pago: "domiciliacion", fecha: "2026-10-20", aportacion: 100, duracionAnios: 26, unidades: 80 },
      contexto(),
    );
    assert.equal(propuesta.unidades, 80);
    assert.equal(propuesta.importes.bruto, 160);
    const sinDuracion = proponerFirma(
      { compania: "AXA", producto: "PIAS Global+", pago: "domiciliacion", fecha: "2026-10-20", aportacion: 100, unidades: 80 },
      contexto(),
    );
    assert.ok(!codigos(sinDuracion.avisos).includes("falta_duracion"));
  });
});

describe("fechas de una firma", () => {
  test("5. AXA confirmada el 2026-10-26, el día del cierre: efecto 10/11 y cobro 30/11", () => {
    assert.deepEqual(fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2026-10-26" }), {
      mesProduccion: "2026-10-01",
      fechaEfecto: "2026-11-10",
      fechaCobro: "2026-11-30",
      fechasProvisionales: false,
      avisos: [],
    });
  });

  test("6. AXA el 2026-10-27, pasado el cierre: efecto 10/12 y cobro 31/12", () => {
    const f = fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2026-10-27" });
    assert.equal(f.mesProduccion, "2026-10-01");
    assert.equal(f.fechaEfecto, "2026-12-10");
    assert.equal(f.fechaCobro, "2026-12-31");
    assert.equal(f.fechasProvisionales, false);
    assert.deepEqual(codigos(f.avisos), ["pasado_el_cierre"]);
    assert.match(f.avisos[0].texto, /AXA PIAS/);
  });

  test("en AXA, pagar por transferencia no cambia nada", () => {
    assert.deepEqual(
      fechas({ compania: "AXA", pago: "transferencia", fecha: "2026-10-27" }),
      fechas({ compania: "AXA", pago: "domiciliacion", fecha: "2026-10-27" }),
    );
  });

  test("7. AXA el 2026-11-24 (cierre el 23): efecto 10/01 y cobro 31/01 del año siguiente", () => {
    const f = fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2026-11-24" });
    assert.equal(f.mesProduccion, "2026-11-01");
    assert.equal(f.fechaEfecto, "2027-01-10");
    assert.equal(f.fechaCobro, "2027-01-31");
    assert.deepEqual(codigos(f.avisos), ["pasado_el_cierre"]);
  });

  test("8. INTESA por transferencia el 2026-11-02: efecto el 1 del mismo mes, provisional", () => {
    const f = fechas({ compania: "INTESA", producto: "TopPlan", pago: "transferencia", fecha: "2026-11-02" });
    assert.equal(f.mesProduccion, "2026-11-01");
    assert.equal(f.fechaEfecto, "2026-11-01");
    assert.equal(f.fechaCobro, "2026-11-30");
    assert.equal(f.fechasProvisionales, true);
    assert.deepEqual(codigos(f.avisos), ["transferencia_sin_confirmar"]);
  });

  test("INTESA por transferencia el día del cierre (17) todavía entra", () => {
    const f = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-17" });
    assert.equal(f.fechaCobro, "2026-11-30");
    assert.deepEqual(codigos(f.avisos), ["transferencia_sin_confirmar"]);
  });

  test("9. INTESA por transferencia el 2026-11-18, pasado el cierre: producción, efecto y cobro a diciembre", () => {
    const f = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-18" });
    assert.equal(f.mesProduccion, "2026-12-01");
    assert.equal(f.fechaEfecto, "2026-12-01");
    assert.equal(f.fechaCobro, "2026-12-31");
    assert.equal(f.fechasProvisionales, true);
    assert.deepEqual(codigos(f.avisos), ["pasado_el_cierre", "transferencia_sin_confirmar"]);
    assert.match(f.avisos.find((a) => a.codigo === "pasado_el_cierre").texto, /pasan a diciembre de 2026/);
  });

  test("INTESA por transferencia el 2026-11-25, pasado el cierre del 17: todo a diciembre, provisional", () => {
    const { avisos, ...resto } = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-25" });
    assert.deepEqual(resto, {
      mesProduccion: "2026-12-01",
      fechaEfecto: "2026-12-01",
      fechaCobro: "2026-12-31",
      fechasProvisionales: true,
    });
    assert.deepEqual(codigos(avisos), ["pasado_el_cierre", "transferencia_sin_confirmar"]);
  });

  test("AVANZA por transferencia pasado su cierre (22 de octubre): todo a noviembre", () => {
    const f = fechas({ compania: "AVANZA", pago: "transferencia", fecha: "2026-10-23" });
    assert.deepEqual([f.mesProduccion, f.fechaEfecto, f.fechaCobro], ["2026-11-01", "2026-11-01", "2026-11-30"]);
  });

  test("por domiciliación, pasado el cierre, la producción se queda en el mes de la confirmación", () => {
    assert.equal(fechas({ compania: "INTESA", fecha: "2026-11-25" }).mesProduccion, "2026-11-01");
    assert.equal(fechas({ compania: "AXA", pago: "transferencia", fecha: "2026-10-27" }).mesProduccion, "2026-10-01");
  });

  test("10. INTESA por domiciliación el 2026-11-10: efecto 01/12 y cobro 31/12, provisional", () => {
    const f = fechas({ compania: "INTESA", producto: "TopPlan", fecha: "2026-11-10" });
    assert.equal(f.mesProduccion, "2026-11-01");
    assert.equal(f.fechaEfecto, "2026-12-01");
    assert.equal(f.fechaCobro, "2026-12-31");
    assert.equal(f.fechasProvisionales, true);
    assert.deepEqual(codigos(f.avisos), ["dia_de_efecto_sin_confirmar"]);
  });

  test("AVANZA por domiciliación pasado su cierre (22 de octubre): efecto 01/12", () => {
    const f = fechas({ compania: "AVANZA", fecha: "2026-10-23" });
    assert.equal(f.mesProduccion, "2026-10-01");
    assert.equal(f.fechaEfecto, "2026-12-01");
    assert.equal(f.fechaCobro, "2026-12-31");
    assert.deepEqual(codigos(f.avisos), ["dia_de_efecto_sin_confirmar", "pasado_el_cierre"]);
  });

  test("11. un mes sin cierres cargados (2027-03): como si entrara a tiempo, con aviso", () => {
    const axa = fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2027-03-30" });
    assert.equal(axa.mesProduccion, "2027-03-01");
    assert.equal(axa.fechaEfecto, "2027-04-10");
    assert.equal(axa.fechaCobro, "2027-04-30");
    assert.deepEqual(codigos(axa.avisos), ["faltan_cierres"]);
    assert.match(axa.avisos[0].texto, /marzo de 2027/);

    const avanza = fechas({ compania: "AVANZA", fecha: "2027-03-30" });
    assert.equal(avanza.fechaEfecto, "2027-04-01");
    assert.equal(avanza.fechaCobro, "2027-04-30");
    assert.equal(avanza.fechasProvisionales, true);
    assert.deepEqual(codigos(avanza.avisos), ["dia_de_efecto_sin_confirmar", "faltan_cierres"]);
  });

  test("si la fecha pasa el cierre del ranking, la producción es del mes siguiente", () => {
    // Hoy el ranking siempre cierra el último día; con un cierre inventado el 28 se ve la regla
    const cierres = CIERRES.map((c) =>
      c.mes === "2026-10-01" && c.calendario === "RANKING" ? { ...c, confirmarHasta: "2026-10-28" } : c,
    );
    const f = fechas({ compania: "AXA", fecha: "2026-10-29" }, { ...contexto(), cierres });
    assert.equal(f.mesProduccion, "2026-11-01");
    assert.equal(f.fechaEfecto, "2026-12-10");
    assert.ok(f.avisos.every((a) => a.codigo === "pasado_el_cierre"));
    assert.equal(f.avisos.length, 2);
  });

  test("un efecto dado a mano manda: el cobro sale de él", () => {
    const axa = fechas({ compania: "AXA", fecha: "2026-10-20", fechaEfecto: "2026-11-08" });
    assert.deepEqual(axa, {
      mesProduccion: "2026-10-01",
      fechaEfecto: "2026-11-08",
      fechaCobro: "2026-11-30",
      fechasProvisionales: false,
      avisos: [],
    });
    const tarde = fechas({ compania: "AXA", fecha: "2026-10-27", fechaEfecto: "2026-11-10" });
    assert.equal(tarde.fechaCobro, "2026-11-30");
    assert.match(tarde.avisos[0].texto, /manda el efecto puesto a mano/);
    const domiciliada = fechas({ compania: "INTESA", fecha: "2026-11-10", fechaEfecto: "2026-12-05" });
    assert.deepEqual([domiciliada.fechaCobro, domiciliada.fechasProvisionales, domiciliada.avisos], ["2026-12-31", false, []]);
    const transferencia = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-25", fechaEfecto: "2026-12-03" });
    assert.deepEqual([transferencia.mesProduccion, transferencia.fechaCobro], ["2026-12-01", "2026-12-31"]);
    assert.equal(fechas({ compania: "AXA", fecha: "2026-10-26", fechaEfecto: "" }).fechaEfecto, "2026-11-10");
  });

  test("38. cobro dia15 del PIAS: efecto el 10 y el 15, ese mes; el 20, el siguiente", () => {
    const pias = (fechaEfecto) => fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2026-10-20", fechaEfecto });
    assert.equal(pias("2026-11-10").fechaCobro, "2026-11-30");
    const quince = pias("2026-11-15");
    assert.equal(quince.fechaCobro, "2026-11-30");
    assert.equal(quince.fechasProvisionales, true);
    assert.deepEqual(codigos(quince.avisos), ["dato_provisional"]);
    assert.equal(pias("2026-11-20").fechaCobro, "2026-12-31");
  });

  test("38. aportación extraordinaria de AXA: el efecto es el día de la aportación y se cobra el mes siguiente", () => {
    const extra = fechas({ compania: "AXA", producto: "PIAS Global+", periodicidad: "unica", fecha: "2026-11-05" });
    assert.deepEqual([extra.mesProduccion, extra.fechaEfecto, extra.fechaCobro], ["2026-11-01", "2026-11-05", "2026-12-31"]);
    assert.deepEqual(extra.avisos, []);
    // Su efecto no depende del cierre de AXA PIAS: el 28 de octubre (pasado el 26) sigue siendo ese día
    const tarde = fechas({ compania: "AXA", producto: "PFDina", periodicidad: "unica", fecha: "2026-10-28" });
    assert.deepEqual([tarde.fechaEfecto, tarde.fechaCobro, tarde.avisos], ["2026-10-28", "2026-11-30", []]);
  });

  test("30. compañía sin calendario (Allianz): el efecto dado y el cobro el mes siguiente, provisional", () => {
    const conEfecto = fechas({ compania: "ALL", producto: "Vida Riesgo Nivelado", fecha: "2026-03-20", fechaEfecto: "2026-04-01" });
    assert.deepEqual(
      { ...conEfecto, avisos: codigos(conEfecto.avisos) },
      {
        mesProduccion: "2026-03-01",
        fechaEfecto: "2026-04-01",
        fechaCobro: "2026-05-31",
        fechasProvisionales: true,
        avisos: ["cobro_sin_confirmar"],
      },
    );
    const sinEfecto = fechas({ compania: "ALL", producto: "Vida Riesgo Nivelado", fecha: "2026-03-20" });
    assert.equal(sinEfecto.fechaEfecto, "2026-04-01");
    assert.equal(sinEfecto.fechaCobro, "2026-05-31");
    assert.deepEqual(codigos(sinEfecto.avisos), ["cobro_sin_confirmar", "efecto_a_mano"]);
  });

  test("31. una compañía desconocida no lanza nada: sin calendario, con aviso", () => {
    const f = fechas({ compania: "XYZ", producto: "Algo", fecha: "2026-03-20" });
    assert.equal(f.fechaEfecto, "2026-04-01");
    assert.equal(f.fechaCobro, "2026-05-31");
    assert.equal(f.fechasProvisionales, true);
    assert.deepEqual(codigos(f.avisos), ["cobro_sin_confirmar", "compania_sin_reglas", "efecto_a_mano"]);
    assert.match(f.avisos.find((a) => a.codigo === "compania_sin_reglas").texto, /XYZ/);
    const propuesta = proponerFirma({ compania: "XYZ", producto: "Algo", pago: "domiciliacion", fecha: "2026-03-20", unidades: 10 }, contexto());
    assert.equal(propuesta.pctHucha, 10);
    assert.ok(codigos(propuesta.avisos).includes("producto_fuera_del_cuadro"));
    assert.equal(plazoDeIncidencia("XYZ", "2026-04-01", CIERRES, []), null);
  });

  test("32. el cobro del producto en el cuadro manda sobre el de la compañía", () => {
    const companias = COMPANIAS_DE_SERIE.map((c) => (c.codigo === "ALL" ? { ...c, mesesHastaCobro: 0 } : c));
    const vrn = fechas({ compania: "ALL", producto: "Vida Riesgo Nivelado", fecha: "2026-03-20", fechaEfecto: "2026-04-01" }, contexto({ companias }));
    assert.equal(vrn.fechaCobro, "2026-05-31");
    const conDos = COMPANIAS_DE_SERIE.map((c) => (c.codigo === "ALL" ? { ...c, mesesHastaCobro: 2 } : c));
    const otro = fechas({ compania: "ALL", producto: "Otro seguro", fecha: "2026-03-20", fechaEfecto: "2026-04-01" }, contexto({ companias: conDos }));
    assert.equal(otro.fechaCobro, "2026-06-30");
    assert.match(otro.avisos.find((a) => a.codigo === "cobro_sin_confirmar").texto, /2 meses después/);
  });

  test("33. PFDina y PIAS Global+ dan las mismas fechas y la misma reserva", () => {
    const pias = fechas({ compania: "AXA", producto: "PIAS Global+", fecha: "2026-10-26" });
    const pfdina = fechas({ compania: "AXA", producto: "PFDina", fecha: "2026-10-26" });
    assert.deepEqual(pfdina, pias);
    assert.deepEqual([pfdina.fechaEfecto, pfdina.fechaCobro], ["2026-11-10", "2026-11-30"]);
    const ctx = contexto();
    assert.equal(pctHuchaPara("AXA", "PFDina", "mensual", ctx, sinTramo), pctHuchaPara("AXA", "PIAS Global+", "mensual", ctx, sinTramo));
  });

  test("solo lanzan las fechas que no valen; una forma de pago rara cuenta como domiciliación", () => {
    assert.throws(() => fechas({ compania: "AXA", fecha: "2026-02-30" }), RangeError);
    assert.throws(() => fechas({ compania: "AXA", fecha: "26/10/2026" }), RangeError);
    assert.throws(() => fechas({ compania: "AXA", fecha: "2026-10-26", fechaEfecto: "2026-11-31" }), RangeError);
    assert.doesNotThrow(() => fechas({ compania: "MAPFRE", fecha: "2026-10-26" }));
    assert.deepEqual(
      fechas({ compania: "INTESA", pago: "efectivo", fecha: "2026-11-10" }),
      fechas({ compania: "INTESA", pago: "domiciliacion", fecha: "2026-11-10" }),
    );
  });
});

describe("unidades y nivel", () => {
  // Tres firmas de octubre de 2026 con 326,40 u entre las tres
  const OCTUBRE = [
    { mesProduccion: "2026-10-01", unidades: 40.8, unidadesNivel: null, estado: "confirmada" },
    { mesProduccion: "2026-10-01", unidades: 204, unidadesNivel: null, estado: "confirmada" },
    { mesProduccion: "2026-10-01", unidades: 81.6, unidadesNivel: null, estado: "confirmada" },
  ];

  test("12. con 827,20 previas, octubre va a 2,00 € (Financial Trainee) y noviembre a 2,50 €", () => {
    const ctx = contexto({ unidadesPrevias: 827.2, herramientas: OCTUBRE });
    assert.deepEqual(valorUnidadDelMes("2026-10-01", ctx), {
      nivel: "Financial Trainee",
      valorUnidad: 2,
      unidadesAntes: 827.2,
      avisos: [],
    });
    assert.deepEqual(valorUnidadDelMes("2026-11-01", ctx), {
      nivel: "Financial Consultant",
      valorUnidad: 2.5,
      unidadesAntes: 1153.6,
      avisos: [],
    });
    assert.equal(unidadesAcumuladas("2026-10-01", ctx), 1153.6);
    assert.equal(unidadesAcumuladas("2026-09-01", ctx), 827.2);
  });

  test("en el mes del cambio de nivel, una transferencia pasado el cierre de octubre va al €/unidad de noviembre", () => {
    const ctx = contexto({ unidadesPrevias: 827.2, herramientas: OCTUBRE });
    const tarde = proponerFirma({ compania: "INTESA", producto: "TopPlan", pago: "transferencia", fecha: "2026-10-20", unidades: 100 }, ctx);
    assert.deepEqual([tarde.mesProduccion, tarde.fechaEfecto, tarde.fechaCobro], ["2026-11-01", "2026-11-01", "2026-11-30"]);
    assert.equal(tarde.nivel, "Financial Consultant");
    assert.equal(tarde.valorUnidad, 2.5);
    assert.deepEqual(tarde.importes, calcularImportes(100, 2.5, 10, 15));
    const aTiempo = proponerFirma({ compania: "INTESA", producto: "TopPlan", pago: "transferencia", fecha: "2026-10-19", unidades: 100 }, ctx);
    assert.deepEqual([aTiempo.mesProduccion, aTiempo.fechaCobro, aTiempo.valorUnidad], ["2026-10-01", "2026-10-31", 2]);
    const domiciliada = proponerFirma({ compania: "INTESA", producto: "TopPlan", pago: "domiciliacion", fecha: "2026-10-20", unidades: 100 }, ctx);
    assert.deepEqual([domiciliada.mesProduccion, domiciliada.fechaCobro, domiciliada.valorUnidad], ["2026-10-01", "2026-12-31", 2]);
  });

  test("el mes se puede pasar con cualquier día: cuenta su mes", () => {
    const ctx = contexto({ unidadesPrevias: 827.2, herramientas: OCTUBRE });
    assert.equal(valorUnidadDelMes("2026-11-17", ctx).valorUnidad, 2.5);
    assert.equal(unidadesAcumuladas("2026-10-31", ctx), 1153.6);
  });

  test("13. justo en el umbral (1.000,00 antes) ya es 2,50 €; con 999,99, no", () => {
    assert.equal(valorUnidadDelMes("2026-11-01", contexto({ unidadesPrevias: 1000 })).valorUnidad, 2.5);
    assert.equal(valorUnidadDelMes("2026-11-01", contexto({ unidadesPrevias: 999.99 })).valorUnidad, 2);
  });

  test("14. una anulada no cuenta", () => {
    const ctx = contexto({
      unidadesPrevias: 900,
      herramientas: [{ mesProduccion: "2026-10-01", unidades: 200, unidadesNivel: null, estado: "anulada" }],
    });
    const valor = valorUnidadDelMes("2026-11-01", ctx);
    assert.equal(valor.valorUnidad, 2);
    assert.equal(valor.unidadesAntes, 900);
    assert.equal(unidadesAcumuladas("2026-10-01", ctx, { conPrevistas: true }), 900);
  });

  test("14. una prevista sí cuenta y, si decide el nivel, avisa", () => {
    const ctx = contexto({
      unidadesPrevias: 900,
      herramientas: [{ mesProduccion: "2026-10-01", unidades: 150, unidadesNivel: null, estado: "prevista" }],
    });
    const valor = valorUnidadDelMes("2026-11-01", ctx);
    assert.equal(valor.valorUnidad, 2.5);
    assert.equal(valor.unidadesAntes, 1050);
    assert.deepEqual(codigos(valor.avisos), ["nivel_con_previstas"]);
    assert.match(valor.avisos[0].texto, /Financial Trainee/);
    assert.equal(unidadesAcumuladas("2026-10-01", ctx), 900);
    assert.equal(unidadesAcumuladas("2026-10-01", ctx, { conPrevistas: true }), 1050);
  });

  test("14. una prevista que no cambia el nivel no avisa", () => {
    const ctx = contexto({
      unidadesPrevias: 1100,
      herramientas: [{ mesProduccion: "2026-10-01", unidades: 50, unidadesNivel: null, estado: "prevista" }],
    });
    assert.deepEqual(valorUnidadDelMes("2026-11-01", ctx).avisos, []);
  });

  test("15. Gestor de Equipo desde 2027-03-01: marzo a 3,50 € y febrero no", () => {
    const niveles = NIVELES_DE_SERIE.map((n) => (n.nombre === "Gestor de Equipo" ? { ...n, desdeMes: "2027-03-01" } : n));
    const ctx = contexto({ unidadesPrevias: 1200, niveles });
    assert.deepEqual(
      [valorUnidadDelMes("2027-02-01", ctx).valorUnidad, valorUnidadDelMes("2027-03-01", ctx).valorUnidad],
      [2.5, 3.5],
    );
    assert.equal(valorUnidadDelMes("2027-03-01", ctx).nivel, "Gestor de Equipo");
  });

  test("41. los siete niveles: el de mayor €/unidad alcanzado", () => {
    const desde = {
      "Gestor de Equipo": "2027-01-01",
      "Coordinador de Zona": "2027-06-01",
      "Director de Agencia": "2028-01-01",
      "Director Regional": "2029-01-01",
      "Director Nacional": "2030-01-01",
    };
    const niveles = NIVELES_DE_SERIE.map((n) => ({ ...n, desdeMes: desde[n.nombre] ?? n.desdeMes }));
    const ctx = contexto({ unidadesPrevias: 1000, niveles });
    const en = (mes) => [valorUnidadDelMes(mes, ctx).nivel, valorUnidadDelMes(mes, ctx).valorUnidad];
    assert.deepEqual(en("2026-12-01"), ["Financial Consultant", 2.5]);
    assert.deepEqual(en("2027-01-01"), ["Gestor de Equipo", 3.5]);
    assert.deepEqual(en("2027-07-01"), ["Coordinador de Zona", 4.5]);
    assert.deepEqual(en("2028-02-01"), ["Director de Agencia", 5]);
    assert.deepEqual(en("2029-05-01"), ["Director Regional", 5.5]);
    assert.deepEqual(en("2030-01-01"), ["Director Nacional", 6]);
    assert.deepEqual(valorUnidadDelMes("2026-12-01", contexto({ unidadesPrevias: 0 })).nivel, "Financial Trainee");
  });

  test("con niveles vacíos, los del cuadro; sin ninguno, 0 €/unidad y aviso", () => {
    assert.equal(valorUnidadDelMes("2026-11-01", contexto({ niveles: [], unidadesPrevias: 1000 })).valorUnidad, 2.5);
    const vacio = { ...CUADRO, niveles: [] };
    const valor = valorUnidadDelMes("2026-11-01", contexto({ niveles: [], cuadro: vacio }));
    assert.deepEqual([valor.valorUnidad, valor.nivel, codigos(valor.avisos)], [0, "", ["sin_niveles"]]);
  });

  test("42. sobre saldo y sobre recibo: el nivel cuenta las unidades de nivel, no las de la línea", () => {
    const ctx = contexto({
      herramientas: [
        // Una firma de AVANZA: 0 u de una vez, 1,8 de producción
        { mesProduccion: "2026-10-01", unidades: 0, unidadesNivel: 1.8, estado: "confirmada" },
        // Una comisión de RC Integral que llega: 1,52 u (3,04 €) en su liquidación, 0 para el nivel
        { mesProduccion: "2026-10-01", unidades: 1.52, unidadesNivel: 0, estado: "cobrada" },
      ],
    });
    assert.equal(unidadesAcumuladas("2026-10-01", ctx), 1.8);
    const firma = proponerFirma(
      { compania: "AVANZA", producto: "Ahorro Flexible", pago: "domiciliacion", fecha: "2026-10-15", aportacion: 100 },
      contexto(),
    );
    assert.deepEqual([firma.tipoComision, firma.unidades, firma.unidadesNivel, firma.importes.bruto], ["sobre_saldo", 0, 1.8, 0]);
    assert.ok(codigos(firma.avisos).includes("dato_provisional"));
    // La comisión sí es una línea de liquidación
    const comision = calcularImportes(1.52, 2, 0, 15);
    assert.equal(calcularLiquidacion(lineas([comision])).comision, 3.04);
  });
});

describe("proponer una firma con el cuadro: noviembre y diciembre", () => {
  // Seis herramientas inventadas de cinco clientes, con las unidades que propone el cuadro: tres PIAS de
  // octubre, un TopPlan y una aportación extraordinaria del mismo cliente por transferencia en noviembre
  // (previstas), y un PIAS de noviembre
  const FIRMAS = [
    { cliente: "Ana Ejemplo", compania: "AXA", producto: "PIAS Global+", aportacion: 50, duracionAnios: 30, fecha: "2026-10-05", estado: "confirmada" },
    { cliente: "Bruno Prueba", compania: "AXA", producto: "PIAS Global+", aportacion: 250, duracionAnios: 30, fecha: "2026-10-20", estado: "confirmada" },
    { cliente: "Carla Ficticia", compania: "AXA", producto: "PFDina", aportacion: 100, duracionAnios: 26, fecha: "2026-10-26", estado: "confirmada" },
    { cliente: "Dani Supuesto", compania: "INTESA", producto: "TopPlan", pago: "transferencia", aportacion: 300, duracionAnios: 25, fecha: "2026-11-02", estado: "prevista" },
    { cliente: "Dani Supuesto", compania: "INTESA", producto: "TopPlan", periodicidad: "unica", pago: "transferencia", aportacion: 5000, fecha: "2026-11-02", estado: "prevista" },
    { cliente: "Eva Inventada", compania: "AXA", producto: "PIAS Global+", aportacion: 300, duracionAnios: 25, fecha: "2026-11-10", estado: "confirmada" },
  ];

  /** Apunta las firmas una a una, como harían la pantalla o el script, y agrupa por mes de cobro */
  function apuntarTodas() {
    const ctx = contexto({ unidadesPrevias: 827.2 });
    const porMes = new Map();
    for (const firma of FIRMAS) {
      const propuesta = proponerFirma({ pago: "domiciliacion", ...firma }, ctx);
      ctx.herramientas.push({
        mesProduccion: propuesta.mesProduccion,
        unidades: propuesta.unidades,
        unidadesNivel: propuesta.unidadesNivel,
        estado: firma.estado,
      });
      const mes = primerDiaDelMes(propuesta.fechaCobro);
      porMes.set(mes, [...(porMes.get(mes) ?? []), { firma, propuesta }]);
    }
    return porMes;
  }

  const comoLineas = (apuntadas) =>
    apuntadas.map(({ propuesta }) => ({ bruto: propuesta.importes.bruto, hucha: propuesta.importes.hucha, pctIrpf: propuesta.pctIrpf }));

  test("las unidades que propone el cuadro y su nivel: octubre a 2,00 € y noviembre a 2,50 €", () => {
    const todas = [...apuntarTodas().values()].flat();
    assert.deepEqual(
      todas.map(({ propuesta }) => [propuesta.unidades, propuesta.valorUnidad, propuesta.versionCuadro]),
      [
        [40.8, 2, "3TM/2026"],
        [204, 2, "3TM/2026"],
        [81.6, 2, "3TM/2026"],
        [225, 2.5, "3TM/2026"],
        [15, 2.5, "3TM/2026"],
        [208.8, 2.5, "3TM/2026"],
      ],
    );
  });

  test("fixture de las notas del 24-10: noviembre con 5 herramientas y 566,40 u; la extraordinaria no lleva reserva y el importe sale 961,58", () => {
    const noviembre = apuntarTodas().get("2026-11-01");
    assert.equal(noviembre.length, 5);
    assert.equal(noviembre.filter(({ firma }) => firma.estado === "prevista").length, 2);
    assert.equal(Math.round(noviembre.reduce((s, { propuesta }) => s + propuesta.unidades * 100, 0)) / 100, 566.4);
    const extra = noviembre.find(({ firma }) => firma.periodicidad === "unica").propuesta;
    assert.deepEqual([extra.tipoComision, extra.pctHucha, extra.importes.hucha], ["unica", 0, 0]);
    // Con el cuadro, la aportación extraordinaria no lleva RC: 3,75 € menos de reserva que en el caso 2 (958,39)
    assert.deepEqual(calcularLiquidacion(comoLineas(noviembre)), liquidacion(1252.8, 121.53, 1131.27, 169.69, 0, 961.58));
  });

  test("diciembre: el PIAS de 208,8 u con efecto el 10, dia15: 399,33 €", () => {
    const diciembre = apuntarTodas().get("2026-12-01");
    assert.equal(diciembre.length, 1);
    assert.equal(calcularLiquidacion(comoLineas(diciembre)).importe, 399.33);
  });

  test("la propuesta lleva el IRPF de Ajustes, el tipo de comisión y los avisos de las fechas", () => {
    const ctx = contexto({
      unidadesPrevias: 827.2,
      pctIrpf: 19,
      herramientas: [{ mesProduccion: "2026-10-01", unidades: 326.4, unidadesNivel: null, estado: "confirmada" }],
    });
    const propuesta = proponerFirma(
      { compania: "INTESA", producto: "TopPlan", pago: "transferencia", fecha: "2026-11-02", aportacion: 300, duracionAnios: 25 },
      ctx,
    );
    assert.deepEqual(
      [propuesta.unidades, propuesta.unidadesNivel, propuesta.tipoComision, propuesta.pctHucha, propuesta.pctIrpf],
      [225, null, "anticipada", 10, 19],
    );
    assert.equal(propuesta.nivel, "Financial Consultant");
    assert.equal(propuesta.unidadesAntes, 1153.6);
    assert.deepEqual(propuesta.importes, calcularImportes(225, 2.5, 10, 19));
    assert.equal(propuesta.fechasProvisionales, true);
    assert.deepEqual(codigos(propuesta.avisos), ["transferencia_sin_confirmar"]);
    // Sin unidades ni forma de proponerlas: null y los importes a 0
    const aMano = proponerFirma({ compania: "INTESA", producto: "TopPremium", periodicidad: "unica", pago: "domiciliacion", fecha: "2026-11-02" }, ctx);
    assert.deepEqual([aMano.unidades, aMano.importes.bruto, aMano.tipoComision], [null, 0, "unica"]);
  });

  test("un contexto sin cuadro (un script viejo) no rompe: todo sale fuera del cuadro", () => {
    const sinCuadro = { ...contexto(), cuadro: undefined };
    const propuesta = proponerFirma({ compania: "AXA", producto: "PIAS Global+", pago: "domiciliacion", fecha: "2026-10-20", unidades: 81.6 }, sinCuadro);
    assert.equal(propuesta.versionCuadro, "");
    assert.ok(codigos(propuesta.avisos).includes("producto_fuera_del_cuadro"));
    assert.equal(propuesta.pctHucha, 10);
  });
});

describe("fechas sueltas", () => {
  test("16. último día del mes, también en bisiesto y en diciembre", () => {
    assert.equal(ultimoDiaDelMes("2028-02-10"), "2028-02-29");
    assert.equal(ultimoDiaDelMes("2026-12-15"), "2026-12-31");
    assert.equal(ultimoDiaDelMes("2026-02-01"), "2026-02-28");
    assert.equal(ultimoDiaDelMes("2100-02-01"), "2100-02-28");
    assert.equal(primerDiaDelMes("2026-10-26"), "2026-10-01");
  });

  test("plazo de incidencia: el del cierre del mes anterior al efecto", () => {
    assert.equal(plazoDeIncidencia("AXA", "2026-11-10", CIERRES, []), "2026-11-03");
    assert.equal(plazoDeIncidencia("INTESA", "2026-12-01", CIERRES, []), "2026-11-19");
    assert.equal(plazoDeIncidencia("AVANZA", "2027-04-01", CIERRES, []), null);
  });

  test("plazo de incidencia por domiciliación: el del mes de la confirmación, anterior al efecto", () => {
    const intesa = fechas({ compania: "INTESA", fecha: "2026-11-10" }); // efecto 2026-12-01
    assert.equal(plazoDeIncidencia("INTESA", intesa.fechaEfecto, CIERRES, [], "domiciliacion"), "2026-11-19");
    const avanza = fechas({ compania: "AVANZA", fecha: "2026-10-15" }); // efecto 2026-11-01
    assert.equal(plazoDeIncidencia("AVANZA", avanza.fechaEfecto, CIERRES, [], "domiciliacion"), "2026-10-29");
    assert.equal(plazoDeIncidencia("AVANZA", avanza.fechaEfecto, CIERRES, []), "2026-10-29");
  });

  test("plazo de incidencia por transferencia en INTESA y AVANZA: el del mismo mes, no el anterior", () => {
    const intesa = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-02" }); // efecto 2026-11-01
    assert.equal(plazoDeIncidencia("INTESA", intesa.fechaEfecto, CIERRES, [], "transferencia"), "2026-11-19");
    const avanza = fechas({ compania: "AVANZA", pago: "transferencia", fecha: "2026-10-15" }); // efecto 2026-10-01
    assert.equal(plazoDeIncidencia("AVANZA", avanza.fechaEfecto, CIERRES, [], "transferencia"), "2026-10-29");
    const tarde = fechas({ compania: "INTESA", pago: "transferencia", fecha: "2026-11-18" }); // efecto 2026-12-01
    assert.equal(plazoDeIncidencia("INTESA", tarde.fechaEfecto, CIERRES, [], "transferencia"), null);
  });

  test("plazo de incidencia en AXA: la transferencia no cambia nada; sin calendario, no hay", () => {
    assert.equal(plazoDeIncidencia("AXA", "2026-11-10", CIERRES, [], "transferencia"), "2026-11-03");
    assert.equal(plazoDeIncidencia("AXA", "2026-11-10", CIERRES, COMPANIAS_DE_SERIE, "domiciliacion"), "2026-11-03");
    assert.equal(plazoDeIncidencia("ALL", "2026-04-01", CIERRES, []), null);
  });

  test("18. próximos cierres el 2026-10-24: AXA PIAS el 26, el ranking el 31 y luego noviembre", () => {
    const proximos = proximosCierres(CIERRES, "2026-10-24");
    assert.deepEqual(
      proximos.map((c) => [c.calendario, c.confirmarHasta]),
      [
        ["AXA_PIAS", "2026-10-26"],
        ["RANKING", "2026-10-31"],
        ["INTESA", "2026-11-17"],
        ["AVANZA", "2026-11-20"],
      ],
    );
    assert.equal(proximosCierres(CIERRES, "2026-10-24", 10).length, 6);
    assert.equal(proximosCierres(CIERRES, "2026-10-26", 1)[0].confirmarHasta, "2026-10-26");
    assert.equal(CIERRES[0].calendario, "INTESA");
  });

  test("hoy en Madrid, no en UTC", () => {
    assert.match(hoyEnMadrid(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(hoyEnMadrid(new Date("2026-10-24T22:30:00Z")), "2026-10-25"); // verano, UTC+2
    assert.equal(hoyEnMadrid(new Date("2026-10-25T22:30:00Z")), "2026-10-25"); // ya en invierno, UTC+1
    assert.equal(hoyEnMadrid(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  });
});

describe("extorno y hucha", () => {
  const herramienta = (compania, producto, periodicidad, bruto, fechaEfecto = "2026-11-10", cobrada = true) => ({
    compania,
    producto,
    periodicidad,
    fechaEfecto,
    bruto,
    cobrada,
  });

  test("17. finDelExtorno con 48 y 60 meses; fuera del cuadro, el de siempre (100 % los 48 meses)", () => {
    assert.equal(finDelExtorno("2026-11-10"), "2030-11-10");
    assert.equal(finDelExtorno("2026-11-10", 60), "2031-11-10");
    assert.equal(finDelExtorno("2028-02-29", 48), "2032-02-29");
    assert.equal(finDelExtorno("2028-02-29", 12), "2029-02-28");
    const fuera = herramienta("AXA", "Otro producto", "mensual", 81.6);
    const aLosDos = extornoPropuesto(fuera, "2028-11-10", CUADRO);
    assert.deepEqual([aLosDos.importe, aLosDos.pct, aLosDos.mes, codigos(aLosDos.avisos)], [81.6, 100, 25, ["producto_fuera_del_cuadro"]]);
    assert.equal(extornoPropuesto({ ...fuera, cobrada: false }, "2028-11-10", CUADRO).importe, 0); // sin cobrar
    assert.equal(extornoPropuesto(fuera, "2031-11-10", CUADRO).importe, 0); // a los 5 años
  });

  test("39. extorno del PIAS (204,00 €, efecto 2026-11-10) por mes de cancelación", () => {
    const pias = herramienta("AXA", "PIAS Global+", "mensual", 204);
    const en = (anuladaEl) => {
      const e = extornoPropuesto(pias, anuladaEl, CUADRO);
      return [e.mes, e.pct, e.importe];
    };
    // Meses cumplidos al día: el mes 1 va del 10/11/2026 al 9/12/2026
    assert.deepEqual(
      [en("2026-11-25"), en("2027-03-15"), en("2027-06-15"), en("2030-07-15"), en("2030-08-31"), en("2030-11-10")],
      [
        [1, 100, 204],
        [5, 95, 193.8],
        [8, 86, 175.44], // el ejemplo de OVB
        [45, 12, 24.48],
        [46, 10, 20.4],
        [49, 0, 0],
      ],
    );
    assert.deepEqual(extornoPropuesto(pias, "2027-06-15", CUADRO).avisos, []);
    // El cambio de mes es el mismo día del mes: el 9 aún es el mes anterior
    assert.deepEqual(en("2026-12-09"), [1, 100, 204]);
    assert.deepEqual(en("2026-12-10"), [2, 100, 204]);
    assert.deepEqual(en("2027-03-09"), [4, 100, 204]);
    assert.equal(extornoPropuesto({ ...pias, cobrada: false }, "2027-06-15", CUADRO).importe, 0);
  });

  test("extornoPropuesto y finDelExtorno dicen lo mismo: el 2030-11-09 aún es el mes 48; el 2030-11-10, ya no hay extorno", () => {
    const pias = herramienta("AXA", "PIAS Global+", "mensual", 204);
    assert.equal(finDelExtorno(pias.fechaEfecto, 48), "2030-11-10");
    const ultimoDia = extornoPropuesto(pias, "2030-11-09", CUADRO);
    assert.deepEqual([ultimoDia.mes, ultimoDia.pct, ultimoDia.importe], [48, 10, 20.4]);
    const cumplido = extornoPropuesto(pias, "2030-11-10", CUADRO);
    assert.deepEqual([cumplido.mes, cumplido.pct, cumplido.importe], [49, 0, 0]);
    // Lo mismo fuera del cuadro (100 % los 48 meses) y con un efecto a final de mes
    const fuera = herramienta("AXA", "Otro producto", "mensual", 81.6, "2026-01-31");
    assert.equal(finDelExtorno(fuera.fechaEfecto), "2030-01-31");
    assert.equal(extornoPropuesto(fuera, "2030-01-30", CUADRO).importe, 81.6);
    assert.equal(extornoPropuesto(fuera, "2030-01-31", CUADRO).importe, 0);
    assert.equal(extornoPropuesto(fuera, "2026-02-27", CUADRO).mes, 1);
    assert.equal(extornoPropuesto(fuera, "2026-02-28", CUADRO).mes, 2); // febrero no tiene 31
  });

  test("40. extorno lineal de INTESA, sin extorno en su extraordinaria, y Allianz por años", () => {
    const topPlan = herramienta("INTESA", "TopPlan", "mensual", 562.5, "2026-11-01");
    const uno = extornoPropuesto(topPlan, "2026-11-20", CUADRO);
    assert.deepEqual([uno.mes, uno.pct, uno.importe], [1, 100, 562.5]);
    assert.ok(codigos(uno.avisos).includes("dato_provisional"));
    const treintaYUno = extornoPropuesto(topPlan, "2029-05-10", CUADRO); // (60 − 31 + 1) / 60
    assert.deepEqual([treintaYUno.mes, treintaYUno.pct, treintaYUno.importe], [31, 50, 281.25]);
    const top10 = extornoPropuesto(herramienta("INTESA", "Top10", "mensual", 225, "2026-11-01"), "2028-11-15", CUADRO); // (48 − 25 + 1) / 48
    assert.deepEqual([top10.mes, top10.pct, top10.importe], [25, 50, 112.5]);
    assert.equal(extornoPropuesto(herramienta("INTESA", "TopPlan", "unica", 37.5, "2026-11-01"), "2026-12-15", CUADRO).importe, 0);
    const vrn = herramienta("ALL", "Vida Riesgo Nivelado", "mensual", 228, "2026-04-01");
    assert.deepEqual(
      [extornoPropuesto(vrn, "2027-04-15", CUADRO).pct, extornoPropuesto(vrn, "2028-04-15", CUADRO).pct, extornoPropuesto(vrn, "2029-04-15", CUADRO).pct],
      [75, 50, 0],
    );
    assert.equal(extornoPropuesto(vrn, "2027-04-15", CUADRO).importe, 171);
  });

  test("un producto del cuadro que no dice el extorno: el de siempre, avisando", () => {
    const rc = extornoPropuesto(herramienta("PLU", "RC Integral", "mensual", 3.04, "2026-07-01"), "2026-09-15", CUADRO);
    assert.deepEqual([rc.pct, rc.importe, codigos(rc.avisos)], [100, 3.04, ["dato_provisional"]]);
  });

  test("19. cubierto entero por la hucha: 81,60 con 200,00 de saldo", () => {
    assert.deepEqual(proponerExtorno(81.6, "2027-01-10", [{ fecha: "2026-10-01", importe: 200 }]), {
      importe: 81.6,
      deHucha: 81.6,
      resto: 0,
      restoCobro: null,
      saldoAntes: 200,
      saldoDespues: 118.4,
      irpfHucha: 0,
      irpfResto: 0,
      cargoDelResto: null,
      avisos: [],
    });
  });

  test("20. cubierto en parte: 408,00 con 100,00 de saldo el 2027-03-15", () => {
    const movimientos = [
      { fecha: "2026-10-01", importe: 50 },
      { fecha: "2026-11-30", importe: 50 },
      { fecha: "2027-03-31", importe: 500 }, // después del extorno: no cuenta
    ];
    const propuesta = proponerExtorno(408, "2027-03-15", movimientos);
    assert.deepEqual(
      [propuesta.deHucha, propuesta.resto, propuesta.restoCobro, propuesta.cargoDelResto, propuesta.saldoAntes, propuesta.saldoDespues],
      [100, 308, "2027-03-31", -308, 100, 0],
    );
    assert.deepEqual(codigos(propuesta.avisos), ["hucha_no_cubre"]);
    assert.match(propuesta.avisos[0].texto, /308,00/);
    assert.match(propuesta.avisos[0].texto, /marzo de 2027/);
  });

  test("21. sin hucha: 163,20 con saldo 0 y con saldo −20,00", () => {
    const sinSaldo = proponerExtorno(163.2, "2027-01-15", []);
    assert.deepEqual([sinSaldo.deHucha, sinSaldo.resto, sinSaldo.saldoDespues, sinSaldo.restoCobro, sinSaldo.cargoDelResto], [0, 163.2, 0, "2027-01-31", -163.2]);
    assert.deepEqual(codigos(sinSaldo.avisos), ["hucha_no_cubre"]);
    const enNegativo = proponerExtorno(163.2, "2027-01-15", [
      { fecha: "2026-10-01", importe: 30 },
      { fecha: "2026-12-01", importe: -50 },
    ]);
    assert.deepEqual([enNegativo.deHucha, enNegativo.resto, enNegativo.saldoAntes, enNegativo.saldoDespues], [0, 163.2, -20, -20]);
    assert.deepEqual(codigos(enNegativo.avisos), ["hucha_en_negativo", "hucha_no_cubre"]);
  });

  test("22. el saldo de la hucha, entero y hasta un día", () => {
    const movimientos = [
      { fecha: "2026-10-01", importe: 50 },
      { fecha: "2026-11-30", importe: 125.28 },
      { fecha: "2027-01-10", importe: -81.6 },
      { fecha: "2027-02-01", importe: -40 },
    ];
    assert.equal(saldoDeHucha(movimientos), 53.68);
    assert.equal(saldoDeHucha(movimientos, "2027-01-31"), 93.68);
    assert.equal(saldoDeHucha(movimientos, "2026-12-31"), 175.28);
    assert.equal(saldoDeHucha(movimientos, "2026-11-30"), 175.28);
    assert.equal(saldoDeHucha(movimientos, "2026-11-29"), 50);
    assert.equal(saldoDeHucha([]), 0);
  });

  test("24. el cargo del resto si el IRPF se regulariza, y el IRPF de una reclamación", () => {
    assert.equal(cargoDelResto(308, 46.2), -261.8);
    assert.equal(cargoDelResto(308, 0), -308);
    assert.equal(cargoDelResto(0, 0), 0); // sin −0
    assert.equal(irpfDeReclamacion(40, 15), 6);
    assert.equal(irpfDeReclamacion(-40, 15), 6);
    assert.equal(irpfDeReclamacion(33.33, 15), 5);
  });
});
