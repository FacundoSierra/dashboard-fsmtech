/**
 * Lo que leen las pantallas de la consultoría (REQ-001; spec 4.1 de origen y 7.1 del panel). Todo pasa
 * por `baseDeDatos()` (`lib/base/cliente.ts`), que comprueba la sesión antes de dar el cliente: entra
 * con la clave secreta, que se salta el RLS, así que **esa comprobación es la que protege los datos**
 * (ADR-002). Todas filtran por `consultor_id`, el de `exigirConsultoria()`, que es por donde empiezan
 * los índices. Se llaman después de `exigirConsultoria()`: sin variables de la base, `baseDeDatos()`
 * lanza `BaseSinConfigurar`.
 *
 * - **Las cuentas no se repiten aquí**: salen de `reglas.ts`, las mismas que usan los scripts. Los
 *   meses, con `mesesDeLiquidacion` (que lleva `calcularLiquidacion` y `cuentaDeComisiones`) sobre
 *   las líneas de `consultoria_lineas`, porque el IRPF va sobre el total de cada % y la vista por
 *   meses no dice qué % lleva cada grupo; de `consultoria_liquidaciones_por_mes` salen los meses que
 *   hay (también los que llegaron vacíos o solo tienen un resto de extorno) y sus datos. La hucha,
 *   con `saldoDeHucha`; el nivel, con `valorUnidadDelMes` y `unidadesAcumuladas`
 * - **Sin la migración 0001** (una tabla, vista o columna que no existe), `pendiente: true` con
 *   `falta: "0001"` y lo demás vacío: la página lo dice. La 0001 lleva de una vez lo que en FSM-Finance
 *   eran la 0013, la 0015 y la 0016 (también `aportacion_de`)
 * - **Una APEX es la herramienta que tiene `aportacion_de`** (cuelga de otra). Donde se habla de
 *   herramientas va con la suya (`recuentoDelMes` de `reglas.ts`); donde se habla de comisiones es su
 *   propia línea. Una única sin enlace (las de antes) cuenta como herramienta, como hasta ahora
 * - **Otro error de lectura no se tapa con ceros** (sería dinero que no es): el detalle va al log del
 *   servidor y se lanza un error sin detalles, que recoge el `error.tsx` de la sección
 * - Lo que se lee varias veces en una petición (el contexto, los meses, la hucha, los extornos) se
 *   memoriza con `cache()` de React (por petición), como `exigirConsultoria`. **Nada de `'use cache'`
 *   ni `unstable_cache`**: guardarían filas con nombres fuera de la petición (spec 10)
 * - Los `numeric` se pasan a `number` al leer; las sumas, en céntimos enteros
 */
import { cache } from "react";
import { baseDeDatos } from "@/lib/base/cliente";
import { sumarMeses } from "@/lib/consultoria/calendario";
import { CUADRO_VIGENTE, NIVELES_DE_SERIE } from "@/lib/consultoria/cuadro";
import {
  AJUSTES_DE_SERIE,
  COMPANIAS_DE_SERIE,
  calcularLiquidacion,
  finDelExtorno,
  mesesDeLiquidacion,
  esApex,
  primerDiaDelMes,
  productoDelCuadro,
  proximosCierres,
  recuentoDelMes,
  saldoDeHucha,
  unidadesAcumuladas,
  valorUnidadDelMes,
} from "@/lib/consultoria/reglas";
import type {
  Calendario,
  Cierre,
  ContextoReglas,
  DatosCompania,
  EstadoHerramienta,
  Nivel,
  Pago,
  Periodicidad,
  ReglaCompania,
  TipoComision,
} from "@/lib/consultoria/reglas";
import type {
  AjustesConsultoria,
  BarraDelResumen,
  ClienteDeLaLista,
  ConPendiente,
  ContextoConsultoria,
  CuentaConsultoria,
  DeSerie,
  DetalleDelMes,
  Extorno,
  FichaCliente,
  FiltrosProduccion,
  Herramienta,
  HerramientaConAportaciones,
  HuchaConsultoria,
  LineaLiquidacion,
  LiquidacionesDelAnio,
  MesLiquidacion,
  MigracionQueFalta,
  MovimientoDeCuenta,
  MovimientoDeHucha,
  Produccion,
  ProductoUsado,
  ResumenConsultoria,
} from "@/lib/consultoria/tipos";
import { esUuid, mesONulo } from "@/lib/consultoria/validar";
import { euros } from "@/lib/consultoria/formato";

// ---------------------------------------------------------------------------------------------
// Errores, páginas y números
// ---------------------------------------------------------------------------------------------

interface ErrorDeSupabase {
  code?: string;
  message: string;
}

/** Tabla, vista, columna o función que no existe: falta la migración */
const CODIGOS_SIN_MIGRACION = new Set(["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"]);

/** Falta una migración (en el panel, solo hay una: la 0001): lo recogen las consultas de fuera y devuelven `pendiente` con cuál */
class FaltaLaMigracion extends Error {
  readonly migracion: MigracionQueFalta;
  constructor(migracion: MigracionQueFalta, que: string) {
    super(que);
    this.migracion = migracion;
  }
}

function comprobar(error: ErrorDeSupabase | null, que: string): void {
  if (!error) return;
  if (error.code && CODIGOS_SIN_MIGRACION.has(error.code)) throw new FaltaLaMigracion("0001", que);
  console.error(`[consultoría] No se han podido leer ${que}: ${error.code ?? "sin código"} ${error.message}`);
  throw new Error("No se ha podido leer la consultoría. Vuelve a intentarlo dentro de un momento.");
}

/** Lo que devuelve `leer`, con `pendiente: false`; si falta una migración, `vacio` con `pendiente: true` y cuál */
async function conPendiente<T extends object>(leer: () => Promise<T>, vacio: () => T): Promise<T & ConPendiente> {
  try {
    return { ...(await leer()), pendiente: false };
  } catch (error) {
    if (error instanceof FaltaLaMigracion) return { ...vacio(), pendiente: true, falta: error.migracion };
    throw error;
  }
}

const POR_PAGINA = 1000; // el tope de filas de Supabase por petición

/** Todas las filas, de mil en mil. La consulta tiene que llevar un orden que no empate */
async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: ErrorDeSupabase | null }>,
  que: string,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + POR_PAGINA - 1);
    comprobar(error, que);
    filas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) return filas;
  }
}

