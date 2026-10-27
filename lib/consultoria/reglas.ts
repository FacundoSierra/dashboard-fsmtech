/**
 * Las reglas de cobro de la consultoría (REQ-001, ADR-002): de cada firma, el mes de producción,
 * el efecto, el cobro estimado, las unidades, el €/unidad del nivel, la reserva de cancelación (la
 * hucha) y los importes; de cada liquidación, el IRPF sobre el total y el importe, y la cuenta de
 * comisiones con su saldo (ADR-005); de la hucha, el saldo y el reparto de un extorno (ADR-004); y
 * del cuadro de comisiones de OVB (ADR-006), lo que dice de cada producto. Lo de las firmas y los
 * extornos son **propuestas**: quien llama las enseña y se pueden cambiar a mano antes de guardar.
 * La especificación es `docs/specs/req-001-consultoria.md`, sección 3.
 *
 * Lo usan igual la pantalla (en el navegador, al teclear), las acciones del servidor y los scripts
 * (`import … from "../src/lib/consultoria/reglas.ts"`, sin compilar). Por eso:
 * - **No importa nada en tiempo de ejecución**: ni `@/…` (Node no entiende los `paths` del
 *   `tsconfig`) ni otros archivos del repo. Repite sus funciones de fechas en vez de usar
 *   `src/lib/calendario.ts`, y **el cuadro le llega por el contexto** (`ContextoReglas.cuadro`,
 *   que es `CUADRO_VIGENTE` de `cuadro.ts`).
 * - **Solo sintaxis que se puede borrar** (`erasableSyntaxOnly`): nada de `enum`, `namespace` con
 *   código ni propiedades en el constructor, que Node no sabe quitar.
 * - **No lee la base de datos ni la hora**: recibe los datos y el día. Solo `hoyEnMadrid()` mira
 *   el reloj, y es para dárselo a las demás.
 *
 * Convenciones:
 * - Euros como `number` con dos decimales (lo que da PostgREST de un `numeric(12,2)`); unidades
 *   con dos decimales; porcentajes como 10 o 15 (no 0,10). **Un porcentaje 0 es un valor**: los
 *   valores por defecto se encadenan con `??`, nunca con `||`.
 * - **Los importes se calculan en enteros** (centésimas de unidad, céntimos y centésimas de punto)
 *   para dar lo mismo que Postgres: `30,10 × 0,15` en coma flotante da `4,5149999…` y redondearía a
 *   4,51, cuando `round` de Postgres (y OVB) dan 4,52.
 * - Fechas `AAAA-MM-DD` y meses como su día 1 (`2026-11-01`), siempre en UTC.
 * - **Las compañías son datos** (`consultoria_companias`; con la lista vacía, las de serie) y **los
 *   productos salen del cuadro**. Un código o un producto que no están no son un error: se tratan
 *   como «sin calendario» o «fuera del cuadro» y se avisa.
 * - `RangeError` solo para errores de programación: una fecha que no es `AAAA-MM-DD` válida o un
 *   número que no es finito. Quien llama valida antes lo que escribe el usuario.
 */

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

/** El código de OVB: "AXA", "INTESA", "AVANZA", "ALL", "PLU"… Sin lista fija */
export type Compania = string;
export type ReglaCompania = "axa_pias" | "por_pago" | "sin_calendario";
export type Calendario = "INTESA" | "AVANZA" | "AXA_PIAS" | "RANKING";
export type Pago = "domiciliacion" | "transferencia";
export type Periodicidad = "mensual" | "unica";
export type EstadoHerramienta = "prevista" | "firmada" | "confirmada" | "incidencia" | "cobrada" | "anulada";

/** Cómo se cobra: de una vez (anticipada, anualizada, única) o poco a poco (sobre recibo, sobre saldo) */
export type TipoComision = "anticipada" | "anualizada" | "sobre_recibo" | "unica" | "sobre_saldo";

/** El cuadro de comisiones de OVB de una versión (spec 3.6). El vigente es `CUADRO_VIGENTE` de `cuadro.ts` */
export interface Cuadro {
  version: string; // "3TM/2026"
  minimoTransferencia: number; // 50: por debajo, no hay transferencia
  reserva: { pct: number; propio: number; tramos: { masDeUnidades: number; pct: number }[] };
  niveles: Nivel[]; // los siete
  productos: ProductoDelCuadro[];
}

export interface ProductoDelCuadro {
  compania: string; // el código: "AXA"
  nombres: string[]; // como los escribe Facundo: ["PIAS Global+", "PFDina"]
  periodicidad: Periodicidad; // "mensual" (periódica) o "unica" (extraordinaria, traspaso, prima única)
  tipo: TipoComision;
  reserva: boolean; // la columna «RC» del cuadro
  unidades: ReglaDeUnidades | null; // null = las dice Facundo
  cobro?: { meses: number } | { dia15: true }; // si no viene, el de su compañía
  efecto?: "fecha"; // el efecto es el día de la aportación
  extorno: ReglaDeExtorno | null; // null = el cuadro no lo dice
  provisional?: string; // por qué no es seguro, para enseñarlo
}

export interface ReglaDeUnidades {
  base: "prima_anual" | "primas_programadas" | "importe"; // aportación × 12 · aportación × 12 × años · la aportación
  porCada: number; // 100 o 1.000 €
  factor?: number;
  porDuracion?: { desde?: number; hasta?: number; factor: number }[]; // en años
  aniosFijos?: number; // TOP 10: 10
  aniosMaximos?: number; // TOP PLAN y TOP PIAS: 30
}

export interface ReglaDeExtorno {
  meses: number; // responsabilidad: 48, 60, 36; 0 = sin extorno
  tramos?: { desde: number; hasta: number; pct: number; bajaPorMes?: number }[]; // por mes de cancelación
  lineal?: true; // (meses − m + 1) / meses
}

/** Una fila de `consultoria_companias` */
export interface DatosCompania {
  codigo: string;
  nombre: string;
  regla: ReglaCompania;
  calendario: Exclude<Calendario, "RANKING"> | null;
  /** Reserva por defecto de sus productos con RC; null = la de Ajustes */
  pctHucha: number | null;
  /** Meses del mes del efecto al del cobro (0 = el mismo) si el producto no dice nada; null = el de su regla */
  mesesHastaCobro: number | null;
}

/** Una fila de `consultoria_cierres`. Los plazos acaban a las 23:59 de ese día */
export interface Cierre {
  mes: string;
  calendario: Calendario;
  confirmarHasta: string;
  incidenciasHasta: string | null;
}

/** Un nivel del plan de carrera: se alcanza por unidades (`desdeUnidades`) o a mano desde un mes (`desdeMes`) */
export interface Nivel {
  nombre: string;
  valorUnidad: number;
  desdeUnidades: number | null;
  desdeMes: string | null;
}

export interface Ajustes {
  unidadesPrevias: number;
  pctHucha: number;
  pctIrpf: number;
}

/** Lo mínimo de cada herramienta guardada para contar unidades. Para el nivel cuenta `unidadesNivel ?? unidades` */
export interface UnidadesDe {
  mesProduccion: string;
  unidades: number;
  unidadesNivel: number | null;
  estado: EstadoHerramienta;
}

export interface ContextoReglas {
  cuadro: Cuadro;
  companias: DatosCompania[];
  cierres: Cierre[];
  niveles: Nivel[];
  ajustes: Ajustes;
  herramientas: UnidadesDe[];
}

/** Una fila de consultoria_hucha_movimientos: importe con signo */
export interface MovimientoHucha {
  fecha: string;
  importe: number;
}

export interface EntradaFirma {
  compania: Compania;
  producto?: string;
  /** Sin decir, mensual */
  periodicidad?: Periodicidad;
  pago: Pago;
  /** El día de confirmar la solicitud o, por transferencia, el de la transferencia */
  fecha: string;
  /** Si no vienen, se proponen con el cuadro (unidadesPropuestas) */
  unidades?: number;
  unidadesNivel?: number;
  aportacion?: number;
  duracionAnios?: number;
  /** Contrato propio: Facundo es el tomador (reserva del 100 %) */
  propio?: boolean;
  /** Obligatorio en la práctica para «sin calendario»; en las demás, fuerza el efecto */
  fechaEfecto?: string;
}

export type CodigoAviso =
  | "pasado_el_cierre" // confirmada después del cierre: un mes más tarde
  | "faltan_cierres" // no hay cierres de ese mes: se ha supuesto que entra a tiempo
  | "dia_de_efecto_sin_confirmar" // INTESA y AVANZA por domiciliación
  | "transferencia_sin_confirmar" // hasta qué día vale una transferencia
  | "compania_sin_reglas" // código que no está en las compañías: se trata como sin calendario
  | "efecto_a_mano" // sin calendario y sin efecto dado: se propone el día 1 del mes siguiente
  | "cobro_sin_confirmar" // sin calendario: los meses del efecto al cobro son provisionales
  | "nivel_con_previstas" // el €/unidad sale distinto sin contar lo previsto
  | "sin_niveles"
  | "hucha_no_cubre" // el extorno pasa del saldo: el resto es un cargo en la cuenta
  | "hucha_en_negativo" // el saldo de ese día ya es negativo
  | "producto_fuera_del_cuadro" // unidades a mano, reserva y cobro de la compañía, extorno de siempre
  | "falta_duracion" // el producto necesita la duración para proponer las unidades
  | "duracion_maxima" // la duración pasa de lo que cuenta el cuadro: se proponen las del máximo
  | "reserva_por_tramo" // contrato propio o grande: la reserva sube
  | "dato_provisional"; // algo del cuadro (o de cómo se aplica) sin confirmar

export interface Aviso {
  codigo: CodigoAviso;
  texto: string;
}

/** Los importes de una herramienta. `irpf` y `neto` son orientativos: el IRPF de verdad va sobre el total de la liquidación */
export interface Importes {
  bruto: number;
  hucha: number;
  irpf: number;
  neto: number;
}

export interface Propuesta {
  mesProduccion: string;
  fechaEfecto: string;
  fechaCobro: string;
  nivel: string;
  valorUnidad: number;
  unidadesAntes: number;
  pctHucha: number;
  pctIrpf: number;
  importes: Importes;
  tipoComision: TipoComision;
  /** null = a mano: ni las dio quien llama ni el cuadro sabe proponerlas */
  unidades: number | null;
  /** Las que cuentan para el nivel si no son las mismas (sobre recibo y sobre saldo); null = las mismas o a mano */
  unidadesNivel: number | null;
  versionCuadro: string;
  fechasProvisionales: boolean;
  avisos: Aviso[];
}

/** Una liquidación como el documento de OVB */
export interface Liquidacion {
  /** «Comisión»: la suma de los brutos */
  comision: number;
  /** «RC»: la reserva de cancelación (la hucha), redondeada en cada fila */
  rc: number;
  /** «Comisión neta»: comisión − RC */
  comisionNeta: number;
  /** Sobre el total de la comisión neta, uno por cada % de IRPF */
  irpf: number;
  /** Cargos y abonos de la cuenta aplicados (con signo); no pagan IRPF */
  cargos: number;
  /** comisionNeta − irpf + cargos */
  importe: number;
}

/** Una liquidación en la cuenta de comisiones, con el saldo que arrastra */
export interface PasoDeLaCuenta {
  mes: string;
  importe: number;
  saldoAnterior: number;
  /** Lo que se transfiere: saldoAnterior + importe si llega al mínimo; si no, 0 */
  aPagar: number;
  /** Lo que pasa a la siguiente: 0 si se pagó; si no, el total (negativo o por debajo del mínimo) */
  saldoDespues: number;
}

/** Una comisión para `mesesDeLiquidacion`: una fila de la vista `consultoria_lineas` */
export interface LineaDelMes {
  /** El día 1 del mes de su cobro */
  mes: string;
  /** Ya está en la liquidación de su mes */
  cobrada: boolean;
  bruto: number;
  hucha: number;
  pctIrpf: number;
}

/** Un cargo o abono de la cuenta de comisiones para `mesesDeLiquidacion`, con signo */
export interface CargoDelMes {
  importe: number;
  /**
   * El mes de la liquidación en que se aplicó; si no se ha aplicado, el previsto (el resto de un
   * extorno) o null (un cargo de `consultoria_cuenta`, que entra en la siguiente liquidación que llegue)
   */
  mes: string | null;
  aplicado: boolean;
}

/** Un mes de la cuenta de comisiones, como lo liquida OVB */
export interface MesDeLaCuenta {
  mes: string;
  /** Ha llegado su liquidación */
  llegada: boolean;
  /** Lo que entró, si ha llegado; si no, lo que se espera. Con el IRPF sobre el total */
  liquidacion: Liquidacion;
  /** En un mes que ha llegado, lo que quedó en él sin cobrar (no entra en la cuenta); si no, null */
  pendiente: Liquidacion | null;
  paso: PasoDeLaCuenta;
}

export interface PropuestaExtorno {
  importe: number;
  deHucha: number;
  resto: number;
  /** Último día del mes de la liquidación en que se espera aplicar el resto; null si la hucha lo cubre entero */
  restoCobro: string | null;
  saldoAntes: number;
  saldoDespues: number;
  irpfHucha: number; // supuesto: 0
  irpfResto: number; // supuesto: 0
  /** El cargo en la cuenta de comisiones (−resto + irpfResto); null si la hucha lo cubre entero */
  cargoDelResto: number | null;
  avisos: Aviso[];
}

// ---------------------------------------------------------------------------------------------
// Valores de serie (los niveles de serie están en cuadro.ts: NIVELES_DE_SERIE)
// ---------------------------------------------------------------------------------------------

/** Si el consultor no tiene fila en `consultoria_ajustes`: 0 unidades previas, 10 % de hucha y 15 % de IRPF */
export const AJUSTES_DE_SERIE: Ajustes = { unidadesPrevias: 0, pctHucha: 10, pctIrpf: 15 };

/** Las cinco compañías que siembra la migración 0013 (spec 2.1). Los seguros, con el cobro provisional */
export const COMPANIAS_DE_SERIE: DatosCompania[] = [
  { codigo: "AXA", nombre: "AXA", regla: "axa_pias", calendario: "AXA_PIAS", pctHucha: null, mesesHastaCobro: 0 },
  { codigo: "INTESA", nombre: "INTESA", regla: "por_pago", calendario: "INTESA", pctHucha: null, mesesHastaCobro: 0 },
  { codigo: "AVANZA", nombre: "AVANZA", regla: "por_pago", calendario: "AVANZA", pctHucha: null, mesesHastaCobro: 0 },
  { codigo: "ALL", nombre: "Allianz", regla: "sin_calendario", calendario: null, pctHucha: null, mesesHastaCobro: 1 },
  { codigo: "PLU", nombre: "Plus Ultra", regla: "sin_calendario", calendario: null, pctHucha: null, mesesHastaCobro: 1 },
];

/** Los meses del efecto al cobro de cada regla cuando ni el producto ni la compañía dicen nada */
const MESES_HASTA_COBRO_DE_LA_REGLA: Record<ReglaCompania, number> = { axa_pias: 0, por_pago: 0, sin_calendario: 1 };

/** El extorno de un producto que no está en el cuadro (o que el cuadro no dice): el 100 % durante 48 meses */
const EXTORNO_DE_SIEMPRE: ReglaDeExtorno = { meses: 48, tramos: [{ desde: 1, hasta: 48, pct: 100 }] };

/** Por si un contexto llega sin cuadro (un script viejo): todo sale «fuera del cuadro», con aviso */
const CUADRO_VACIO: Cuadro = {
  version: "",
  minimoTransferencia: 50,
  reserva: { pct: 10, propio: 100, tramos: [] },
  niveles: [],
  productos: [],
};

const NOMBRE_DEL_CALENDARIO: Record<Calendario, string> = {
  INTESA: "INTESA",
  AVANZA: "AVANZA",
  AXA_PIAS: "AXA PIAS",
  RANKING: "ranking",
};

/** El orden en que cierran dentro de un mes, para desempatar */
const ORDEN_DEL_CALENDARIO: Record<Calendario, number> = { INTESA: 0, AVANZA: 1, AXA_PIAS: 2, RANKING: 3 };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// ---------------------------------------------------------------------------------------------
// Fechas, sobre cadenas AAAA-MM-DD en UTC (como src/lib/calendario.ts, que aquí no se puede importar)
// ---------------------------------------------------------------------------------------------

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function partes(fecha: string): [number, number, number] {
  const encontrado = typeof fecha === "string" ? FORMATO_FECHA.exec(fecha) : null;
  if (encontrado) {
    const anio = Number(encontrado[1]);
    const mes = Number(encontrado[2]);
    const dia = Number(encontrado[3]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes)) return [anio, mes, dia];
  }
  throw new RangeError(`Fecha no válida: «${String(fecha)}». Se espera AAAA-MM-DD.`);
}