/** Un `numeric` de PostgREST como `number` (0 si es nulo) */
const numero = (valor: unknown): number => (valor === null || valor === undefined ? 0 : Number(valor));
const numeroONulo = (valor: unknown): number | null => (valor === null || valor === undefined ? null : Number(valor));

/** Suma de euros en céntimos enteros, sin −0 */
function sumarEuros(valores: number[]): number {
  const centimos = valores.reduce((total, valor) => total + Math.round(valor * 100), 0);
  return centimos === 0 ? 0 : centimos / 100;
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

// ---------------------------------------------------------------------------------------------
// Filas de la base de datos
// ---------------------------------------------------------------------------------------------

type Numerico = number | string | null;

interface FilaMes {
  mes: string;
  unidades: Numerico;
  neto_previsto: Numerico;
  liquidacion_id: string | null;
  numero: number | null;
  fecha: string | null;
  importe_recibido: Numerico;
}

interface FilaLinea {
  herramienta_id: string;
  cliente_id: string;
  cliente: string;
  compania: string;
  producto: string;
  mes: string;
  fecha_cobro: string;
  estado: EstadoHerramienta;
  liquidacion_id: string | null;
  cobrada: boolean;
  prevista: boolean;
  unidades: Numerico;
  bruto: Numerico;
  hucha: Numerico;
  pct_irpf: Numerico;
  aportacion_de: string | null;
}

interface FilaMovimientoCuenta {
  fecha: string;
  concepto: string;
  importe: Numerico;
  liquidacion_id: string | null;
  aplicado: boolean;
  mes_previsto: string | null;
  cargo_id: string | null;
  extorno_id: string | null;
  cliente: string | null;
}

interface FilaHucha {
  fecha: string;
  tipo: MovimientoDeHucha["tipo"];
  importe: Numerico;
  irpf: Numerico;
  liquidacion_id: string | null;
  extorno_id: string | null;
  movimiento_id: string | null;
  cliente: string | null;
  notas: string | null;
}

interface FilaExtorno {
  id: string;
  herramienta_id: string;
  fecha: string;
  importe: Numerico;
  de_hucha: Numerico;
  resto: Numerico;
  resto_cobro: string | null;
  liquidacion_id: string | null;
  irpf_hucha: Numerico;
  irpf_resto: Numerico;
  notas: string | null;
}

interface FilaHerramienta {
  id: string;
  cliente_id: string;
  compania: string;
  producto: string;
  pago: Pago;
  periodicidad: Periodicidad;
  tipo_comision: TipoComision;
  aportacion: Numerico;
  duracion_anios: number | null;
  propio: boolean;
  unidades: Numerico;
  unidades_nivel: Numerico;
  valor_unidad: Numerico;
  pct_hucha: Numerico;
  pct_irpf: Numerico;
  fecha_confirmacion: string | null;
  mes_produccion: string;
  fecha_efecto: string;
  fecha_cobro: string;
  estado: EstadoHerramienta;
  fechas_provisionales: boolean;
  liquidacion_id: string | null;
  anulada_el: string | null;
  bruto: Numerico;
  hucha: Numerico;
  irpf: Numerico;
  neto: Numerico;
  notas: string | null;
  origen: string | null;
  aportacion_de: string | null;
  cliente: { nombre: string } | { nombre: string }[] | null;
}

interface FilaCliente {
  id: string;
  nombre: string;
  referencia: string | null;
  proxima_revision: string | null;
  notas: string | null;
  herramientas: Numerico;
  previstas: Numerico;
  aportacion_mensual: Numerico;
  aportacion_unica: Numerico;
  generado_bruto: Numerico;
}

/** El cliente, por su única relación con las herramientas (la FK compuesta): sin ambigüedad (PGRST201) */
// En una sola cadena literal: supabase-js lee sus tipos de ella, y una concatenada no la entiende
const COLUMNAS_HERRAMIENTA =
  "id, cliente_id, compania, producto, pago, periodicidad, tipo_comision, aportacion, duracion_anios, propio, unidades, unidades_nivel, valor_unidad, pct_hucha, pct_irpf, fecha_confirmacion, mes_produccion, fecha_efecto, fecha_cobro, estado, fechas_provisionales, liquidacion_id, anulada_el, bruto, hucha, irpf, neto, notas, origen, aportacion_de, cliente:consultoria_clientes!consultoria_herramientas_cliente_fk(nombre)";

const COLUMNAS_CLIENTE =
  "id, nombre, referencia, proxima_revision, notas, herramientas, previstas, aportacion_mensual, aportacion_unica, generado_bruto";

// ---------------------------------------------------------------------------------------------
// Lo que se lee una vez por petición
// ---------------------------------------------------------------------------------------------

function contextoDeSerie(): ContextoReglas {
  return {
    cuadro: CUADRO_VIGENTE,
    companias: COMPANIAS_DE_SERIE,
    cierres: [],
    niveles: NIVELES_DE_SERIE,
    ajustes: AJUSTES_DE_SERIE,
    herramientas: [],
  };
}

const TODO_DE_SERIE: DeSerie = { companias: true, niveles: true, ajustes: true };

/**
 * El `ContextoReglas` del consultor, con las mismas columnas que `cargarContexto` de
 * `scripts/consultoria-comun.mjs`: sus compañías (o las de serie), sus cierres, sus niveles (o los
 * del cuadro), sus ajustes (o los de serie) y `mes_produccion, unidades, unidades_nivel, estado` de
 * sus herramientas, más `CUADRO_VIGENTE`
 */
const cargarContexto = cache(async (consultorId: string): Promise<{ contexto: ContextoReglas; deSerie: DeSerie }> => {
  const supabase = await baseDeDatos();
  const [companias, cierres, niveles, ajustes, herramientas] = await Promise.all([
    todas<{ codigo: string; nombre: string; regla: ReglaCompania; calendario: Exclude<Calendario, "RANKING"> | null; pct_hucha: Numerico; meses_hasta_cobro: number | null }>(
      (desde, hasta) =>
        supabase
          .from("consultoria_companias")
          .select("codigo, nombre, regla, calendario, pct_hucha, meses_hasta_cobro")
          .eq("consultor_id", consultorId)
          .order("codigo")
          .range(desde, hasta),
      "las compañías",
    ),
    todas<{ mes: string; calendario: Calendario; confirmar_hasta: string; incidencias_hasta: string | null }>(
      (desde, hasta) =>
        supabase
          .from("consultoria_cierres")
          .select("mes, calendario, confirmar_hasta, incidencias_hasta")
          .eq("consultor_id", consultorId)
          .order("mes")
          .order("calendario")
          .range(desde, hasta),
      "los cierres",
    ),
    todas<{ nombre: string; valor_unidad: Numerico; desde_unidades: Numerico; desde_mes: string | null }>(
      (desde, hasta) =>
        supabase
          .from("consultoria_niveles")
          .select("nombre, valor_unidad, desde_unidades, desde_mes")
          .eq("consultor_id", consultorId)
          .order("valor_unidad")
          .order("nombre")
          .range(desde, hasta),
      "los niveles",
    ),
    todas<{ unidades_previas: Numerico; pct_hucha: Numerico; pct_irpf: Numerico }>(
      (desde, hasta) =>
        supabase
          .from("consultoria_ajustes")
          .select("unidades_previas, pct_hucha, pct_irpf")
          .eq("consultor_id", consultorId)
          .range(desde, hasta),
      "los ajustes",
    ),
    todas<{ mes_produccion: string; unidades: Numerico; unidades_nivel: Numerico; estado: EstadoHerramienta }>(
      (desde, hasta) =>
        supabase
          .from("consultoria_herramientas")
          .select("mes_produccion, unidades, unidades_nivel, estado")
          .eq("consultor_id", consultorId)
          .order("mes_produccion")
          .order("id")
          .range(desde, hasta),
      "las unidades de las herramientas",
    ),
  ]);

  const fila = ajustes[0];
  return {
    deSerie: { companias: companias.length === 0, niveles: niveles.length === 0, ajustes: !fila },
    contexto: {
      cuadro: CUADRO_VIGENTE,
      companias: companias.length
        ? companias.map<DatosCompania>((c) => ({
            codigo: c.codigo,
            nombre: c.nombre,
            regla: c.regla,
            calendario: c.calendario,
            pctHucha: numeroONulo(c.pct_hucha),
            mesesHastaCobro: numeroONulo(c.meses_hasta_cobro),
          }))
        : COMPANIAS_DE_SERIE,
      cierres: cierres.map<Cierre>((c) => ({
        mes: c.mes,
        calendario: c.calendario,
        confirmarHasta: c.confirmar_hasta,
        incidenciasHasta: c.incidencias_hasta,
      })),
      niveles: niveles.length
        ? niveles.map<Nivel>((n) => ({
            nombre: n.nombre,
            valorUnidad: numero(n.valor_unidad),
            desdeUnidades: numeroONulo(n.desde_unidades),
            desdeMes: n.desde_mes,
          }))
        : NIVELES_DE_SERIE,
      // `pct_hucha` y `pct_irpf` son not null en la tabla: un 0 llega como 0
      ajustes: fila
        ? { unidadesPrevias: numero(fila.unidades_previas), pctHucha: numero(fila.pct_hucha), pctIrpf: numero(fila.pct_irpf) }
        : AJUSTES_DE_SERIE,
      herramientas: herramientas.map((h) => ({
        mesProduccion: h.mes_produccion,
        unidades: numero(h.unidades),
        unidadesNivel: numeroONulo(h.unidades_nivel),
        estado: h.estado,
      })),
    },
  };
});

/**
 * Todos los meses de cobro en orden, con la cuenta de comisiones encima (el saldo de un mes viene de
 * todos los anteriores, también de otros años), sus líneas y los movimientos de la cuenta
 */
const cargarMeses = cache(
  async (consultorId: string): Promise<{ meses: MesLiquidacion[]; lineas: LineaLiquidacion[]; cuenta: MovimientoDeCuenta[]; sinMes: number }> => {
    const supabase = await baseDeDatos();
    const [filasMes, filasLinea, filasCuenta] = await Promise.all([
      todas<FilaMes>(
        (desde, hasta) =>
          supabase
            .from("consultoria_liquidaciones_por_mes")
            .select("mes, unidades, neto_previsto, liquidacion_id, numero, fecha, importe_recibido")
            .eq("consultor_id", consultorId)
            .order("mes")
            .range(desde, hasta),
        "las liquidaciones",
      ),
      todas<FilaLinea>(
        (desde, hasta) =>
          supabase
            .from("consultoria_lineas")
            .select(
              "herramienta_id, cliente_id, cliente, compania, producto, mes, fecha_cobro, estado, liquidacion_id, cobrada, prevista, unidades, bruto, hucha, pct_irpf, aportacion_de",
            )
            .eq("consultor_id", consultorId)
            .order("mes")
            .order("herramienta_id")
            .range(desde, hasta),
        "las líneas de las liquidaciones",
      ),
      todas<FilaMovimientoCuenta>(
        (desde, hasta) =>
          supabase
            .from("consultoria_cuenta_movimientos")
            .select("fecha, concepto, importe, liquidacion_id, aplicado, mes_previsto, cargo_id, extorno_id, cliente")
            .eq("consultor_id", consultorId)
            .order("fecha")
            .order("cargo_id")
            .order("extorno_id")
            .range(desde, hasta),
        "la cuenta de comisiones",
      ),
    ]);

    const mesDeLaLiquidacion = new Map(
      filasMes.filter((f) => f.liquidacion_id).map((f) => [f.liquidacion_id as string, f.mes]),
    );
    const lineas = filasLinea.map<LineaLiquidacion>((l) => ({
      herramientaId: l.herramienta_id,
      clienteId: l.cliente_id,
      cliente: l.cliente,
      compania: l.compania,
      producto: l.producto,
      estado: l.estado,
      mes: l.mes,
      fechaCobro: l.fecha_cobro,
      liquidacionId: l.liquidacion_id,
      cobrada: l.cobrada,
      prevista: l.prevista,
      unidades: numero(l.unidades),
      bruto: numero(l.bruto),
      hucha: numero(l.hucha),
      pctIrpf: numero(l.pct_irpf),
      aportacionDe: l.aportacion_de,
    }));
    const cuenta = filasCuenta.map<MovimientoDeCuenta>((c) => ({
      fecha: c.fecha,
      concepto: c.concepto,
      importe: numero(c.importe),
      aplicado: c.aplicado,
      mes: c.liquidacion_id ? (mesDeLaLiquidacion.get(c.liquidacion_id) ?? null) : null,
      mesPrevisto: c.mes_previsto,
      liquidacionId: c.liquidacion_id,
      cargoId: c.cargo_id,
      extornoId: c.extorno_id,
      cliente: c.cliente,
    }));

    const { meses, sinMes } = mesesDeLiquidacion({
      lineas,
      // Aplicado: en el mes de su liquidación. Si no: el resto de un extorno, en el previsto; un cargo, en la siguiente que llegue
      cargos: cuenta.map((c) => ({ importe: c.importe, mes: c.aplicado ? c.mes : c.mesPrevisto, aplicado: c.aplicado })),
      llegadas: [...mesDeLaLiquidacion.values()],
      meses: filasMes.map((f) => f.mes),
      minimoTransferencia: CUADRO_VIGENTE.minimoTransferencia,
    });

    const filaDe = new Map(filasMes.map((f) => [primerDiaDelMes(f.mes), f]));
    // El recuento sale de las líneas y no de la vista, que cuenta líneas: una APEX va con su herramienta
    const lineasDe = new Map<string, LineaLiquidacion[]>();
    for (const linea of lineas) {
      const mes = primerDiaDelMes(linea.mes);
      lineasDe.set(mes, [...(lineasDe.get(mes) ?? []), linea]);
    }
    return {
      lineas,
      cuenta,
      sinMes,
      meses: meses.map<MesLiquidacion>((m) => {
        const fila = filaDe.get(m.mes);
        const recuento = recuentoDelMes(lineasDe.get(m.mes) ?? []);
        return {
          mes: m.mes,
          liquidacionId: fila?.liquidacion_id ?? null,
          numero: fila?.numero ?? null,
          fecha: fila?.fecha ?? null,
          herramientas: recuento.herramientas,
          apex: recuento.apex,
          previstas: recuento.previstas,
          unidades: numero(fila?.unidades),
          liquidacion: m.liquidacion,
          saldoAnterior: m.paso.saldoAnterior,
          aPagar: m.paso.aPagar,
          saldoDespues: m.paso.saldoDespues,
          importeRecibido: numeroONulo(fila?.importe_recibido),
          pendiente: m.pendiente,
          netoPrevisto: numero(fila?.neto_previsto),
        };
      }),
    };
  },
);

/** En un mismo día, primero el saldo de partida y lo que entra con la liquidación */
const ORDEN_EN_EL_DIA: Record<MovimientoDeHucha["tipo"], number> = { inicial: 0, liquidacion: 1, extorno: 2, reclamacion: 3, ajuste: 4 };

async function leerHucha(consultorId: string): Promise<MovimientoDeHucha[]> {
  const supabase = await baseDeDatos();
  const filas = await todas<FilaHucha>(
    (desde, hasta) =>
      supabase
        .from("consultoria_hucha_movimientos")
        .select("fecha, tipo, importe, irpf, liquidacion_id, extorno_id, movimiento_id, cliente, notas")
        .eq("consultor_id", consultorId)
        .order("fecha")
        .order("tipo")
        .order("liquidacion_id")
        .order("extorno_id")
        .order("movimiento_id")
        .range(desde, hasta),
    "la hucha",
  );
  const ordenadas = [...filas].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || ORDEN_EN_EL_DIA[a.tipo] - ORDEN_EN_EL_DIA[b.tipo],
  );
  const conSigno = ordenadas.map((f) => ({ fecha: f.fecha, importe: numero(f.importe) }));
  return ordenadas.map<MovimientoDeHucha>((f, i) => ({
    fecha: f.fecha,
    tipo: f.tipo,
    importe: conSigno[i].importe,
    irpf: numero(f.irpf),
    saldo: saldoDeHucha(conSigno.slice(0, i + 1)),
    liquidacionId: f.liquidacion_id,
    extornoId: f.extorno_id,
    movimientoId: f.movimiento_id,
    cliente: f.cliente,
    notas: f.notas,
  }));
}

/** El libro de la hucha, con el saldo tras cada movimiento */
const cargarHucha = cache(leerHucha);

const cargarExtornos = cache(async (consultorId: string): Promise<Map<string, Extorno>> => {
  const supabase = await baseDeDatos();
  const filas = await todas<FilaExtorno>(
    (desde, hasta) =>
      supabase
        .from("consultoria_extornos")
        .select("id, herramienta_id, fecha, importe, de_hucha, resto, resto_cobro, liquidacion_id, irpf_hucha, irpf_resto, notas")
        .eq("consultor_id", consultorId)
        .order("fecha")
        .order("id")
        .range(desde, hasta),
    "los extornos",
  );
  return new Map(
    filas.map((e) => [
      e.herramienta_id,
      {
        id: e.id,
        herramientaId: e.herramienta_id,
        fecha: e.fecha,
        importe: numero(e.importe),
        deHucha: numero(e.de_hucha),
        resto: numero(e.resto),
        restoCobro: e.resto_cobro,
        aplicado: e.liquidacion_id !== null,
        liquidacionId: e.liquidacion_id,
        irpfHucha: numero(e.irpf_hucha),
        irpfResto: numero(e.irpf_resto),
        notas: e.notas,
      },
    ]),
  );
});

// ---------------------------------------------------------------------------------------------
// De filas a lo que ve la pantalla
// ---------------------------------------------------------------------------------------------