function aIso(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** El día 1 del mes de esa fecha: `2026-10-26` → `2026-10-01` */
export function primerDiaDelMes(fecha: string): string {
  const [anio, mes] = partes(fecha);
  return aIso(anio, mes, 1);
}

/** El último día del mes de esa fecha: `2028-02-10` → `2028-02-29` */
export function ultimoDiaDelMes(fecha: string): string {
  const [anio, mes] = partes(fecha);
  return aIso(anio, mes, diasDelMes(anio, mes));
}

/** El día 1 del mes que queda `meses` después (o antes, en negativo) del de esa fecha */
function mesMas(fecha: string, meses: number): string {
  const [anio, mes] = partes(fecha);
  const total = anio * 12 + (mes - 1) + meses;
  return aIso(Math.floor(total / 12), (total % 12) + 1, 1);
}

/** Meses de calendario del mes de `desde` al de `hasta`: de noviembre a junio, 7 */
function mesesEntre(desde: string, hasta: string): number {
  const [anioDesde, mesDesde] = partes(desde);
  const [anioHasta, mesHasta] = partes(hasta);
  return anioHasta * 12 + mesHasta - (anioDesde * 12 + mesDesde);
}

/** Ese día del mes de `mes`, o el último si el mes es más corto */
function diaDelMes(mes: string, dia: number): string {
  const [anio, numero] = partes(mes);
  return aIso(anio, numero, Math.min(dia, diasDelMes(anio, numero)));
}

/** El mismo día `meses` meses después; si ese mes es más corto, su último día: 2026-01-31 + 1 → 2026-02-28 */
function masMesesAlDia(fecha: string, meses: number): string {
  const [, , dia] = partes(fecha);
  return diaDelMes(mesMas(fecha, meses), dia);
}

/**
 * Meses cumplidos de `desde` a `hasta`, al día, con la misma cuenta que `finDelExtorno`: del
 * 2026-11-10 al 2026-12-09, 0; al 2026-12-10, 1. Negativo si `hasta` es anterior.
 */
function mesesCumplidos(desde: string, hasta: string): number {
  const meses = mesesEntre(desde, hasta);
  return masMesesAlDia(desde, meses) > hasta ? meses - 1 : meses;
}

/**
 * El día en que se cumplen los `meses` de responsabilidad desde el efecto (48 de siempre; 60 en
 * TOP PLAN, 36 en Allianz…). Si ese mes es más corto, su último día. Ese día ya no hay extorno.
 */
export function finDelExtorno(fechaEfecto: string, meses = 48): string {
  return masMesesAlDia(fechaEfecto, comoMeses(meses));
}

/**
 * Hoy en España, `AAAA-MM-DD`: los cierres acaban a las 23:59 de Madrid, y a las 00:30 en UTC aún
 * es ayer. `ahora` solo sirve para probarla.
 */
export function hoyEnMadrid(ahora: Date = new Date()): string {
  const piezas = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const pieza = (tipo: string) => piezas.find((p) => p.type === tipo)?.value ?? "";
  return `${pieza("year")}-${pieza("month")}-${pieza("day")}`;
}

function nombreDelMes(fecha: string): string {
  const [anio, mes] = partes(fecha);
  return `${MESES[mes - 1]} de ${anio}`;
}

function diaDe(fecha: string): number {
  return partes(fecha)[2];
}

// ---------------------------------------------------------------------------------------------
// Enteros: céntimos, centésimas de unidad y centésimas de punto
// ---------------------------------------------------------------------------------------------

/** Un número con (como mucho) dos decimales, en centésimas exactas: 30.1 → 3010 */
function aCentesimas(numero: number): number {
  if (typeof numero !== "number" || !Number.isFinite(numero)) {
    throw new RangeError(`Número no válido: «${String(numero)}».`);
  }
  return Math.round(numero * 100);
}

/** De centésimas a euros (o unidades), sin devolver nunca −0 */
function deCentesimas(centesimas: number): number {
  return centesimas === 0 ? 0 : centesimas / 100;
}

/**
 * `n / d` redondeado a entero con la mitad alejándose de cero, como `round(numeric)` de Postgres:
 * `redondear(n, d) = Math.floor((n + d / 2) / d)` para `n >= 0`, y simétrico en negativos.
 * La cuenta es exacta mientras `n` quepa en un entero seguro (hasta 9·10¹⁵).
 */
function redondear(n: number, d: number): number {
  if (n < 0) return -redondear(-n, d);
  return Math.floor((n + d / 2) / d);
}

/** El `pct` (en centésimas de punto) de un importe en céntimos, redondeado a céntimos */
function porcentajeDe(centimos: number, pctCentesimas: number): number {
  return redondear(centimos * pctCentesimas, 10_000);
}

function importesEnCentimos(importes: Importes): Importes {
  return {
    bruto: aCentesimas(importes.bruto),
    hucha: aCentesimas(importes.hucha),
    irpf: aCentesimas(importes.irpf),
    neto: aCentesimas(importes.neto),
  };
}

function importesEnEuros(centimos: Importes): Importes {
  return {
    bruto: deCentesimas(centimos.bruto),
    hucha: deCentesimas(centimos.hucha),
    irpf: deCentesimas(centimos.irpf),
    neto: deCentesimas(centimos.neto),
  };
}

/** Meses enteros de 0 en adelante; otra cosa es un dato roto */
function comoMeses(meses: number): number {
  if (typeof meses !== "number" || !Number.isInteger(meses) || meses < 0) {
    throw new RangeError(`Número de meses no válido: «${String(meses)}».`);
  }
  return meses;
}

const FORMATO_EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  // Sin esto, el español deja "2874,61 €" en las cifras de cuatro dígitos (como src/lib/formato.ts)
  useGrouping: "always",
});

/** Para el texto de los avisos: 30800 → "308,00 €", −2000 → "−20,00 €" */
function eurosEnTexto(centimos: number): string {
  const texto = FORMATO_EUROS.format(Math.abs(centimos) / 100);
  return centimos < 0 ? `−${texto}` : texto;
}

const FORMATO_NUMERO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, useGrouping: "always" });

/** Para el texto de los avisos: 115360 → "1.153,6", 4000 → "40" */
function numeroEnTexto(centesimas: number): string {
  return FORMATO_NUMERO.format(centesimas / 100);
}

function unidadesEnTexto(centesimas: number): string {
  return `${numeroEnTexto(centesimas)} u`;
}

// ---------------------------------------------------------------------------------------------
// Compañías y productos del cuadro
// ---------------------------------------------------------------------------------------------

/** Los códigos de compañía se comparan sin espacios de más ni minúsculas */
function claveDeCodigo(codigo: Compania): string {
  return String(codigo ?? "").trim().toUpperCase();
}

/**
 * Los productos se buscan sin mayúsculas, acentos ni espacios de más, y sin lo que vaya tras « · »:
 * «TopPlan · aportación extraordinaria» es «TopPlan», y « rc  integral » es «RC Integral».
 */