function herramientaDeFila(f: FilaHerramienta, extorno: Extorno | null): Herramienta {
  const cliente = Array.isArray(f.cliente) ? f.cliente[0] : f.cliente;
  // El plazo del producto en el cuadro; si no está o no lo dice, el de siempre (48 meses, el de serie de finDelExtorno)
  const plazo = productoDelCuadro(f.compania, f.producto, f.periodicidad, CUADRO_VIGENTE)?.extorno?.meses;
  return {
    id: f.id,
    clienteId: f.cliente_id,
    cliente: cliente?.nombre ?? "",
    compania: f.compania,
    producto: f.producto,
    pago: f.pago,
    periodicidad: f.periodicidad,
    tipoComision: f.tipo_comision,
    aportacion: numeroONulo(f.aportacion),
    duracionAnios: f.duracion_anios,
    propio: f.propio,
    unidades: numero(f.unidades),
    unidadesNivel: numeroONulo(f.unidades_nivel),
    valorUnidad: numero(f.valor_unidad),
    pctHucha: numero(f.pct_hucha),
    pctIrpf: numero(f.pct_irpf),
    fechaConfirmacion: f.fecha_confirmacion,
    mesProduccion: f.mes_produccion,
    fechaEfecto: f.fecha_efecto,
    fechaCobro: f.fecha_cobro,
    estado: f.estado,
    fechasProvisionales: f.fechas_provisionales,
    liquidada: f.liquidacion_id !== null,
    liquidacionId: f.liquidacion_id,
    anuladaEl: f.anulada_el,
    extorno,
    bruto: numero(f.bruto),
    hucha: numero(f.hucha),
    irpf: numero(f.irpf),
    neto: numero(f.neto),
    notas: f.notas,
    procedencia: f.origen?.startsWith("nota:") ? "nota" : f.origen?.startsWith("ovb:") ? "historico" : null,
    libreDeExtornoEl: f.estado === "anulada" && f.liquidacion_id === null ? null : finDelExtorno(f.fecha_efecto, plazo),
    aportacionDe: f.aportacion_de,
    // El producto de la madre lo pone `leerHerramientas`, que la busca si no está entre las leídas
    de: null,
  };
}

function clienteDeFila(f: FilaCliente): ClienteDeLaLista {
  return {
    id: f.id,
    nombre: f.nombre,
    referencia: f.referencia,
    proximaRevision: f.proxima_revision,
    herramientas: numero(f.herramientas),
    previstas: numero(f.previstas),
    aportacionMensual: numero(f.aportacion_mensual),
    aportacionUnica: numero(f.aportacion_unica),
    generadoBruto: numero(f.generado_bruto),
  };
}

/** Lo que pasa de la última liquidación que ha llegado a la siguiente */
function saldoDeLaCuenta(meses: MesLiquidacion[]): number {
  return meses.filter((m) => m.liquidacionId).at(-1)?.saldoDespues ?? 0;
}

/** Cargos, abonos y restos de extornos aún sin aplicar */
function sinAplicar(cuenta: MovimientoDeCuenta[]): number {
  return sumarEuros(cuenta.filter((c) => !c.aplicado).map((c) => c.importe));
}

/** La reserva de todo lo que aún no ha llegado: la RC de sus líneas, con la cuenta de la liquidación */
function reservaPorEntrar(lineas: LineaLiquidacion[]): number {
  return calcularLiquidacion(lineas.filter((l) => !l.cobrada)).rc;
}

function nivelDe(contexto: ContextoReglas, mesActual: string): ResumenConsultoria["nivel"] {
  const mesQueViene = sumarMeses(mesActual, 1);
  const esteMes = valorUnidadDelMes(mesActual, contexto);
  // El de la producción del mes que viene sale de las unidades hasta este mes: es el alcanzado
  const alcanzado = valorUnidadDelMes(mesQueViene, contexto);
  const unidades = unidadesAcumuladas(mesActual, contexto);

  const ultimoMes = contexto.herramientas.reduce(
    (ultimo, h) => (primerDiaDelMes(h.mesProduccion) > ultimo ? primerDiaDelMes(h.mesProduccion) : ultimo),
    mesActual,
  );
  const centesimas = (valor: number) => Math.round(valor * 100);
  const previstas =
    centesimas(unidadesAcumuladas(ultimoMes, contexto, { conPrevistas: true })) - centesimas(unidadesAcumuladas(ultimoMes, contexto));

  const niveles = contexto.niveles.length > 0 ? contexto.niveles : contexto.cuadro.niveles;
  const siguiente =
    [...niveles]
      .filter((n) => centesimas(n.valorUnidad) > centesimas(alcanzado.valorUnidad))
      .sort((a, b) => a.valorUnidad - b.valorUnidad)[0] ?? null;
  const cambia = esteMes.nivel !== alcanzado.nivel || centesimas(esteMes.valorUnidad) !== centesimas(alcanzado.valorUnidad);

  return {
    nombre: alcanzado.nivel,
    valorUnidad: alcanzado.valorUnidad,
    unidades,
    unidadesPrevistas: previstas === 0 ? 0 : previstas / 100,
    esteMes: { nombre: esteMes.nivel, valorUnidad: esteMes.valorUnidad },
    siguiente: siguiente
      ? {
          nombre: siguiente.nombre,
          valorUnidad: siguiente.valorUnidad,
          faltan:
            siguiente.desdeUnidades === null
              ? null
              : Math.max(0, centesimas(siguiente.desdeUnidades) - centesimas(unidades)) / 100,
        }
      : null,
    cambiaEl: cambia ? { mes: mesQueViene, nombre: alcanzado.nivel, valorUnidad: alcanzado.valorUnidad } : null,
    avisos: alcanzado.avisos,
  };
}

/** Del primer mes con algo al último con algo previsto (o, si no hay nada previsto, al último), como mucho 12 */
function barrasDe(meses: MesLiquidacion[]): BarraDelResumen[] {
  if (meses.length === 0) return [];
  const porLlegar = meses.filter((m) => !m.liquidacionId);
  const ultimo = (porLlegar.at(-1) ?? meses[meses.length - 1]).mes;
  const lista: string[] = [];
  for (let mes = meses[0].mes; mes <= ultimo; mes = sumarMeses(mes, 1)) lista.push(mes);

  const delMes = new Map(meses.map((m) => [m.mes, m]));
  return lista.slice(-12).map<BarraDelResumen>((mes) => {
    const m = delMes.get(mes);
    if (!m) return { mes, valor: 0 };
    const sinTransferencia =
      m.aPagar === 0
        ? m.saldoDespues === 0
          ? "Sin transferencia"
          : `Sin transferencia: el saldo de ${euros(m.saldoDespues)} pasa a la siguiente`
        : undefined;
    if (m.liquidacionId) {
      return { mes, valor: m.importeRecibido ?? m.aPagar, ...(sinTransferencia ? { detalle: sinTransferencia } : {}) };
    }
    return { mes, valor: 0, previsto: m.aPagar, ...(sinTransferencia ? { detalle: `${sinTransferencia} (previsto)` } : {}) };
  });
}

// ---------------------------------------------------------------------------------------------
// Las consultas de las pantallas
// ---------------------------------------------------------------------------------------------