function claveDeProducto(nombre: string): string {
  return String(nombre ?? "")
    .split("·")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function companiasOSerie(companias: DatosCompania[] | undefined): DatosCompania[] {
  return companias && companias.length > 0 ? companias : COMPANIAS_DE_SERIE;
}

function buscarCompania(codigo: Compania, companias: DatosCompania[] | undefined): DatosCompania | undefined {
  const clave = claveDeCodigo(codigo);
  return companiasOSerie(companias).find((c) => claveDeCodigo(c.codigo) === clave);
}

/** Una regla que no se conoce (un dato raro) se trata como «sin calendario» */
function reglaDe(compania: DatosCompania): ReglaCompania {
  return compania.regla === "axa_pias" || compania.regla === "por_pago" ? compania.regla : "sin_calendario";
}

function cuadroDe(cuadro: Cuadro | undefined): Cuadro {
  return cuadro ?? CUADRO_VACIO;
}

/** Sobre recibo y sobre saldo no se cobran de una vez: la firma lleva 0 u y las de producción, aparte */
function cobraPocoAPoco(tipo: TipoComision): boolean {
  return tipo === "sobre_recibo" || tipo === "sobre_saldo";
}

/**
 * Los datos de una compañía. Con `companias` vacío, de las de serie. Un código que no está no es un
 * error: sale como «sin calendario», con el código de nombre y sin datos propios.
 */
export function datosDeCompania(codigo: Compania, companias: DatosCompania[]): DatosCompania {
  const encontrada = buscarCompania(codigo, companias);
  if (encontrada) return encontrada;
  const texto = String(codigo ?? "").trim();
  return { codigo: texto, nombre: texto, regla: "sin_calendario", calendario: null, pctHucha: null, mesesHastaCobro: null };
}

/** El producto en el cuadro, por compañía, nombre y periodicidad; null si no está */
export function productoDelCuadro(
  codigo: Compania,
  producto: string,
  periodicidad: Periodicidad,
  cuadro: Cuadro,
): ProductoDelCuadro | null {
  const nombre = claveDeProducto(producto);
  if (!nombre) return null;
  const compania = claveDeCodigo(codigo);
  return (
    cuadroDe(cuadro).productos.find(
      (p) =>
        claveDeCodigo(p.compania) === compania &&
        p.periodicidad === periodicidad &&
        p.nombres.some((n) => claveDeProducto(n) === nombre),
    ) ?? null
  );
}

function avisoFueraDelCuadro(codigo: Compania, producto: string, cuadro: Cuadro, queSePropone: string): Aviso {
  const version = cuadroDe(cuadro).version;
  const delCuadro = version ? `el cuadro de comisiones ${version}` : "el cuadro de comisiones";
  const nombre = String(producto ?? "").trim();
  return {
    codigo: "producto_fuera_del_cuadro",
    texto: nombre
      ? `«${nombre}» de ${String(codigo ?? "").trim()} no está en ${delCuadro}: ${queSePropone}.`
      : `Sin producto no se puede mirar ${delCuadro}: ${queSePropone}.`,
  };
}

function avisoProvisional(producto: ProductoDelCuadro, nombre: string): Aviso | null {
  return producto.provisional
    ? { codigo: "dato_provisional", texto: `«${String(nombre).trim()}»: ${producto.provisional}.` }
    : null;
}

/** La reserva y por qué: sin RC, contrato propio, por tramo de unidades o la normal */
function reservaPara(
  codigo: Compania,
  producto: string,
  periodicidad: Periodicidad,
  contexto: Pick<ContextoReglas, "cuadro" | "companias" | "ajustes">,
  h: { unidades: number; propio: boolean },
): { pct: number; motivo: "sin_rc" | "propio" | "tramo" | "normal"; masDeUnidades?: number } {
  const cuadro = cuadroDe(contexto.cuadro);
  const delCuadro = productoDelCuadro(codigo, producto, periodicidad, cuadro);
  const normal = buscarCompania(codigo, contexto.companias)?.pctHucha ?? contexto.ajustes.pctHucha;

  // Fuera del cuadro no se sabe si lleva RC ni sus tramos: la de la compañía o la de Ajustes
  if (!delCuadro) return { pct: normal, motivo: "normal" };
  if (!delCuadro.reserva) return { pct: 0, motivo: "sin_rc" };
  if (h.propio) return { pct: cuadro.reserva.propio, motivo: "propio" };

  const unidades = aCentesimas(h.unidades);
  const tramos = [...cuadro.reserva.tramos].sort((a, b) => b.masDeUnidades - a.masDeUnidades);
  // «Más de» es estricto: 600 u exactas van a la normal
  const tramo = tramos.find((t) => unidades > aCentesimas(t.masDeUnidades));
  if (tramo) return { pct: tramo.pct, motivo: "tramo", masDeUnidades: tramo.masDeUnidades };
  return { pct: normal, motivo: "normal" };
}

/**
 * La reserva de cancelación (hucha) que se propone (spec 3.6): 0 si el producto no lleva RC; si la
 * lleva, 100 % en un contrato propio, 40 % con más de 1.000 u, 30 % con más de 600 u y, si no, la de
 * la compañía o la de Ajustes. Fuera del cuadro, la de la compañía o la de Ajustes. 0 vale.
 */
export function pctHuchaPara(
  codigo: Compania,
  producto: string,
  periodicidad: Periodicidad,
  contexto: Pick<ContextoReglas, "cuadro" | "companias" | "ajustes">,
  h: { unidades: number; propio: boolean },
): number {
  return reservaPara(codigo, producto, periodicidad, contexto, h).pct;
}

/**
 * Meses del mes del efecto al del cobro: **manda el producto en el cuadro** (`{ meses }`, o `dia15`:
 * efecto el 15 o antes, el mismo mes; después, el siguiente); si no dice nada, lo de la compañía y,
 * si tampoco, lo de su regla (0, salvo «sin calendario», que es 1). 0 vale.
 */
export function mesesHastaCobroPara(
  codigo: Compania,
  producto: string,
  periodicidad: Periodicidad,
  fechaEfecto: string,
  contexto: Pick<ContextoReglas, "cuadro" | "companias">,
): number {
  const dia = diaDe(fechaEfecto);
  const cobro = productoDelCuadro(codigo, producto, periodicidad, contexto.cuadro)?.cobro;
  if (cobro) return "dia15" in cobro ? (dia <= 15 ? 0 : 1) : comoMeses(cobro.meses);
  const compania = datosDeCompania(codigo, contexto.companias);
  return comoMeses(compania.mesesHastaCobro ?? MESES_HASTA_COBRO_DE_LA_REGLA[reglaDe(compania)]);
}

/**
 * Las unidades que propone el cuadro (spec 3.6): la prima anual es aportación × 12; las primas
 * programadas, aportación × 12 × años (`aniosFijos`, o la duración hasta `aniosMaximos`); el
 * importe, la aportación. En enteros, a dos decimales. Lo que no se cobra de una vez (sobre recibo y
 * sobre saldo) lleva 0 u y las de producción en `unidadesNivel`. Sin regla, sin aportación o sin la
 * duración que hace falta, no propone (null). **Es una propuesta**: Facundo manda.
 * La duración va en años enteros: con decimales, cuentan los cumplidos.
 */
export function unidadesPropuestas(
  codigo: Compania,
  producto: string,
  periodicidad: Periodicidad,
  h: { aportacion?: number; duracionAnios?: number },
  cuadro: Cuadro,
): { unidades: number | null; unidadesNivel: number | null; avisos: Aviso[] } {
  const delCuadro = productoDelCuadro(codigo, producto, periodicidad, cuadro);
  if (!delCuadro) {
    return {
      unidades: null,
      unidadesNivel: null,
      avisos: [avisoFueraDelCuadro(codigo, producto, cuadro, "pon las unidades a mano")],
    };
  }

  const avisos: Aviso[] = [];
  const provisional = avisoProvisional(delCuadro, producto);
  if (provisional) avisos.push(provisional);

  const pocoAPoco = cobraPocoAPoco(delCuadro.tipo);
  const resultado = (centesimas: number | null) => ({
    unidades: pocoAPoco ? 0 : centesimas === null ? null : deCentesimas(centesimas),
    unidadesNivel: pocoAPoco && centesimas !== null ? deCentesimas(centesimas) : null,
    avisos,
  });

  const regla = delCuadro.unidades;
  if (!regla || h.aportacion === undefined || h.aportacion === null) return resultado(null);
  const aportacion = aCentesimas(h.aportacion);

  const duracion =
    typeof h.duracionAnios === "number" && Number.isFinite(h.duracionAnios) && h.duracionAnios >= 1
      ? Math.floor(h.duracionAnios)
      : null;
  const necesitaDuracion =
    (regla.porDuracion?.length ?? 0) > 0 || (regla.base === "primas_programadas" && regla.aniosFijos === undefined);
  if (necesitaDuracion && duracion === null) {
    avisos.push({
      codigo: "falta_duracion",
      texto: `Para proponer las unidades de «${String(producto).trim()}» hace falta la duración en años.`,
    });
    return resultado(null);
  }

  let base: number; // céntimos
  if (regla.base === "prima_anual") base = aportacion * 12;
  else if (regla.base === "importe") base = aportacion;
  else {
    let anios = regla.aniosFijos ?? (duracion as number);
    if (regla.aniosFijos === undefined && regla.aniosMaximos !== undefined && anios > regla.aniosMaximos) {
      avisos.push({
        codigo: "duracion_maxima",
        texto: `«${String(producto).trim()}» cuenta como mucho ${regla.aniosMaximos} años: se proponen las unidades de ${regla.aniosMaximos}, no de ${anios}.`,
      });
      anios = regla.aniosMaximos;
    }
    base = aportacion * 12 * anios;
  }

  let factor = regla.factor ?? 1;
  if (regla.porDuracion && regla.porDuracion.length > 0) {
    const tramo = regla.porDuracion.find(
      (t) => (t.desde === undefined || (duracion as number) >= t.desde) && (t.hasta === undefined || (duracion as number) <= t.hasta),
    );
    if (!tramo) return resultado(null);
    factor = tramo.factor;
  }

  // unidades = base (€) / porCada × factor; en centésimas: base (céntimos) × factor (centésimas) / (100 × porCada)
  return resultado(redondear(base * aCentesimas(factor), aCentesimas(regla.porCada)));
}

// ---------------------------------------------------------------------------------------------
// Importes, liquidación y cuenta de comisiones (ADR-005)
// ---------------------------------------------------------------------------------------------

/**
 * Los importes de una herramienta, fila a fila: `bruto = unidades × €/unidad` y la hucha el
 * `pctHucha` del bruto, igual que las columnas generadas y que la liquidación de OVB. El IRPF y el
 * neto por fila son **orientativos**: el de verdad lo da `calcularLiquidacion` sobre el total.
 */
export function calcularImportes(unidades: number, valorUnidad: number, pctHucha: number, pctIrpf: number): Importes {
  const u = aCentesimas(unidades); // centésimas de unidad
  const v = aCentesimas(valorUnidad); // céntimos por unidad
  const h = aCentesimas(pctHucha); // centésimas de punto: 10 % → 1000
  const i = aCentesimas(pctIrpf);

  const bruto = redondear(u * v, 100);
  const hucha = porcentajeDe(bruto, h);
  const irpf = porcentajeDe(bruto - hucha, i);
  return importesEnEuros({ bruto, hucha, irpf, neto: bruto - hucha - irpf });
}

/** Suma de varias filas, en céntimos. Orientativa: el IRPF de una liquidación va sobre el total (`calcularLiquidacion`) */
export function sumarImportes(lista: Importes[]): Importes {
  const total: Importes = { bruto: 0, hucha: 0, irpf: 0, neto: 0 };
  for (const linea of lista) {
    const centimos = importesEnCentimos(linea);
    total.bruto += centimos.bruto;
    total.hucha += centimos.hucha;
    total.irpf += centimos.irpf;
    total.neto += centimos.neto;
  }
  return importesEnEuros(total);
}

/** El IRPF de una liquidación: el `pctIrpf` de su comisión neta total, redondeado una vez */
export function irpfSobreTotal(comisionNeta: number, pctIrpf: number): number {
  return deCentesimas(porcentajeDe(aCentesimas(comisionNeta), aCentesimas(pctIrpf)));
}

/**
 * Una liquidación como la hace OVB: comisión = Σ brutos, RC = Σ reservas (ya redondeadas en su
 * fila), comisión neta = comisión − RC, IRPF sobre el total de la neta (uno por cada % de IRPF que
 * haya, y se suman) e importe = neta − IRPF + cargos y abonos de la cuenta, que no pagan IRPF.
 */
export function calcularLiquidacion(
  lineas: { bruto: number; hucha: number; pctIrpf: number }[],
  cargos: number[] = [],
): Liquidacion {
  let comision = 0;
  let rc = 0;
  const netaPorPct = new Map<number, number>();
  for (const linea of lineas) {
    const bruto = aCentesimas(linea.bruto);
    const hucha = aCentesimas(linea.hucha);
    const pct = aCentesimas(linea.pctIrpf);
    comision += bruto;
    rc += hucha;
    netaPorPct.set(pct, (netaPorPct.get(pct) ?? 0) + bruto - hucha);
  }

  let irpf = 0;
  for (const [pct, neta] of netaPorPct) irpf += porcentajeDe(neta, pct);

  let totalCargos = 0;
  for (const cargo of cargos) totalCargos += aCentesimas(cargo);

  const comisionNeta = comision - rc;
  return {
    comision: deCentesimas(comision),
    rc: deCentesimas(rc),
    comisionNeta: deCentesimas(comisionNeta),
    irpf: deCentesimas(irpf),
    cargos: deCentesimas(totalCargos),
    importe: deCentesimas(comisionNeta - irpf + totalCargos),
  };
}

/**
 * La cuenta de comisiones de OVB, liquidación a liquidación por orden de mes: el total es el saldo
 * anterior más el importe; **si llega al mínimo de transferencia** (50 € en el cuadro: se le pasa
 * `cuadro.minimoTransferencia`), se paga entero y el saldo queda a 0; si no, no hay transferencia y
 * todo pasa a la siguiente, también si es positivo. Devuelve un paso por liquidación, ordenado por mes.
 */
export function cuentaDeComisiones(
  liquidaciones: { mes: string; importe: number }[],
  saldoInicial = 0,
  minimoTransferencia = 50,
): PasoDeLaCuenta[] {
  const minimo = aCentesimas(minimoTransferencia);
  const ordenadas = liquidaciones
    .map((l) => ({ mes: primerDiaDelMes(l.mes), importe: aCentesimas(l.importe) }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  let saldo = aCentesimas(saldoInicial);
  return ordenadas.map(({ mes, importe }) => {
    const saldoAnterior = saldo;
    const total = saldoAnterior + importe;
    const sePaga = total > 0 && total >= minimo;
    saldo = sePaga ? 0 : total;
    return {
      mes,
      importe: deCentesimas(importe),
      saldoAnterior: deCentesimas(saldoAnterior),
      aPagar: deCentesimas(sePaga ? total : 0),
      saldoDespues: deCentesimas(saldo),
    };
  });
}

/**
 * Cada mes como lo liquida OVB, del más antiguo al más nuevo, con la cuenta de comisiones encima
 * (`calcularLiquidacion` y `cuentaDeComisiones`). Es lo que enseñan las pantallas de la fase 2:
 * - **Un mes que ha llegado** cuenta lo que entró en él: sus líneas cobradas y los cargos aplicados
 *   en su liquidación. Lo que se quedó en ese mes sin cobrar (una herramienta apuntada después, o un
 *   resto de extorno sin aplicar) va aparte, en `pendiente`, y no entra en la cuenta: OVB ya pagó.
 * - **Uno que no ha llegado** cuenta todo lo que se espera: sus líneas, los restos de extornos
 *   previstos para él y, si es el primero sin llegar, los cargos sin aplicar, que entran en la
 *   siguiente liquidación que llegue.
 * `meses` son los que hay que enseñar aunque no tengan líneas (las filas de la vista
 * `consultoria_liquidaciones_por_mes`, con los meses que llegaron vacíos) y `llegadas`, los que
 * tienen liquidación. `sinMes` es lo de los cargos sin aplicar cuando no hay ningún mes por llegar.
 */
export function mesesDeLiquidacion(entrada: {
  lineas: LineaDelMes[];
  cargos?: CargoDelMes[];
  llegadas: string[];
  meses?: string[];
  saldoInicial?: number;
  minimoTransferencia?: number;
}): { meses: MesDeLaCuenta[]; sinMes: number } {
  const cargos = entrada.cargos ?? [];
  for (const cargo of cargos) {
    if (cargo.aplicado && !cargo.mes) throw new RangeError("Un cargo aplicado lleva el mes de su liquidación.");
  }
  const llegadas = new Set(entrada.llegadas.map(primerDiaDelMes));
  const ordenados = [
    ...new Set([
      ...(entrada.meses ?? []).map(primerDiaDelMes),
      ...entrada.lineas.map((l) => primerDiaDelMes(l.mes)),
      ...cargos.filter((c) => c.mes).map((c) => primerDiaDelMes(c.mes as string)),
      ...llegadas,
    ]),
  ].sort();
  const primeroPorLlegar = ordenados.find((mes) => !llegadas.has(mes)) ?? null;
  const sinAplicar = cargos.filter((c) => !c.mes).map((c) => c.importe);

  const delMes = ordenados.map((mes) => {
    const lineas = entrada.lineas.filter((l) => primerDiaDelMes(l.mes) === mes);
    const suyos = cargos.filter((c) => c.mes && primerDiaDelMes(c.mes) === mes);
    if (!llegadas.has(mes)) {
      const conLosSinAplicar = mes === primeroPorLlegar ? sinAplicar : [];
      return {
        mes,
        llegada: false,
        liquidacion: calcularLiquidacion(lineas, [...suyos.map((c) => c.importe), ...conLosSinAplicar]),
        pendiente: null,
      };
    }
    const quedaron = lineas.filter((l) => !l.cobrada);
    const cargosQuedaron = suyos.filter((c) => !c.aplicado);
    return {
      mes,
      llegada: true,
      liquidacion: calcularLiquidacion(
        lineas.filter((l) => l.cobrada),
        suyos.filter((c) => c.aplicado).map((c) => c.importe),
      ),
      pendiente:
        quedaron.length || cargosQuedaron.length
          ? calcularLiquidacion(quedaron, cargosQuedaron.map((c) => c.importe))
          : null,
    };
  });

  const pasos = cuentaDeComisiones(
    delMes.map((m) => ({ mes: m.mes, importe: m.liquidacion.importe })),
    entrada.saldoInicial ?? 0,
    entrada.minimoTransferencia ?? 50,
  );
  let sinMes = 0;
  if (!primeroPorLlegar) for (const importe of sinAplicar) sinMes += aCentesimas(importe);
  return { meses: delMes.map((m, i) => ({ ...m, paso: pasos[i] })), sinMes: deCentesimas(sinMes) };
}

// ---------------------------------------------------------------------------------------------
// Herramientas y APEX: el recuento de un mes (spec 11.2)
// ---------------------------------------------------------------------------------------------

/**
 * Lo que hace falta de una línea (o de una herramienta) para contarla: si está prevista y de qué
 * herramienta es aportación extraordinaria (`aportacionDe`, la columna `aportacion_de` de la 0016)
 */
export interface LineaParaContar {
  prevista: boolean;
  /** Nulo o sin decir: es una herramienta. Una aportación única sin enlace (las de antes) también lo es */
  aportacionDe?: string | null;
}

/** El recuento de un mes: «4 herramientas y 1 APEX · 2 previstas» */
export interface RecuentoDelMes {
  /** Las líneas que no son APEX (una APEX sin enlace cuenta aquí, como hasta ahora) */
  herramientas: number;
  /** Las aportaciones extraordinarias enlazadas a su herramienta: con ella son una sola herramienta */
  apex: number;
  /** Todas las previstas, **también las APEX**: un mes con una herramienta y su APEX previstas dice 2 */
  previstas: number;
}

/** Una APEX es la que cuelga de otra herramienta (`aportacionDe` no nulo); las únicas sin enlace no lo son */
export function esApex(h: { aportacionDe?: string | null }): boolean {
  return h.aportacionDe !== null && h.aportacionDe !== undefined;
}

/**
 * Cuántas herramientas, APEX y previstas hay en esas líneas. Donde se habla de comisiones son líneas
 * distintas (como las paga OVB); donde se habla de herramientas, la APEX va con la suya
 */
export function recuentoDelMes(lineas: LineaParaContar[]): RecuentoDelMes {
  let herramientas = 0;
  let apex = 0;
  let previstas = 0;
  for (const linea of lineas) {
    if (esApex(linea)) apex++;
    else herramientas++;
    if (linea.prevista) previstas++;
  }
  return { herramientas, apex, previstas };
}

/** `1 herramienta`, `4 herramientas` */
function cuantas(n: number, una: string, varias: string): string {
  return `${n} ${n === 1 ? una : varias}`;
}

/**
 * «4 herramientas y 1 APEX», «1 herramienta», «2 APEX» o «sin herramientas». Sin APEX, sin «y 0
 * APEX»; «APEX» no cambia en plural
 */
export function textoDeHerramientas(recuento: Pick<RecuentoDelMes, "herramientas" | "apex">): string {
  const partes: string[] = [];
  if (recuento.herramientas > 0) partes.push(cuantas(recuento.herramientas, "herramienta", "herramientas"));
  if (recuento.apex > 0) partes.push(`${recuento.apex} APEX`);
  return partes.length ? partes.join(" y ") : "sin herramientas";
}

/** El recuento para las pantallas: «4 herramientas y 1 APEX · 2 previstas»; sin previstas, solo lo primero */
export function textoDelRecuento(recuento: RecuentoDelMes): string {
  const herramientas = textoDeHerramientas(recuento);
  return recuento.previstas > 0 ? `${herramientas} · ${cuantas(recuento.previstas, "prevista", "previstas")}` : herramientas;
}

// ---------------------------------------------------------------------------------------------
// Fechas de una firma
// ---------------------------------------------------------------------------------------------

function buscarCierre(cierres: Cierre[], calendario: Calendario, mes: string): Cierre | undefined {
  return cierres.find((c) => c.calendario === calendario && primerDiaDelMes(c.mes) === mes);
}

function textoDeMesesHastaCobro(meses: number): string {
  if (meses === 0) return "el mismo mes del efecto";
  if (meses === 1) return "el mes siguiente al del efecto";
  return `${meses} meses después del efecto`;
}

/**
 * Mes de producción, efecto y cobro estimado de una firma (sección 3.3 de la spec), con la regla de
 * su compañía y lo que diga su producto en el cuadro. `fecha` es la de confirmar la solicitud o, por
 * transferencia, la del dinero (la solicitud no se confirma hasta que se hace). «Entra a tiempo» es
 * `fecha <= confirmarHasta` del cierre de su calendario en ese mes; si falta, se supone que entra.
 *
 * - `axa_pias` (AXA, con cualquier producto): efecto el día 10 del mes siguiente, o del otro si
 *   pasa el cierre. El pago no cambia nada. Con `efecto: "fecha"` en el cuadro (la aportación
 *   extraordinaria), el efecto es el día de la aportación y el cierre no cuenta.
 * - `por_pago` (INTESA, AVANZA), por domiciliación: efecto el día 1 del mes siguiente (o del otro).
 *   Por transferencia: efecto el día 1 del mismo mes; si pasa el cierre, **la producción, el efecto
 *   y el cobro van juntos al mes siguiente** (Facundo, 2026-10-25). Provisional.
 * - `sin_calendario` (los seguros y cualquier código desconocido): el efecto que se dé; si no, el
 *   día 1 del mes siguiente con `efecto_a_mano`. El cobro, provisional.
 * - En todas, la producción pasa al mes siguiente si `fecha` pasa el cierre del ranking.
 * - **Un `fechaEfecto` dado manda** en cualquier regla. El cobro es el último día del mes del efecto
 *   más `mesesHastaCobroPara` (el del producto en el cuadro, o el de la compañía o su regla).
 */
export function fechasDeLaFirma(
  entrada: Pick<EntradaFirma, "compania" | "producto" | "periodicidad" | "pago" | "fecha" | "fechaEfecto">,
  contexto: Pick<ContextoReglas, "cierres" | "companias" | "cuadro">,
): Pick<Propuesta, "mesProduccion" | "fechaEfecto" | "fechaCobro" | "fechasProvisionales" | "avisos"> {
  const { fecha } = entrada;
  const mes = primerDiaDelMes(fecha);
  const producto = entrada.producto ?? "";
  const periodicidad = entrada.periodicidad ?? "mensual";
  // Un campo vacío del formulario es «no lo ha dado»; una fecha mal escrita, un error
  const efectoDado = entrada.fechaEfecto ? entrada.fechaEfecto : null;
  if (efectoDado) partes(efectoDado);

  const conocida = buscarCompania(entrada.compania, contexto.companias);
  const compania = datosDeCompania(entrada.compania, contexto.companias);
  const regla = reglaDe(compania);
  const delCuadro = productoDelCuadro(entrada.compania, producto, periodicidad, contexto.cuadro);
  // La aportación extraordinaria de AXA: el efecto es el día de la aportación, sin cierre
  const efectoEnLaFecha = !efectoDado && delCuadro?.efecto === "fecha";
  const usaCierre = regla !== "sin_calendario" && !efectoEnLaFecha;
  const calendario = usaCierre ? compania.calendario : null;
  const porTransferencia = regla === "por_pago" && entrada.pago === "transferencia" && !efectoEnLaFecha;

  const avisos: Aviso[] = [];
  if (!conocida) {
    avisos.push({
      codigo: "compania_sin_reglas",
      texto: `La compañía «${compania.codigo}» no está en tus compañías: se ha tratado como sin calendario. Añádela en Ajustes.`,
    });
  }

  const cierre = calendario ? buscarCierre(contexto.cierres, calendario, mes) : undefined;
  const ranking = buscarCierre(contexto.cierres, "RANKING", mes);
  const faltan = [
    ...(usaCierre && !cierre ? [calendario ? NOMBRE_DEL_CALENDARIO[calendario] : compania.nombre] : []),
    ...(ranking ? [] : [NOMBRE_DEL_CALENDARIO.RANKING]),
  ];

  // El cierre de su compañía decide el efecto y el cobro (y, por transferencia, también la producción)
  const aTiempo = !cierre || fecha <= cierre.confirmarHasta;
  const retraso = aTiempo ? 0 : 1;
  let mesProduccion = porTransferencia ? mesMas(mes, retraso) : mes;

  if (cierre && !aTiempo) {
    const delCierre = `del cierre de ${NOMBRE_DEL_CALENDARIO[cierre.calendario]} de ${nombreDelMes(mes)} (el ${diaDe(cierre.confirmarHasta)})`;
    avisos.push({
      codigo: "pasado_el_cierre",
      texto: porTransferencia
        ? `La transferencia llega después ${delCierre}: la producción, el efecto y el cobro pasan a ${nombreDelMes(mesProduccion)}.`
        : efectoDado
          ? `Confirmada después ${delCierre}: va un mes más tarde, pero manda el efecto puesto a mano.`
          : `Confirmada después ${delCierre}: el efecto y el cobro van un mes más tarde.`,
    });
  }

  // El ranking decide el mes de producción del resto. Hoy siempre cierra el último día, así que no se pasa nunca
  if (ranking && fecha > ranking.confirmarHasta && mesProduccion === mes) {
    mesProduccion = mesMas(mes, 1);
    avisos.push({
      codigo: "pasado_el_cierre",
      texto: `Pasa del cierre del ranking de ${nombreDelMes(mes)} (el ${diaDe(ranking.confirmarHasta)}): cuenta para la producción de ${nombreDelMes(mesProduccion)}.`,
    });
  }

  if (faltan.length > 0) {
    avisos.push({
      codigo: "faltan_cierres",
      texto: `Faltan los cierres de ${nombreDelMes(mes)} (${faltan.join(" y ")}): se ha supuesto que entra a tiempo.`,
    });
  }

  const efectoFijo = efectoDado ?? (efectoEnLaFecha ? fecha : null);
  let fechaEfecto: string;
  let fechasProvisionales = false;

  if (regla === "axa_pias") {
    fechaEfecto = efectoFijo ?? diaDelMes(mesMas(mes, 1 + retraso), 10);
  } else if (regla === "por_pago" && !porTransferencia) {
    fechaEfecto = efectoFijo ?? mesMas(mes, 1 + retraso);
    if (!efectoFijo) {
      fechasProvisionales = true;
      avisos.push({
        codigo: "dia_de_efecto_sin_confirmar",
        texto: `En ${compania.nombre} por domiciliación, el día de efecto está sin confirmar: se ha puesto el día 1.`,
      });
    }
  } else if (regla === "por_pago") {
    // Por transferencia, lo provisional es hasta qué día vale: decide el mes de producción aunque se dé el efecto
    fechaEfecto = efectoFijo ?? mesMas(mes, retraso);
    fechasProvisionales = true;
    avisos.push({
      codigo: "transferencia_sin_confirmar",
      texto: cierre
        ? `En ${compania.nombre} está sin confirmar hasta qué día vale una transferencia para cobrar ese mes: se ha tomado hasta su cierre (el ${diaDe(cierre.confirmarHasta)}).`
        : `En ${compania.nombre} está sin confirmar hasta qué día vale una transferencia para cobrar ese mes: se ha tomado hasta el cierre de la compañía.`,
    });
  } else {
    fechaEfecto = efectoFijo ?? mesMas(mes, 1);
    fechasProvisionales = true;
    if (!efectoFijo) {
      avisos.push({
        codigo: "efecto_a_mano",
        texto: `${compania.nombre} no tiene calendario: pon la fecha de efecto. Se ha propuesto el día 1 del mes siguiente.`,
      });
    }
  }

  const meses = mesesHastaCobroPara(entrada.compania, producto, periodicidad, fechaEfecto, contexto);
  if (regla === "sin_calendario") {
    avisos.push({
      codigo: "cobro_sin_confirmar",
      texto: `En ${compania.nombre}, el cobro se estima ${textoDeMesesHastaCobro(meses)}: está sin confirmar.`,
    });
  }
  if (delCuadro?.cobro && "dia15" in delCuadro.cobro && diaDe(fechaEfecto) === 15) {
    fechasProvisionales = true;
    avisos.push({
      codigo: "dato_provisional",
      texto: "El efecto cae el día 15 justo: se ha tomado como «antes del 15» y se cobra ese mes, sin confirmar.",
    });
  }

  return {
    mesProduccion,
    fechaEfecto,
    fechaCobro: ultimoDiaDelMes(mesMas(fechaEfecto, meses)),
    fechasProvisionales,
    avisos,
  };
}

/**
 * El plazo para resolver una incidencia: el `incidenciasHasta` del cierre del ciclo de la
 * herramienta. Normalmente es el mes anterior al del efecto; en `por_pago` por transferencia, el
 * efecto cae en el mes de su ciclo (el de la confirmación, o el siguiente si pasó el cierre), así
 * que es el mismo mes del efecto. Sin `pago`, como por domiciliación. Null en las compañías sin
 * calendario y si el cierre no está cargado o no lo dice.
 */
export function plazoDeIncidencia(
  compania: Compania,
  fechaEfecto: string,
  cierres: Cierre[],
  companias: DatosCompania[],
  pago?: Pago,
): string | null {
  const datos = datosDeCompania(compania, companias);
  const regla = reglaDe(datos);
  if (regla === "sin_calendario" || !datos.calendario) {
    partes(fechaEfecto);
    return null;
  }
  const porTransferencia = regla === "por_pago" && pago === "transferencia";
  const ciclo = mesMas(fechaEfecto, porTransferencia ? 0 : -1);
  return buscarCierre(cierres, datos.calendario, ciclo)?.incidenciasHasta ?? null;
}

/** Los cierres que aún no han pasado (el de hoy cuenta: acaba a las 23:59), del más cercano al más lejano */
export function proximosCierres(cierres: Cierre[], hoy: string, cuantos = 4): Cierre[] {
  partes(hoy);
  return cierres
    .filter((c) => c.confirmarHasta >= hoy)
    .sort(
      (a, b) =>
        a.confirmarHasta.localeCompare(b.confirmarHasta) ||
        ORDEN_DEL_CALENDARIO[a.calendario] - ORDEN_DEL_CALENDARIO[b.calendario],
    )
    .slice(0, Math.max(0, cuantos));
}

// ---------------------------------------------------------------------------------------------
// Unidades y nivel
// ---------------------------------------------------------------------------------------------

/** Centésimas de unidad de las previas y de las herramientas que cumplen `cuenta`, con las de nivel si las tienen */
function sumarUnidades(contexto: ContextoReglas, cuenta: (h: UnidadesDe, mes: string) => boolean): number {
  let total = aCentesimas(contexto.ajustes.unidadesPrevias);
  for (const herramienta of contexto.herramientas) {
    if (cuenta(herramienta, primerDiaDelMes(herramienta.mesProduccion))) {
      total += aCentesimas(herramienta.unidadesNivel ?? herramienta.unidades);
    }
  }
  return total;
}

/** Las unidades producidas antes del mes `mes` (sin él): las que deciden su nivel. Las anuladas no cuentan */
function unidadesAntesDe(mes: string, contexto: ContextoReglas, conPrevistas: boolean): number {
  return sumarUnidades(
    contexto,
    (h, mesDeLaHerramienta) =>
      mesDeLaHerramienta < mes && h.estado !== "anulada" && (conPrevistas || h.estado !== "prevista"),
  );
}

/**
 * Unidades acumuladas **hasta el mes indicado, incluido**: las previas más las de las herramientas
 * no anuladas (`unidadesNivel ?? unidades`). Sin `conPrevistas`, sin las previstas (lo que se enseña
 * en el Resumen; las previstas, aparte).
 */
export function unidadesAcumuladas(
  hastaMes: string,
  contexto: ContextoReglas,
  opciones: { conPrevistas?: boolean } = {},
): number {
  const hasta = primerDiaDelMes(hastaMes);
  const conPrevistas = opciones.conPrevistas ?? false;
  return deCentesimas(
    sumarUnidades(
      contexto,
      (h, mesDeLaHerramienta) =>
        mesDeLaHerramienta <= hasta && h.estado !== "anulada" && (conPrevistas || h.estado !== "prevista"),
    ),
  );
}

/** El nivel que vale en el mes `mes` con esas unidades antes: el de mayor €/unidad de los alcanzados */
function nivelPara(mes: string, unidadesAntes: number, niveles: Nivel[]): Nivel | null {
  let mejor: Nivel | null = null;
  for (const nivel of niveles) {
    const porUnidades = nivel.desdeUnidades !== null && aCentesimas(nivel.desdeUnidades) <= unidadesAntes;
    const porMes = nivel.desdeMes !== null && primerDiaDelMes(nivel.desdeMes) <= mes;
    if (!porUnidades && !porMes) continue;
    if (!mejor || aCentesimas(nivel.valorUnidad) > aCentesimas(mejor.valorUnidad)) mejor = nivel;
  }
  return mejor;
}

/**
 * El €/unidad del mes de producción `mes`: el del nivel alcanzado con las unidades de **antes** de
 * ese mes, así que el nivel cambia el mes siguiente a cruzar el umbral. Con `niveles` vacío, los del
 * cuadro. Las previstas cuentan; si sin ellas el nivel sale distinto, avisa con `nivel_con_previstas`.
 * Sin ningún nivel alcanzado, `valorUnidad` 0 y `sin_niveles` (la pantalla obliga a ponerlo a mano).
 */
export function valorUnidadDelMes(
  mes: string,
  contexto: ContextoReglas,
): { nivel: string; valorUnidad: number; unidadesAntes: number; avisos: Aviso[] } {
  const produccion = primerDiaDelMes(mes);
  const niveles = contexto.niveles.length > 0 ? contexto.niveles : cuadroDe(contexto.cuadro).niveles;
  const conPrevistas = unidadesAntesDe(produccion, contexto, true);
  const nivel = nivelPara(produccion, conPrevistas, niveles);
  const unidadesAntes = deCentesimas(conPrevistas);

  if (!nivel) {
    return {
      nivel: "",
      valorUnidad: 0,
      unidadesAntes,
      avisos: [
        {
          codigo: "sin_niveles",
          texto: `No hay ningún nivel que aplicar en ${nombreDelMes(produccion)}: pon el €/unidad a mano.`,
        },
      ],
    };
  }

  const avisos: Aviso[] = [];
  const sinPrevistas = unidadesAntesDe(produccion, contexto, false);
  if (sinPrevistas !== conPrevistas) {
    const nivelSinPrevistas = nivelPara(produccion, sinPrevistas, niveles);
    if (
      nivelSinPrevistas?.nombre !== nivel.nombre ||
      aCentesimas(nivelSinPrevistas.valorUnidad) !== aCentesimas(nivel.valorUnidad)
    ) {
      avisos.push({
        codigo: "nivel_con_previstas",
        texto: nivelSinPrevistas
          ? `El nivel sale de contar las previstas (${unidadesEnTexto(conPrevistas)} antes de ${nombreDelMes(produccion)}). Sin ellas sería ${nivelSinPrevistas.nombre}, a ${eurosEnTexto(aCentesimas(nivelSinPrevistas.valorUnidad))} la unidad.`
          : `El nivel sale de contar las previstas (${unidadesEnTexto(conPrevistas)} antes de ${nombreDelMes(produccion)}). Sin ellas no habría ninguno.`,
      });
    }
  }

  return { nivel: nivel.nombre, valorUnidad: deCentesimas(aCentesimas(nivel.valorUnidad)), unidadesAntes, avisos };
}

/** Quita los avisos repetidos (mismo código y texto), conservando el orden */
function sinRepetir(avisos: Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return avisos.filter((a) => {
    const clave = `${a.codigo}|${a.texto}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/**
 * Todo lo que se propone para una firma nueva: fechas, unidades (las dadas o las del cuadro), nivel,
 * reserva del cuadro, IRPF de Ajustes, importes, tipo de comisión y versión del cuadro.
 * Si se dan las unidades, mandan; las de nivel, si no se dan, solo se proponen cuando tampoco se
 * dieron las unidades. Sin unidades (null), los importes salen a 0.
 */
export function proponerFirma(entrada: EntradaFirma, contexto: ContextoReglas): Propuesta {
  const cuadro = cuadroDe(contexto.cuadro);
  const producto = entrada.producto ?? "";
  const periodicidad = entrada.periodicidad ?? "mensual";
  const delCuadro = productoDelCuadro(entrada.compania, producto, periodicidad, cuadro);

  const fechas = fechasDeLaFirma(entrada, contexto);
  const valor = valorUnidadDelMes(fechas.mesProduccion, contexto);

  const propuestas = unidadesPropuestas(
    entrada.compania,
    producto,
    periodicidad,
    { aportacion: entrada.aportacion, duracionAnios: entrada.duracionAnios },
    cuadro,
  );
  const dadas = entrada.unidades !== undefined && entrada.unidades !== null;
  const unidades = dadas ? (entrada.unidades as number) : propuestas.unidades;
  const unidadesNivel = entrada.unidadesNivel ?? (dadas ? null : propuestas.unidadesNivel);
  // Con las unidades dadas, que falte la duración ya no importa
  const avisosDeUnidades = dadas ? propuestas.avisos.filter((a) => a.codigo !== "falta_duracion") : propuestas.avisos;

  const reserva = reservaPara(entrada.compania, producto, periodicidad, contexto, {
    unidades: unidades ?? 0,
    propio: entrada.propio ?? false,
  });
  const avisosDeReserva: Aviso[] = [];
  if (reserva.motivo === "propio") {
    avisosDeReserva.push({
      codigo: "reserva_por_tramo",
      texto: `Contrato propio: la reserva de cancelación es del ${numeroEnTexto(aCentesimas(reserva.pct))} %.`,
    });
  } else if (reserva.motivo === "tramo") {
    avisosDeReserva.push({
      codigo: "reserva_por_tramo",
      texto: `Con más de ${unidadesEnTexto(aCentesimas(reserva.masDeUnidades ?? 0))}, la reserva de cancelación sube al ${numeroEnTexto(aCentesimas(reserva.pct))} %.`,
    });
  }

  const { pctIrpf } = contexto.ajustes;
  return {
    mesProduccion: fechas.mesProduccion,
    fechaEfecto: fechas.fechaEfecto,
    fechaCobro: fechas.fechaCobro,
    nivel: valor.nivel,
    valorUnidad: valor.valorUnidad,
    unidadesAntes: valor.unidadesAntes,
    pctHucha: reserva.pct,
    pctIrpf,
    importes: calcularImportes(unidades ?? 0, valor.valorUnidad, reserva.pct, pctIrpf),
    // Fuera del cuadro: anticipada, o única si es una aportación única
    tipoComision: delCuadro?.tipo ?? (periodicidad === "unica" ? "unica" : "anticipada"),
    unidades,
    unidadesNivel,
    versionCuadro: cuadro.version,
    fechasProvisionales: fechas.fechasProvisionales,
    avisos: sinRepetir([...fechas.avisos, ...avisosDeUnidades, ...avisosDeReserva, ...valor.avisos]),
  };
}

// ---------------------------------------------------------------------------------------------
// La hucha y el extorno (ADR-004 y el cuadro)
// ---------------------------------------------------------------------------------------------

function saldoEnCentimos(movimientos: MovimientoHucha[], hasta?: string): number {
  if (hasta !== undefined) partes(hasta);
  let saldo = 0;
  for (const movimiento of movimientos) {
    if (hasta === undefined || movimiento.fecha <= hasta) saldo += aCentesimas(movimiento.importe);
  }
  return saldo;
}

/** El saldo de la hucha: la suma de sus movimientos (con signo), todos o hasta un día incluido */
export function saldoDeHucha(movimientos: MovimientoHucha[], hasta?: string): number {
  return deCentesimas(saldoEnCentimos(movimientos, hasta));
}

/**
 * Lo que se devuelve si se anula esa herramienta el día `anuladaEl` (spec 3.6). `mes` cuenta los
 * meses cumplidos desde el efecto, al día: el mes 1 va del efecto al día anterior al mismo día del
 * mes siguiente, y el mes `meses + 1` empieza justo en `finDelExtorno(efecto, meses)`, así que las
 * dos dicen lo mismo. Con tramos, el % de su tramo (con `bajaPorMes`,
 * `pct − (mes − desde) × bajaPorMes`); lineal, `(meses − mes + 1) / meses`; pasados los meses de
 * responsabilidad, o si no se cobró, 0. El importe es `round(bruto × pct / 100, 2)`. Fuera del
 * cuadro, o si el cuadro no lo dice, el de siempre: el 100 % durante 48 meses, con aviso.
 */
export function extornoPropuesto(
  h: { compania: Compania; producto: string; periodicidad: Periodicidad; fechaEfecto: string; bruto: number; cobrada: boolean },
  anuladaEl: string,
  cuadro: Cuadro,
): { importe: number; pct: number; mes: number; avisos: Aviso[] } {
  const mes = Math.max(1, mesesCumplidos(h.fechaEfecto, anuladaEl) + 1);
  const bruto = aCentesimas(h.bruto);
  if (!h.cobrada) return { importe: 0, pct: 0, mes, avisos: [] };

  const avisos: Aviso[] = [];
  const delCuadro = productoDelCuadro(h.compania, h.producto, h.periodicidad ?? "mensual", cuadro);
  let regla: ReglaDeExtorno;
  if (!delCuadro) {
    regla = EXTORNO_DE_SIEMPRE;
    avisos.push(avisoFueraDelCuadro(h.compania, h.producto, cuadro, "se propone el extorno de siempre (el 100 % durante 48 meses)"));
  } else if (!delCuadro.extorno) {
    regla = EXTORNO_DE_SIEMPRE;
    avisos.push({
      codigo: "dato_provisional",
      texto: `El cuadro no dice el extorno de «${String(h.producto).trim()}»: se propone el de siempre (el 100 % durante 48 meses).`,
    });
  } else {
    regla = delCuadro.extorno;
  }

  const responsabilidad = comoMeses(regla.meses);
  if (responsabilidad === 0 || mes > responsabilidad) return { importe: 0, pct: 0, mes, avisos };

  if (regla.lineal) {
    const quedan = responsabilidad - mes + 1;
    avisos.push({ codigo: "dato_provisional", texto: "El mes exacto del extorno lineal está sin confirmar." });
    return {
      importe: deCentesimas(redondear(bruto * quedan, responsabilidad)),
      pct: deCentesimas(redondear(quedan * 10_000, responsabilidad)),
      mes,
      avisos,
    };
  }

  const tramo = regla.tramos?.find((t) => t.desde <= mes && mes <= t.hasta);
  if (!tramo) return { importe: 0, pct: 0, mes, avisos };
  const pct = Math.max(0, aCentesimas(tramo.pct) - (mes - tramo.desde) * aCentesimas(tramo.bajaPorMes ?? 0));
  return { importe: deCentesimas(porcentajeDe(bruto, pct)), pct: deCentesimas(pct), mes, avisos };
}

/** El cargo en la cuenta de comisiones por lo que la hucha no cubre de un extorno: −resto + irpfResto */
export function cargoDelResto(resto: number, irpfResto: number): number {
  return deCentesimas(-aCentesimas(resto) + aCentesimas(irpfResto));
}

/**
 * El reparto de un extorno: sale primero de la hucha, con el saldo que tenga ese día
 * (`deHucha = mín(importe, máx(saldo, 0))`), y el resto es un cargo en la cuenta de comisiones,
 * previsto para la liquidación del mes de la fecha del extorno. Los dos supuestos de IRPF, a 0.
 * Todo editable antes de guardar.
 */
export function proponerExtorno(importe: number, fecha: string, movimientos: MovimientoHucha[]): PropuestaExtorno {
  const total = Math.max(aCentesimas(importe), 0);
  const saldoAntes = saldoEnCentimos(movimientos, fecha);
  const deHucha = Math.min(total, Math.max(saldoAntes, 0));
  const resto = total - deHucha;
  const restoCobro = resto > 0 ? ultimoDiaDelMes(fecha) : null;

  const avisos: Aviso[] = [];
  if (saldoAntes < 0) {
    avisos.push({
      codigo: "hucha_en_negativo",
      texto: `El saldo de la hucha ese día ya es negativo (${eurosEnTexto(saldoAntes)}).`,
    });
  }
  if (restoCobro) {
    avisos.push({
      codigo: "hucha_no_cubre",
      texto:
        deHucha > 0
          ? `La hucha solo cubre ${eurosEnTexto(deHucha)} de ${eurosEnTexto(total)}: el resto, ${eurosEnTexto(resto)}, es un cargo en la cuenta de comisiones, previsto para la liquidación de ${nombreDelMes(restoCobro)}.`
          : `La hucha no tiene saldo: los ${eurosEnTexto(total)} son un cargo en la cuenta de comisiones, previsto para la liquidación de ${nombreDelMes(restoCobro)}.`,
    });
  }

  return {
    importe: deCentesimas(total),
    deHucha: deCentesimas(deHucha),
    resto: deCentesimas(resto),
    restoCobro,
    saldoAntes: deCentesimas(saldoAntes),
    saldoDespues: deCentesimas(saldoAntes - deHucha),
    irpfHucha: 0,
    irpfResto: 0,
    cargoDelResto: restoCobro ? deCentesimas(-resto) : null,
    avisos,
  };
}

/**
 * El IRPF que se propone retener al reclamar la hucha: el `pctIrpf` de Ajustes sobre lo reclamado,
 * porque la hucha se aparta antes de calcular el IRPF. Es un supuesto, editable. El importe puede
 * llegar con signo (en la hucha, una reclamación es negativa): se usa su valor absoluto.
 */
export function irpfDeReclamacion(importe: number, pctIrpf: number): number {
  return deCentesimas(porcentajeDe(Math.abs(aCentesimas(importe)), aCentesimas(pctIrpf)));
}