/**
 * El contexto de las reglas, para `proponerFirma` en el navegador (Nueva firma) y para las acciones.
 * `deSerie.companias`: el consultor no tiene compañías guardadas, y sin ellas no se puede guardar
 * ninguna firma (la FK lo impide)
 */
export async function contextoDeReglas(consultorId: string): Promise<ContextoConsultoria> {
  return conPendiente(
    () => cargarContexto(consultorId),
    () => ({ contexto: contextoDeSerie(), deSerie: TODO_DE_SERIE }),
  );
}

/** El libro de la hucha, por fecha, con el saldo tras cada movimiento, y lo que entrará con lo que aún no ha llegado */
export async function movimientosDeHucha(consultorId: string): Promise<HuchaConsultoria> {
  return conPendiente(
    async () => {
      const [movimientos, { lineas }] = await Promise.all([cargarHucha(consultorId), cargarMeses(consultorId)]);
      return { movimientos, saldo: saldoDeHucha(movimientos), porEntrar: reservaPorEntrar(lineas) };
    },
    () => ({ movimientos: [], saldo: 0, porEntrar: 0 }),
  );
}

/**
 * El saldo de la hucha ahora mismo, sin memorizar: para que una acción avise si, después de
 * escribir, ha quedado en negativo. Null si no se puede leer (el aviso no es imprescindible)
 */
export async function saldoDeHuchaAhora(consultorId: string): Promise<number | null> {
  try {
    return saldoDeHucha(await leerHucha(consultorId));
  } catch {
    return null;
  }
}

/** La cuenta de comisiones: sus cargos y abonos y los restos de extornos, por fecha, y su saldo */
export async function cuentaDeComisionesDe(consultorId: string): Promise<CuentaConsultoria> {
  return conPendiente(
    async () => {
      const { meses, cuenta } = await cargarMeses(consultorId);
      return { movimientos: cuenta, saldo: saldoDeLaCuenta(meses), cargosSinAplicar: sinAplicar(cuenta) };
    },
    () => ({ movimientos: [], saldo: 0, cargosSinAplicar: 0 }),
  );
}

const RESUMEN_VACIO = (): ResumenConsultoria => ({
  esteMes: null,
  siguiente: null,
  hucha: { saldo: 0, porEntrar: 0, retenidaEsteAnio: 0 },
  cuenta: { saldo: 0, cargosSinAplicar: 0 },
  nivel: {
    nombre: "",
    valorUnidad: 0,
    unidades: 0,
    unidadesPrevistas: 0,
    esteMes: { nombre: "", valorUnidad: 0 },
    siguiente: null,
    cambiaEl: null,
    avisos: [],
  },
  proximosCierres: [],
  faltanCierresDe: null,
  barras: [],
});

/** El Resumen: este mes y el siguiente, la hucha, la cuenta, el nivel, los próximos cierres y las barras. `hoy`, de `hoyEnMadrid()` */
export async function resumenConsultoria(consultorId: string, hoy: string): Promise<ResumenConsultoria & ConPendiente> {
  return conPendiente(async () => {
    const [{ contexto }, { meses, lineas, cuenta }, hucha] = await Promise.all([
      cargarContexto(consultorId),
      cargarMeses(consultorId),
      cargarHucha(consultorId),
    ]);
    const mesActual = primerDiaDelMes(hoy);
    const anio = `${mesActual.slice(0, 4)}-`;
    const sinCierres = [mesActual, sumarMeses(mesActual, 1)].find(
      (mes) => !contexto.cierres.some((c) => primerDiaDelMes(c.mes) === mes),
    );
    return {
      esteMes: meses.find((m) => m.mes === mesActual) ?? null,
      siguiente: meses.find((m) => m.mes > mesActual) ?? null,
      hucha: {
        saldo: saldoDeHucha(hucha),
        porEntrar: reservaPorEntrar(lineas),
        retenidaEsteAnio: sumarEuros(hucha.filter((m) => m.tipo === "liquidacion" && m.fecha.startsWith(anio)).map((m) => m.importe)),
      },
      cuenta: { saldo: saldoDeLaCuenta(meses), cargosSinAplicar: sinAplicar(cuenta) },
      nivel: nivelDe(contexto, mesActual),
      proximosCierres: proximosCierres(contexto.cierres, hoy, 4),
      faltanCierresDe: sinCierres ? Number(sinCierres.slice(0, 4)) : null,
      barras: barrasDe(meses),
    };
  }, RESUMEN_VACIO);
}

async function leerClientes(consultorId: string, clienteId?: string): Promise<FilaCliente[]> {
  const supabase = await baseDeDatos();
  const filas = await todas<FilaCliente>((desde, hasta) => {
    const consulta = supabase.from("consultoria_clientes_resumen").select(COLUMNAS_CLIENTE).eq("consultor_id", consultorId);
    return (clienteId ? consulta.eq("id", clienteId) : consulta).order("nombre").order("id").range(desde, hasta);
  }, "los clientes");
  return filas.sort(porNombre);
}

/** La cartera, por nombre, para la lista (con su buscador sobre lo cargado) y para elegir el cliente de una firma */
export async function clientesConsultoria(consultorId: string): Promise<{ clientes: ClienteDeLaLista[] } & ConPendiente> {
  return conPendiente(
    async () => ({ clientes: (await leerClientes(consultorId)).map(clienteDeFila) }),
    () => ({ clientes: [] }),
  );
}

type ColumnaDeFiltro = "id" | "cliente_id" | "mes_produccion" | "compania" | "estado" | "aportacion_de";

/** Identificadores por petición al buscar con `in`: la URL no crece sin límite */
const POR_TANDA = 200;

/**
 * Las herramientas del consultor con esas columnas iguales, de la más nueva a la más antigua, con su
 * extorno y, si son una APEX, la herramienta de la que cuelgan (`de`): de entre las leídas o, si no
 * está, con una consulta más (con `in`, en tandas)
 */
async function leerHerramientas(consultorId: string, iguales: Partial<Record<ColumnaDeFiltro, string | null>> = {}): Promise<Herramienta[]> {
  const supabase = await baseDeDatos();
  const [filas, extornos] = await Promise.all([
    todas<FilaHerramienta>((desde, hasta) => {
      let consulta = supabase.from("consultoria_herramientas").select(COLUMNAS_HERRAMIENTA).eq("consultor_id", consultorId);
      for (const [columna, valor] of Object.entries(iguales)) if (valor) consulta = consulta.eq(columna, valor);
      return consulta
        .order("mes_produccion", { ascending: false })
        .order("fecha_efecto", { ascending: false })
        .order("id")
        .range(desde, hasta);
    }, "las herramientas"),
    cargarExtornos(consultorId),
  ]);
  const herramientas = filas.map((f) => herramientaDeFila(f, extornos.get(f.id) ?? null));

  const productoDe = new Map(herramientas.map((h) => [h.id, h.producto]));
  const faltan = [...new Set(herramientas.flatMap((h) => (h.aportacionDe && !productoDe.has(h.aportacionDe) ? [h.aportacionDe] : [])))];
  for (let i = 0; i < faltan.length; i += POR_TANDA) {
    const { data, error } = await supabase
      .from("consultoria_herramientas")
      .select("id, producto")
      .eq("consultor_id", consultorId)
      .in("id", faltan.slice(i, i + POR_TANDA));
    comprobar(error, "las herramientas de las aportaciones extraordinarias");
    for (const madre of data ?? []) productoDe.set(madre.id as string, madre.producto as string);
  }
  return herramientas.map((h) => {
    const producto = h.aportacionDe ? productoDe.get(h.aportacionDe) : undefined;
    return h.aportacionDe && producto !== undefined ? { ...h, de: { id: h.aportacionDe, producto } } : h;
  });
}

/** De la más antigua a la más nueva: así se leen las APEX de una herramienta */
function porFecha(a: Herramienta, b: Herramienta): number {
  return a.fechaEfecto.localeCompare(b.fechaEfecto) || a.mesProduccion.localeCompare(b.mesProduccion) || a.id.localeCompare(b.id);
}

/**
 * Las herramientas madre, en el orden en que llegan, cada una con sus APEX dentro (de la más antigua a
 * la más nueva). Una APEX cuya madre no está entre ellas sale suelta, como una herramienta más, para
 * no perderla de vista (no debería pasar: la madre es siempre del mismo cliente)
 */
function conSusAportaciones(herramientas: Herramienta[]): HerramientaConAportaciones[] {
  const ids = new Set(herramientas.map((h) => h.id));
  const deCadaUna = new Map<string, Herramienta[]>();
  for (const h of herramientas) {
    if (!h.aportacionDe || !ids.has(h.aportacionDe)) continue;
    deCadaUna.set(h.aportacionDe, [...(deCadaUna.get(h.aportacionDe) ?? []), h]);
  }
  return herramientas
    .filter((h) => !h.aportacionDe || !ids.has(h.aportacionDe))
    .map((h) => ({ ...h, aportaciones: [...(deCadaUna.get(h.id) ?? [])].sort(porFecha) }));
}

/**
 * Un cliente con sus datos, lo generado y sus herramientas madre, cada una con su extorno (si lo
 * tiene) y sus APEX dentro. Null si no está
 */
export async function fichaDeCliente(consultorId: string, clienteId: string): Promise<{ ficha: FichaCliente | null } & ConPendiente> {
  return conPendiente(
    async () => {
      // Un id que no es un uuid (de la URL) no llega a la base de datos: daría un error, no un «no está»
      if (!esUuid(clienteId)) return { ficha: null };
      const [filas, herramientas] = await Promise.all([
        leerClientes(consultorId, clienteId),
        leerHerramientas(consultorId, { cliente_id: clienteId }),
      ]);
      const fila = filas[0];
      return { ficha: fila ? { cliente: { ...clienteDeFila(fila), notas: fila.notas }, herramientas: conSusAportaciones(herramientas) } : null };
    },
    () => ({ ficha: null }),
  );
}

const ESTADOS: EstadoHerramienta[] = ["prevista", "firmada", "confirmada", "incidencia", "cobrada", "anulada"];

/**
 * Las herramientas, con los filtros de la URL (lo que no se entiende se ignora) y sus totales: los
 * de producción (`unidadesNivel ?? unidades`), sin las anuladas ni los recibos de una comisión sobre
 * recibo (0 unidades para el nivel), y la comisión y la RC de todas las que cuentan. Una APEX sigue
 * en su fila (con `de`, la herramienta de la que cuelga), y en los totales va en `apex`, no en
 * `herramientas`; sus unidades sí suman, porque cuentan para el nivel
 */
export async function produccion(consultorId: string, filtros: FiltrosProduccion = {}): Promise<Produccion & ConPendiente> {
  return conPendiente(
    async () => {
      const mes = mesONulo(filtros.mes);
      const compania = typeof filtros.compania === "string" && /^[A-Za-z0-9_]{2,10}$/.test(filtros.compania.trim()) ? filtros.compania.trim().toUpperCase() : null;
      const estado = ESTADOS.find((e) => e === filtros.estado) ?? null;

      const [filas, { contexto }] = await Promise.all([
        leerHerramientas(consultorId, { mes_produccion: mes, compania, estado }),
        cargarContexto(consultorId),
      ]);

      const cuentan = filas.filter((h) => h.estado !== "anulada");
      const deProduccion = cuentan.filter((h) => (h.unidadesNivel ?? h.unidades) > 0);
      const apex = deProduccion.filter((h) => esApex(h)).length;
      return {
        filas,
        totales: {
          herramientas: deProduccion.length - apex,
          apex,
          unidades: sumarEuros(deProduccion.map((h) => h.unidadesNivel ?? h.unidades)),
          comision: sumarEuros(cuentan.map((h) => h.bruto)),
          rc: sumarEuros(cuentan.map((h) => h.hucha)),
          anuladas: filas.length - cuentan.length,
        },
        meses: [...new Set(contexto.herramientas.map((h) => primerDiaDelMes(h.mesProduccion)))].sort().reverse(),
      };
    },
    () => ({ filas: [], totales: { herramientas: 0, apex: 0, unidades: 0, comision: 0, rc: 0, anuladas: 0 }, meses: [] }),
  );
}

/**
 * Una herramienta, con su extorno si lo tiene, sus APEX (`aportaciones`, de la más antigua a la más
 * nueva) y, si es una APEX, la herramienta de la que cuelga (`de`). Null si no está
 */
export async function herramienta(
  consultorId: string,
  id: string,
): Promise<{ herramienta: HerramientaConAportaciones | null } & ConPendiente> {
  return conPendiente(
    async () => {
      if (!esUuid(id)) return { herramienta: null };
      const [[encontrada], aportaciones] = await Promise.all([
        leerHerramientas(consultorId, { id }),
        leerHerramientas(consultorId, { aportacion_de: id }),
      ]);
      return { herramienta: encontrada ? { ...encontrada, aportaciones: aportaciones.sort(porFecha) } : null };
    },
    () => ({ herramienta: null }),
  );
}

/** Los productos ya usados, sin repetir, para las sugerencias de Nueva firma (junto a los del cuadro) */
export async function productosUsados(consultorId: string): Promise<{ productos: ProductoUsado[] } & ConPendiente> {
  return conPendiente(
    async () => {
      const supabase = await baseDeDatos();
      const filas = await todas<ProductoUsado>(
        (desde, hasta) =>
          supabase
            .from("consultoria_herramientas")
            .select("compania, producto, periodicidad")
            .eq("consultor_id", consultorId)
            .order("producto")
            .order("id")
            .range(desde, hasta),
        "los productos",
      );
      const unicos = new Map(filas.map((f) => [`${f.compania}|${f.producto.trim()}|${f.periodicidad}`, { ...f, producto: f.producto.trim() }]));
      return {
        productos: [...unicos.values()].sort(
          (a, b) => a.producto.localeCompare(b.producto, "es", { sensitivity: "base" }) || a.compania.localeCompare(b.compania),
        ),
      };
    },
    () => ({ productos: [] }),
  );
}

/**
 * Los meses de cobro de un año, cada uno como el documento de OVB, con sus totales y los años que
 * hay. El saldo de la cuenta de cada mes sale de todos los anteriores, también de otros años
 */
export async function liquidaciones(consultorId: string, anio: number): Promise<LiquidacionesDelAnio> {
  return conPendiente(
    async () => {
      const [{ meses }, hucha, extornos] = await Promise.all([
        cargarMeses(consultorId),
        cargarHucha(consultorId),
        cargarExtornos(consultorId),
      ]);
      const prefijo = `${Math.trunc(anio)}-`;
      const delAnio = meses.filter((m) => m.mes.startsWith(prefijo));
      const llegaron = delAnio.filter((m) => m.liquidacionId);
      const reclamaciones = hucha.filter((m) => m.tipo === "reclamacion" && m.fecha.startsWith(prefijo));
      const reclamado = sumarEuros(reclamaciones.map((m) => -m.importe));
      const irpfReclamado = sumarEuros(reclamaciones.map((m) => m.irpf));
      const extornosDelAnio = [...extornos.values()].filter((e) => e.fecha.startsWith(prefijo));
      return {
        meses: delAnio,
        anio: {
          comision: sumarEuros(llegaron.map((m) => m.liquidacion.comision)),
          rc: sumarEuros(llegaron.map((m) => m.liquidacion.rc)),
          irpf: sumarEuros(llegaron.map((m) => m.liquidacion.irpf)),
          cargos: sumarEuros(llegaron.map((m) => m.liquidacion.cargos)),
          pagado: sumarEuros(llegaron.map((m) => m.importeRecibido ?? m.aPagar)),
          previsto: sumarEuros(delAnio.filter((m) => !m.liquidacionId).map((m) => m.aPagar)),
          irpfDeExtornos: sumarEuros(extornosDelAnio.flatMap((e) => [e.irpfHucha, e.irpfResto])),
          huchaReclamada: { importe: reclamado, irpf: irpfReclamado, neto: sumarEuros([reclamado, -irpfReclamado]) },
        },
        anios: [...new Set(meses.map((m) => Number(m.mes.slice(0, 4))))].sort((a, b) => a - b),
      };
    },
    () => ({
      meses: [],
      anio: { comision: 0, rc: 0, irpf: 0, cargos: 0, pagado: 0, previsto: 0, irpfDeExtornos: 0, huchaReclamada: { importe: 0, irpf: 0, neto: 0 } },
      anios: [],
    }),
  );
}

/**
 * Un mes por dentro: sus líneas y sus cargos. Si ha llegado, los aplicados en él (y lo que se quedó
 * sin aplicar con su mes); si no, lo que se puede marcar en «Ha llegado»: los cargos sin aplicar y
 * los restos de extornos previstos para él. `mes`: `AAAA-MM` o cualquier día del mes
 */
export async function lineasDelMes(consultorId: string, mes: string): Promise<DetalleDelMes> {
  return conPendiente(
    async () => {
      const clave = mesONulo(mes);
      if (!clave) return { mes: null, lineas: [], cargos: [] };
      const { meses, lineas, cuenta } = await cargarMeses(consultorId);
      const delMes = meses.find((m) => m.mes === clave) ?? null;
      const liquidacionId = delMes?.liquidacionId ?? null;
      return {
        mes: delMes,
        lineas: lineas.filter((l) => l.mes === clave),
        cargos: cuenta.filter((c) =>
          c.aplicado
            ? liquidacionId !== null && c.liquidacionId === liquidacionId
            : c.mesPrevisto === clave || (liquidacionId === null && c.cargoId !== null),
        ),
      };
    },
    () => ({ mes: null, lineas: [], cargos: [] }),
  );
}

/** Ajustes: unidades previas y porcentajes, niveles, compañías, los cierres cargados y el cuadro vigente (de solo lectura) */
export async function ajustesConsultoria(consultorId: string): Promise<AjustesConsultoria> {
  const cuadro = {
    version: CUADRO_VIGENTE.version,
    productos: CUADRO_VIGENTE.productos,
    minimoTransferencia: CUADRO_VIGENTE.minimoTransferencia,
    reserva: CUADRO_VIGENTE.reserva,
  };
  return conPendiente(
    async () => {
      const { contexto, deSerie } = await cargarContexto(consultorId);
      return {
        ajustes: contexto.ajustes,
        niveles: contexto.niveles,
        companias: contexto.companias,
        cierres: contexto.cierres,
        cuadro,
        deSerie,
      };
    },
    () => {
      const serie = contextoDeSerie();
      return { ajustes: serie.ajustes, niveles: serie.niveles, companias: serie.companias, cierres: [], cuadro, deSerie: TODO_DE_SERIE };
    },
  );
}
