"use server";

/**
 * Lo que escriben las pantallas de la consultoría (REQ-001; spec 4.2 de origen y 7.1 del panel). Entran
 * en la base con la clave secreta (`baseDeDatos()`), que se salta el RLS: lo que protege los datos es
 * la sesión del panel (ADR-002), y los disparadores protegen lo cobrado. Antes de escribir, cada acción:
 * - comprueba la sesión con `verificarSesion()` **fuera del `try`**: sin sesión lanza el `redirect`
 *   a `/login`, y un `catch` que se lo tragara diría «no se ha podido guardar». Por si acaso, el
 *   `catch` empieza con `unstable_rethrow`
 * - mira que la base esté lista y tenga consultor (`exigirConsultoria()`) y que **ya sea la fuente**:
 *   con `fuenteDesde` nulo (antes del cambio, spec 6.2) no escribe nada y lo dice. Todo lo que
 *   escribe lleva `consultor_id` y filtra por él, y las dos funciones reciben `p_consultor`
 * - valida todo lo que llega, aunque el formulario ya lo haya hecho (`validar.ts`)
 * - guarda **lo que se ha visto en pantalla**: no recalcula fechas ni €/unidad, y los importes los
 *   saca la base de datos (columnas generadas, ADR-003). **Un porcentaje 0 es un valor**: `??`
 * Reciben objetos tipados (los tipos, en `tipos.ts`), no `FormData`, y devuelven el `Resultado` de
 * siempre, con `id` al crear. Los errores, en español y sin detalles internos, que van al log del
 * servidor. Si algo se ha escrito, se revalida la sección entera.
 *
 * Ninguna cambia el `mes` de una liquidación: el disparador `consultoria_proteger_liquidacion` lo pararía.
 *
 * Una aportación extraordinaria (APEX) cuelga de su herramienta con `aportacion_de`:
 * `guardarFirma` la engancha o la desengancha (también en una cobrada: es solo el enlace), y la base
 * de datos comprueba que la madre es del mismo cliente y no es a su vez una APEX.
 *
 * Las comisiones recurrentes (REQ-002): una **serie** es la herramienta con `cuotas_cada_meses` y
 * `unidades_cuota`, y cada **cuota**, una fila más con `cuota_de` y `cuota_periodo`. Las cuotas las
 * crea `consultoria_programar_cuotas` de la 0002 con lo que calcula `cuotasQueFaltan` de `reglas.ts`
 * (el ayudante `programar`): al apuntar o cambiar una serie, después de «Ha llegado» y con
 * `programarCuotas`. No va en la misma transacción que lo demás: si falla, lo hecho queda bien, el
 * mensaje lo dice y relanzarlo no duplica. Anular una serie corta sus cuotas sin cobrar de los
 * periodos que empiezan después; borrarla borra antes sus cuotas, si ninguna se ha cobrado.
 */
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { baseDeDatos } from "@/lib/base/cliente";
import { nombreDelMes } from "@/lib/consultoria/calendario";
import { contextoDeReglas, saldoDeHuchaAhora } from "@/lib/consultoria/consultas";
import {
  AJUSTES_DE_SERIE,
  CUOTAS_CADA_MESES,
  cuotasQueFaltan,
  hoyEnMadrid,
  irpfDeReclamacion,
  nombreDelPeriodo,
  pctHuchaPara,
  ventanaDeProgramacion,
} from "@/lib/consultoria/reglas";
import type { CuotaDeLaSerie, CuotasCadaMeses, EstadoHerramienta, Nivel, Pago, Periodicidad, TipoComision } from "@/lib/consultoria/reglas";
import type {
  AjustesAGuardar,
  AnulacionAGuardar,
  CargoAGuardar,
  ClienteAGuardar,
  CompaniaAGuardar,
  ExtornoACambiar,
  ExtornoAGuardar,
  FirmaAGuardar,
  LiquidacionAGuardar,
  LiquidacionAMarcar,
  LoQueFalta,
  MovimientoDeHuchaAGuardar,
  Resultado,
  ResultadoConId,
} from "@/lib/consultoria/tipos";
import { exigirConsultoria } from "@/lib/consultoria/sesion";
import {
  DatoNoValido,
  MAXIMO,
  cantidad,
  cantidadONula,
  codigoDeCompania,
  enteroONulo,
  exigir,
  fecha,
  finDeMes,
  mes,
  porcentajeONulo,
  textoONulo,
  unoDe,
  unoDeLosNumeros,
  uuid,
  uuids,
  vacio,
} from "@/lib/consultoria/validar";
import { euros } from "@/lib/consultoria/formato";
import { verificarSesion } from "@/lib/sesion";

// ---------------------------------------------------------------------------------------------
// La sesión, los errores y la revalidación
// ---------------------------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof baseDeDatos>>;

interface Sesion {
  supabase: Supabase;
  consultorId: string;
}

interface ErrorDeSupabase {
  code?: string;
  message: string;
}

const MIGRACION = "Falta un paso en la base de datos: ejecuta la migración 0001 en Supabase.";
const MIGRACION_0002 = "Falta un paso en la base de datos: ejecuta la migración 0002 (las comisiones recurrentes) en Supabase.";
const NO_SE_HA_GUARDADO = "No se ha podido guardar. Vuelve a intentarlo dentro de un momento.";
/** Antes del cambio (spec 6.2): la fuente sigue siendo FSM-Finance y aquí no se guarda nada */
const AUN_EN_FSM_FINANCE = "La consultoría aún se lleva en FSM-Finance: el cambio no está hecho.";

/** Lo que trae la 0002: si el error de algo que no existe nombra una de estas, falta la 0002 */
const DE_LA_0002 = /cuotas_cada_meses|unidades_cuota|cuota_de|cuota_periodo|consultoria_programar_cuotas/;

/** Lo que dice una acción si la sección aún no puede enseñar nada (`exigirConsultoria()`) */
const PENDIENTE: Record<LoQueFalta, string> = {
  configuracion: "Falta configurar la base de datos del panel.",
  "0001": MIGRACION,
  "0002": MIGRACION_0002,
  copia: "La base nueva está vacía: copia antes los datos de FSM-Finance (consultoria:copiar).",
};

/** Para el log: solo el código y el mensaje, nunca `details` ni filas (spec 10) */
function paraElLog(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return `${typeof code === "string" && code ? code : "sin código"} ${typeof message === "string" ? message : "sin mensaje"}`;
}

/**
 * Con sesión, con la base lista y siendo ya la fuente, `hacer` como el consultor; y después, si
 * `hacer` ha terminado (haya escrito o no), la sección entera se vuelve a pintar. Un dato que no vale
 * devuelve su mensaje; cualquier otra cosa, el genérico
 */
async function comoConsultor<T extends Resultado>(hacer: (sesion: Sesion) => Promise<T>): Promise<T | Resultado> {
  // Fuera del `try`: sin sesión, su `redirect('/login')` es un error que el `catch` se tragaría
  await verificarSesion();
  try {
    const acceso = await exigirConsultoria();
    if ("pendiente" in acceso) return { error: PENDIENTE[acceso.falta] };
    if (!acceso.consultor.fuenteDesde) return { error: AUN_EN_FSM_FINANCE };
    const resultado = await hacer({ supabase: await baseDeDatos(), consultorId: acceso.consultor.id });
    // La sección está dentro del grupo `(panel)`: su layout se etiqueta con él (revalidatePath.md)
    revalidatePath("/(panel)/consultoria", "layout");
    return resultado;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DatoNoValido) return { error: error.message };
    console.error(`[consultoría] Error inesperado en una acción: ${paraElLog(error)}`);
    return { error: NO_SE_HA_GUARDADO };
  }
}

/** Lo que Postgres dice de cada restricción, en cristiano (las que el formulario no puede evitar del todo) */
const RESTRICCIONES: Record<string, string> = {
  consultoria_clientes_nombre_check: "El nombre del cliente va de 1 a 80 caracteres.",
  consultoria_clientes_referencia_check: "La referencia es de 40 caracteres como mucho.",
  consultoria_companias_codigo_check: "El código de la compañía va en mayúsculas, de 2 a 10 letras, números o «_».",
  consultoria_companias_calendario_segun_regla: "Una compañía sin calendario no lleva calendario de cierres, y las demás sí.",
  consultoria_herramientas_cobro_tras_efecto: "El cobro no puede ser antes del efecto.",
  consultoria_herramientas_con_unidades: "Las unidades tienen que ser mayores que cero.",
  consultoria_herramientas_cobrada_con_liquidacion: "Una herramienta se cobra al marcar su liquidación («Ha llegado»).",
  consultoria_herramientas_liquidada_cobrada_o_anulada: "Una herramienta que está en una liquidación solo puede estar cobrada o anulada.",
  consultoria_herramientas_anulada_con_fecha: "Una herramienta anulada lleva su fecha de anulación, y las demás no.",
  consultoria_herramientas_aportacion_unica:
    "Solo una aportación única puede ser aportación extraordinaria de otra herramienta, y nunca de sí misma.",
  consultoria_herramientas_serie:
    "Una serie cobra cada trimestre o cada semestre, con unidades por cuota mayores que cero, y solo en una comisión sobre recibo o sobre saldo. Ni una aportación extraordinaria ni una cuota son una serie.",
  consultoria_herramientas_cuota:
    "Una cuota lleva su herramienta y su periodo, unidades que cobrar y 0 para el nivel, y no es una aportación extraordinaria.",
  consultoria_extornos_de_hucha_hasta_importe: "Lo que cubre la hucha va de 0 al importe del extorno.",
  consultoria_extornos_resto_con_mes: "Si la hucha no cubre el extorno entero, di en qué liquidación se carga el resto.",
  consultoria_extornos_irpf_resto_hasta_resto: "El IRPF del resto va de 0 a lo que la hucha no cubre.",
  consultoria_hucha_inicial_positivo: "El saldo de partida de la hucha tiene que ser positivo.",
  consultoria_hucha_reclamacion_negativa: "Una reclamación saca dinero de la hucha.",
  consultoria_hucha_irpf_solo_en_reclamacion: "Solo una reclamación lleva IRPF.",
  consultoria_cuenta_concepto_check: "El concepto va de 1 a 120 caracteres.",
  consultoria_cuenta_importe_check: "El importe no puede ser 0.",
  consultoria_cierres_confirmar_en_su_mes: "El cierre tiene que caer dentro de su mes.",
};

function restriccionDe(error: ErrorDeSupabase): string | null {
  return /constraint "([^"]+)"/.exec(error.message)?.[1] ?? null;
}

/** Un mensaje de la base de datos tal cual (los de los disparadores y las funciones, en español), con su punto */
function conPunto(texto: string): string {
  const limpio = texto.trim();
  return /[.!?»)]$/.test(limpio) ? limpio : `${limpio}.`;
}

/**
 * El error de Supabase, para el usuario. `propios` lleva los de cada acción, por nombre de la
 * restricción o por código (`23505`, `23503`). Lo que no se reconoce va al log y sale el genérico
 */
function mensajeDe(error: ErrorDeSupabase, propios: Record<string, string> = {}): string {
  const codigo = error.code ?? "";
  const restriccion = restriccionDe(error);
  if (restriccion && propios[restriccion]) return propios[restriccion];
  if (propios[codigo]) return propios[codigo];
  // Lo que no existe: falta la 0002 si nombra lo suyo; si no, la 0001
  if (["42P01", "42703", "42883", "PGRST205", "PGRST204", "PGRST202"].includes(codigo)) {
    return DE_LA_0002.test(error.message ?? "") ? MIGRACION_0002 : MIGRACION;
  }
  if (codigo === "42501") return "Esto solo lo puede hacer el consultor.";
  // Los disparadores y las funciones de la 0001 dicen cuál, en español
  if (codigo === "P0001" || codigo === "P0002") return conPunto(error.message);
  if (codigo === "23514") return (restriccion && RESTRICCIONES[restriccion]) ?? "Algún dato no es válido. Revísalo y vuelve a intentarlo.";
  console.error(`[consultoría] Error al escribir: ${codigo || "sin código"} ${error.message}`);
  return NO_SE_HA_GUARDADO;
}

/** El mensaje de una acción que mueve la hucha, con un aviso si ha quedado en negativo (se avisa, no se impide) */
async function conAvisoDeHucha(ok: string, consultorId: string): Promise<string> {
  const saldo = await saldoDeHuchaAhora(consultorId);
  return saldo !== null && saldo < 0 ? `${ok} Ojo: la hucha queda en ${euros(saldo)}.` : ok;
}

async function contexto(consultorId: string) {
  const leido = await contextoDeReglas(consultorId);
  exigir(!leido.pendiente, MIGRACION);
  return leido;
}

const PAGOS: readonly Pago[] = ["domiciliacion", "transferencia"];
const PERIODICIDADES: readonly Periodicidad[] = ["mensual", "unica"];
const TIPOS_DE_COMISION: readonly TipoComision[] = ["anticipada", "anualizada", "sobre_recibo", "unica", "sobre_saldo"];
/** Los estados que se ponen al apuntar o cambiar una firma: cobrada y anulada tienen su camino */
const ESTADOS_DE_FIRMA: readonly EstadoHerramienta[] = ["prevista", "firmada", "confirmada", "incidencia"];
const NOTAS_LARGAS = "Las notas son de 500 caracteres como mucho.";

type Numerico = number | string | null;

/** Un `numeric` de PostgREST como `number` (0 si es nulo) */
const numero = (valor: unknown): number => (valor === null || valor === undefined ? 0 : Number(valor));
/** El mismo importe, unidades o porcentaje, en centésimas */
const mismaCantidad = (a: unknown, b: unknown): boolean => Math.round(numero(a) * 100) === Math.round(numero(b) * 100);
/** 3 o 6 de la base; otra cosa es «no es una serie» */
const comoCadaMeses = (valor: unknown): CuotasCadaMeses | null => (valor === 3 || valor === 6 ? valor : null);

/** Identificadores por petición al buscar con `in`, como en las consultas */
const POR_TANDA = 200;

/** Todas las filas, de mil en mil (el tope de Supabase por petición). La consulta tiene que llevar un orden que no empate */
async function leerTodas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: ErrorDeSupabase | null }>,
): Promise<{ filas: T[]; error: ErrorDeSupabase | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) return { filas, error };
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return { filas, error: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Las cuotas de las series (REQ-002)
// ---------------------------------------------------------------------------------------------

/** Una cuota que no se programa porque se cobraría antes de la última liquidación que llegó */
type SinProgramar = CuotaDeLaSerie & { cadaMeses: CuotasCadaMeses; producto: string };

interface Programadas {
  /** Las que ha creado la base (0 si ya estaban todas) */
  programadas: number;
  /** El cobro de las que se han mandado, en orden */
  cobros: string[];
  sinProgramar: SinProgramar[];
  /** Los textos de `cuotas_sin_programar` de `cuotasQueFaltan`, uno por serie */
  avisos: string[];
}

/**
 * Programa las cuotas que faltan de una serie (`herramientaId`) o de todas las que no están anuladas:
 * 1. Lee las series, los `cuota_periodo` de sus cuotas, la última liquidación (`max(mes)`) y el IRPF
 *    de Ajustes
 * 2. Calcula `cuotasQueFaltan`, de `desde` (el mes siguiente a esa liquidación) a `hasta` (el mes de
 *    hoy más `MESES_DE_CUOTAS_POR_DELANTE`)
 * 3. Llama a `consultoria_programar_cuotas` por cada serie con algo que guardar. Las listas van como los
 *    `uuid[]` de «Ha llegado»: un array de JSON es un array de Postgres
 * **No lanza nunca**: lo que falle vuelve como `{ error }`, con el mensaje para el usuario, para que
 * quien la llama después de haber guardado otra cosa no diga «no se ha podido guardar». Lo ya
 * programado se queda: relanzarla no duplica
 */
async function programar(
  supabase: Supabase,
  consultorId: string,
  opciones: { herramientaId?: string; hoy: string },
): Promise<Programadas | { error: string }> {
  try {
    const series = await leerTodas<{ id: string; producto: string; fecha_efecto: string; cuotas_cada_meses: number | null; unidades: Numerico }>(
      (desde, hasta) => {
        let consulta = supabase
          .from("consultoria_herramientas")
          .select("id, producto, fecha_efecto, cuotas_cada_meses, unidades")
          .eq("consultor_id", consultorId)
          .not("cuotas_cada_meses", "is", null)
          .neq("estado", "anulada");
        if (opciones.herramientaId) consulta = consulta.eq("id", opciones.herramientaId);
        return consulta.order("id").range(desde, hasta);
      },
    );
    if (series.error) return { error: mensajeDe(series.error) };
    const resultado: Programadas = { programadas: 0, cobros: [], sinProgramar: [], avisos: [] };
    if (series.filas.length === 0) return resultado;

    const guardadasDe = new Map<string, string[]>();
    const ids = series.filas.map((s) => s.id);
    for (let i = 0; i < ids.length; i += POR_TANDA) {
      const tanda = ids.slice(i, i + POR_TANDA);
      const cuotas = await leerTodas<{ cuota_de: string; cuota_periodo: string }>((desde, hasta) =>
        supabase
          .from("consultoria_herramientas")
          .select("cuota_de, cuota_periodo")
          .eq("consultor_id", consultorId)
          .in("cuota_de", tanda)
          .order("cuota_de")
          .order("cuota_periodo")
          .range(desde, hasta),
      );
      if (cuotas.error) return { error: mensajeDe(cuotas.error) };
      for (const c of cuotas.filas) guardadasDe.set(c.cuota_de, [...(guardadasDe.get(c.cuota_de) ?? []), c.cuota_periodo]);
    }

    const [ultima, ajustes] = await Promise.all([
      supabase.from("consultoria_liquidaciones").select("mes").eq("consultor_id", consultorId).order("mes", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("consultoria_ajustes").select("pct_irpf").eq("consultor_id", consultorId).maybeSingle(),
    ]);
    if (ultima.error) return { error: mensajeDe(ultima.error) };
    if (ajustes.error) return { error: mensajeDe(ajustes.error) };
    // `pct_irpf` es not null en la tabla: un 0 llega como 0. Sin fila, el de serie
    const pctIrpf = ajustes.data ? numero(ajustes.data.pct_irpf) : AJUSTES_DE_SERIE.pctIrpf;
    const ventana = ventanaDeProgramacion(opciones.hoy, (ultima.data?.mes as string | undefined) ?? null);

    for (const serie of series.filas) {
      const cadaMeses = comoCadaMeses(serie.cuotas_cada_meses);
      if (!cadaMeses) continue;
      const plan = cuotasQueFaltan(
        { fechaEfecto: serie.fecha_efecto, cuotasCadaMeses: cadaMeses, laFirmaCobraLaPrimera: numero(serie.unidades) > 0 },
        { ...ventana, guardadas: guardadasDe.get(serie.id) ?? [] },
      );
      resultado.sinProgramar.push(...plan.sinProgramar.map((c) => ({ ...c, cadaMeses, producto: serie.producto })));
      resultado.avisos.push(...plan.avisos.filter((a) => a.codigo === "cuotas_sin_programar").map((a) => a.texto));
      if (plan.cuotas.length === 0) continue;
      const { data, error } = await supabase.rpc("consultoria_programar_cuotas", {
        p_consultor: consultorId,
        p_herramienta: serie.id,
        p_periodos: plan.cuotas.map((c) => c.periodo),
        p_cobros: plan.cuotas.map((c) => c.fechaCobro),
        p_pct_irpf: pctIrpf,
      });
      if (error) return { error: mensajeDe(error) };
      resultado.programadas += numero(data);
      resultado.cobros.push(...plan.cuotas.map((c) => c.fechaCobro));
    }
    resultado.cobros.sort();
    return resultado;
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[consultoría] No se han podido programar las cuotas: ${paraElLog(error)}`);
    return { error: NO_SE_HA_GUARDADO };
  }
}

/** «octubre de 2026 y enero de 2027» */
function enLista(textos: string[]): string {
  return textos.length <= 1 ? (textos[0] ?? "") : `${textos.slice(0, -1).join(", ")} y ${textos[textos.length - 1]}`;
}

/** «Programadas 2 cuotas: octubre de 2026 y enero de 2027.»; sin ninguna, "" */
function textoDeProgramadas(r: Programadas): string {
  const n = r.programadas;
  if (n === 0) return "";
  const cuantas = n === 1 ? "Programada 1 cuota" : `Programadas ${n} cuotas`;
  // Si la base ha creado menos de las que se mandaron (otra llamada a la vez), sin la lista: no se sabe cuáles
  if (n !== r.cobros.length) return `${cuantas}.`;
  return `${cuantas}: ${enLista([...new Set(r.cobros.map(nombreDelMes))])}.`;
}

/** Los avisos de las que no se han programado, uno detrás de otro, con un espacio delante; sin ninguno, "" */
function textoDeSinProgramar(r: Programadas): string {
  return r.avisos.length ? ` ${r.avisos.join(" ")}` : "";
}

// ---------------------------------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------------------------------

/**
 * El estado que se guarda al cambiar una herramienta que ya está, y si deja de estar anulada.
 * `undefined` = no se toca. Para anular está `anularHerramienta`, y se cobra con «Ha llegado»
 */
function estadoAlCambiar(
  pedido: unknown,
  existente: { estado: EstadoHerramienta; liquidacion_id: string | null } | null,
): { estado?: EstadoHerramienta; anulada_el?: null } {
  const anulada = existente?.estado === "anulada";
  if (pedido === "anulada") {
    exigir(anulada, "Para anularla, usa «Anular».");
    return {};
  }
  if (existente?.liquidacion_id) {
    exigir(pedido === "cobrada", "Una herramienta cobrada solo cambia de estado al anularla o al deshacer su liquidación.");
    return anulada ? { estado: "cobrada", anulada_el: null } : {};
  }
  exigir(pedido !== "cobrada", "Una herramienta se cobra al marcar su liquidación («Ha llegado»).");
  const estado = unoDe(pedido, ESTADOS_DE_FIRMA, "Elige el estado: prevista, firmada, confirmada o con incidencia.");
  return anulada ? { estado, anulada_el: null } : { estado };
}

/** Lo que hace falta de la herramienta de la que cuelga una APEX */
interface Madre {
  cliente_id: string;
  compania: string;
  producto: string;
  pago: Pago;
  aportacion_de: string | null;
  cuota_de: string | null;
}

/** Lo que hace falta de una herramienta que ya está para cambiarla: su estado, lo cobrado y su serie */
const COLUMNAS_EXISTENTE =
  "estado, liquidacion_id, unidades, valor_unidad, pct_hucha, pct_irpf, fecha_cobro, fecha_efecto, aportacion_de, cuota_de, cuotas_cada_meses, unidades_cuota, compania, producto, pago, periodicidad, tipo_comision, duracion_anios, propio, fecha_confirmacion, mes_produccion, fechas_provisionales";

interface Existente {
  estado: EstadoHerramienta;
  liquidacion_id: string | null;
  unidades: Numerico;
  valor_unidad: Numerico;
  pct_hucha: Numerico;
  pct_irpf: Numerico;
  fecha_cobro: string;
  fecha_efecto: string;
  aportacion_de: string | null;
  cuota_de: string | null;
  cuotas_cada_meses: number | null;
  unidades_cuota: Numerico;
  compania: string;
  producto: string;
  pago: Pago;
  periodicidad: Periodicidad;
  tipo_comision: TipoComision;
  duracion_anios: number | null;
  propio: boolean;
  fecha_confirmacion: string | null;
  mes_produccion: string;
  fechas_provisionales: boolean;
}

/** Lo que una cuota copia de su serie al programarse y se le pone al día si cambia en la serie (sin cobrar) */
const COPIADO_DE_LA_SERIE = [
  "compania",
  "producto",
  "pago",
  "periodicidad",
  "tipo_comision",
  "duracion_anios",
  "propio",
  "valor_unidad",
  "pct_hucha",
  "fecha_confirmacion",
  "mes_produccion",
  "fechas_provisionales",
] as const satisfies readonly (keyof Existente)[];

const NUMERICAS: ReadonlySet<string> = new Set(["valor_unidad", "pct_hucha"]);

const ELIGE_CADA_CUANTO = "Elige cada cuánto cobra: trimestral o semestral.";

/**
 * Después de guardar una serie (REQ-002, spec 6.3), sus cuotas:
 * - si es nueva, o le cambian cada cuánto cobra o el efecto, se borran las que no se han cobrado y se
 *   vuelven a programar;
 * - si no, a las que no se han cobrado ni están anuladas se les pone al día lo que cambie: las unidades
 *   (si cambian las de cada cuota), el estado (prevista si lo está la serie; si no, confirmada) y lo que
 *   copian de ella (`COPIADO_DE_LA_SERIE`). El IRPF no: el de cada cuota es el de cuando se programó;
 * - y se programan las que falten, salvo si está anulada.
 * Devuelve lo programado, si algo ha fallado (lo guardado se queda: el botón de la herramienta lo
 * repite) y si se han rehecho sus cuotas (nueva, convertida, otro efecto o cada cuánto): solo entonces
 * se repiten en el mensaje las que no se han podido programar, que si no ya se avisaron
 */
async function ponerAlDiaLasCuotas(
  supabase: Supabase,
  consultorId: string,
  id: string,
  antes: Existente | null,
  ahora: { cadaMeses: CuotasCadaMeses; unidadesCuota: number; fechaEfecto: string; estado: EstadoHerramienta; copiado: Record<string, unknown> },
): Promise<{ programadas: Programadas | null; fallo: boolean; rehecha: boolean }> {
  const eraSerie = comoCadaMeses(antes?.cuotas_cada_meses);
  // Anulada no se rehace nada: las pendientes que quedan son las de los periodos de antes de anularla
  const rehacer =
    ahora.estado !== "anulada" && (!antes || eraSerie !== ahora.cadaMeses || antes.fecha_efecto !== ahora.fechaEfecto);
  const rehecha = rehacer;
  if (antes && eraSerie && rehacer) {
    const { error } = await supabase
      .from("consultoria_herramientas")
      .delete()
      .eq("consultor_id", consultorId)
      .eq("cuota_de", id)
      .is("liquidacion_id", null);
    if (error) {
      console.error(`[consultoría] No se han podido borrar las cuotas sin cobrar de una serie: ${paraElLog(error)}`);
      return { programadas: null, fallo: true, rehecha };
    }
  }
  if (antes && eraSerie && !rehacer) {
    const cambios: Record<string, unknown> = {};
    if (!mismaCantidad(antes.unidades_cuota, ahora.unidadesCuota)) cambios.unidades = ahora.unidadesCuota;
    if ((antes.estado === "prevista") !== (ahora.estado === "prevista")) cambios.estado = ahora.estado === "prevista" ? "prevista" : "confirmada";
    for (const columna of COPIADO_DE_LA_SERIE) {
      const nuevo = ahora.copiado[columna];
      if (nuevo === undefined) continue;
      const igual = NUMERICAS.has(columna) ? mismaCantidad(antes[columna], nuevo) : antes[columna] === nuevo;
      if (!igual) cambios[columna] = nuevo;
    }
    if (Object.keys(cambios).length > 0) {
      const { error } = await supabase
        .from("consultoria_herramientas")
        .update(cambios)
        .eq("consultor_id", consultorId)
        .eq("cuota_de", id)
        .is("liquidacion_id", null)
        .neq("estado", "anulada");
      if (error) {
        console.error(`[consultoría] No se han podido poner al día las cuotas de una serie: ${paraElLog(error)}`);
        return { programadas: null, fallo: true, rehecha };
      }
    }
  }
  if (ahora.estado === "anulada") return { programadas: null, fallo: false, rehecha };
  const programadas = await programar(supabase, consultorId, { herramientaId: id, hoy: hoyEnMadrid() });
  return "error" in programadas ? { programadas: null, fallo: true, rehecha } : { programadas, fallo: false, rehecha };
}

/**
 * Apuntar una firma nueva o cambiar una herramienta, con lo que se ha visto en pantalla. El mes de
 * producción va al día 1 y el cobro, al último día de su mes. Sin porcentajes, los del cuadro, la
 * compañía o Ajustes (0 vale). Con `clienteNuevo`, crea el cliente antes y, si la herramienta no se
 * guarda, lo borra. De una ya cobrada, la base de datos no deja cambiar unidades, €/unidad,
 * porcentajes ni el mes de cobro (lo dice su disparador).
 *
 * **Con `aportacionDe`** es una aportación extraordinaria (APEX) de esa herramienta: única, del mismo
 * cliente (si no viene, el suyo) y de la misma compañía; el producto y el pago, los que vengan o los
 * de la madre. Sin decir, el enlace no se toca; `null` lo quita. Cambiarlo no es tocar dinero: vale
 * también en una cobrada. Lo demás (que la madre no sea a su vez una APEX, que una herramienta con
 * APEX no pase a ser una) lo para también la base de datos, con su mensaje
 *
 * **De una cobrada** (está en una liquidación), sus unidades, su €/unidad, sus porcentajes y su cobro
 * se quedan como están: si no vienen, los guardados; si vienen iguales, no se escriben, y si vienen
 * distintos, la base de datos lo para con su mensaje. Así, convertir en serie el RC ya cobrado solo
 * toca la serie (REQ-002, sección 8)
 *
 * **Con `cuotasCadaMeses` y `unidadesCuota`** es una serie (REQ-002): solo sobre recibo o sobre saldo,
 * ni APEX ni cuota, y una nueva con 0 u para cobrar. Después de guardarla, `ponerAlDiaLasCuotas`
 */
export async function guardarFirma(firma: FirmaAGuardar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(firma && typeof firma === "object", "No sé qué firma guardar.");
    const id = vacio(firma.id) ? null : uuid(firma.id, "No sé qué herramienta cambiar.");
    const aportacionDe =
      firma.aportacionDe === undefined
        ? undefined
        : vacio(firma.aportacionDe)
          ? null
          : uuid(firma.aportacionDe, "No sé de qué herramienta es la aportación extraordinaria.");
    exigir(!id || aportacionDe !== id, "Una herramienta no puede ser aportación extraordinaria de sí misma.");

    // Lo que ya está: qué estado se puede poner, lo cobrado que no cambia y su serie
    let existente: Existente | null = null;
    if (id) {
      const { data, error } = await supabase
        .from("consultoria_herramientas")
        .select(COLUMNAS_EXISTENTE)
        .eq("id", id)
        .eq("consultor_id", consultorId)
        .maybeSingle();
      if (error) return { error: mensajeDe(error) };
      if (!data) return { error: "Esa herramienta ya no está." };
      existente = data as unknown as Existente;
    } else {
      exigir(firma.estado !== "anulada", "Una firma nueva no se apunta anulada.");
    }
    // De una cobrada no cambian sus unidades, su €/unidad, sus porcentajes ni su cobro (el disparador de la 0001)
    const cobrada = existente !== null && existente.liquidacion_id !== null;
    const esCuota = existente !== null && existente.cuota_de !== null;

    // La madre: suya, y que no sea a su vez una aportación (un solo nivel) ni una cuota
    let madre: Madre | null = null;
    if (aportacionDe) {
      const { data, error } = await supabase
        .from("consultoria_herramientas")
        .select("cliente_id, compania, producto, pago, aportacion_de, cuota_de")
        .eq("id", aportacionDe)
        .eq("consultor_id", consultorId)
        .maybeSingle();
      if (error) return { error: mensajeDe(error) };
      if (!data) return { error: "La herramienta de la que es aportación extraordinaria ya no está." };
      madre = data as Madre;
      exigir(!madre.aportacion_de, `«${madre.producto}» ya es una aportación extraordinaria: elige la herramienta de la que cuelga.`);
      exigir(!madre.cuota_de, `Eso es una cuota de «${madre.producto}»: una aportación extraordinaria va a la herramienta, no a una de sus cuotas.`);
    }

    const clienteId = vacio(firma.clienteId)
      ? (madre?.cliente_id ?? null)
      : uuid(firma.clienteId, "Elige un cliente o escribe el nombre del nuevo.");
    if (madre) {
      exigir(
        !vacio(firma.clienteId) || !firma.clienteNuevo || vacio(firma.clienteNuevo.nombre),
        "Una aportación extraordinaria es de un cliente que ya tiene la herramienta: elige ese cliente, no uno nuevo.",
      );
      exigir(clienteId === madre.cliente_id, "La aportación extraordinaria tiene que ser del mismo cliente que su herramienta.");
    }
    const nuevo =
      !clienteId && firma.clienteNuevo && typeof firma.clienteNuevo === "object"
        ? {
            nombre: textoONulo(firma.clienteNuevo.nombre, 80, "El nombre del cliente es de 80 caracteres como mucho."),
            referencia: textoONulo(firma.clienteNuevo.referencia, 40, "La referencia es de 40 caracteres como mucho: «ref. Marta»."),
          }
        : null;
    exigir(clienteId || nuevo?.nombre, "Elige un cliente o escribe el nombre del nuevo.");

    // Con madre, lo que no venga es lo suyo; la compañía, la misma
    const compania = madre && vacio(firma.compania) ? madre.compania : codigoDeCompania(firma.compania, "Elige la compañía.");
    if (madre) exigir(compania === madre.compania, `La aportación extraordinaria es de la misma compañía que su herramienta (${madre.compania}).`);
    const producto = madre && vacio(firma.producto) ? madre.producto : textoONulo(firma.producto, 60, "El producto es de 60 caracteres como mucho.");
    exigir(producto, "Escribe el producto.");
    const pago = madre && vacio(firma.pago) ? madre.pago : unoDe(firma.pago, PAGOS, "Elige cómo se paga el primer recibo: domiciliación o transferencia.");
    const periodicidad =
      madre && vacio(firma.periodicidad) ? "unica" : unoDe(firma.periodicidad, PERIODICIDADES, "Elige si la aportación es mensual o única.");
    if (madre) exigir(periodicidad === "unica", "Una aportación extraordinaria a otra herramienta es única, no mensual.");
    const tipoComision = unoDe(firma.tipoComision, TIPOS_DE_COMISION, "Elige el tipo de comisión.");
    const aportacion = cantidadONula(firma.aportacion, "La aportación tiene que ser mayor que cero.", { mayorQue: 0, maximo: MAXIMO.euros });
    const duracionAnios = enteroONulo(firma.duracionAnios, "La duración va de 1 a 99 años.", 1, 99);
    const propio = firma.propio === true;
    // De una cobrada, lo que no venga es lo guardado (no se recalcula: el disparador lo pararía)
    const loCobrado = cobrada ? existente : null;
    const unidades =
      loCobrado && vacio(firma.unidades)
        ? numero(loCobrado.unidades)
        : cantidad(firma.unidades, "Las unidades tienen que ser mayores que cero.", { minimo: 0, maximo: MAXIMO.unidades });
    const unidadesNivel = esCuota
      ? 0 // una cuota no cuenta para el nivel (el `check` de la 0002)
      : cantidadONula(firma.unidadesNivel, "Las unidades para el nivel no pueden ser negativas.", { minimo: 0, maximo: MAXIMO.unidades });
    // La firma de una sobre recibo o sobre saldo lleva 0 u que cobrar y las de producción para el nivel
    exigir(unidades > 0 || (unidadesNivel ?? 0) > 0, "Las unidades tienen que ser mayores que cero.");
    const valorUnidad =
      loCobrado && vacio(firma.valorUnidad)
        ? numero(loCobrado.valor_unidad)
        : cantidad(firma.valorUnidad, "Pon el €/unidad: tiene que ser mayor que cero.", { mayorQue: 0, maximo: MAXIMO.valorUnidad });
    const pctHuchaDado = porcentajeONulo(firma.pctHucha, "La reserva va del 0 al 100 %.") ?? (loCobrado ? numero(loCobrado.pct_hucha) : null);
    const pctIrpfDado = porcentajeONulo(firma.pctIrpf, "El IRPF va del 0 al 100 %.") ?? (loCobrado ? numero(loCobrado.pct_irpf) : null);
    const fechaConfirmacion = vacio(firma.fechaConfirmacion) ? null : fecha(firma.fechaConfirmacion, "La fecha de confirmación no es válida.");
    const mesProduccion = mes(firma.mesProduccion, "Falta el mes de producción.");
    const fechaEfecto = fecha(firma.fechaEfecto, "Falta la fecha de efecto.");
    const fechaCobro = loCobrado && vacio(firma.fechaCobro) ? loCobrado.fecha_cobro : finDeMes(firma.fechaCobro, "Falta el mes de cobro.");
    exigir(fechaCobro >= fechaEfecto, "El cobro no puede ser antes del efecto.");
    const notas = textoONulo(firma.notas, 500, NOTAS_LARGAS);
    const estado = estadoAlCambiar(firma.estado, existente);
    const estadoFinal = estado.estado ?? (existente?.estado as EstadoHerramienta);

    // La serie (REQ-002): cada cuánto cobra y lo de cada cuota, los dos o ninguno. Sin decir, no se tocan
    let cuotasCadaMeses: CuotasCadaMeses | null | undefined;
    let unidadesCuota: number | null | undefined;
    if (firma.cuotasCadaMeses !== undefined || firma.unidadesCuota !== undefined) {
      if (vacio(firma.cuotasCadaMeses)) {
        exigir(vacio(firma.unidadesCuota), ELIGE_CADA_CUANTO);
        cuotasCadaMeses = null;
        unidadesCuota = null;
      } else {
        cuotasCadaMeses = unoDeLosNumeros(firma.cuotasCadaMeses, CUOTAS_CADA_MESES, ELIGE_CADA_CUANTO);
        unidadesCuota = cantidad(firma.unidadesCuota, "Pon las unidades que cobra cada cuota: tienen que ser mayores que cero.", {
          mayorQue: 0,
          maximo: MAXIMO.unidades,
        });
      }
    }
    const cadaFinal = cuotasCadaMeses !== undefined ? cuotasCadaMeses : comoCadaMeses(existente?.cuotas_cada_meses);
    const unidadesCuotaFinal = unidadesCuota !== undefined ? unidadesCuota : existente?.unidades_cuota == null ? null : numero(existente.unidades_cuota);
    const aportacionDeFinal = aportacionDe !== undefined ? aportacionDe : (existente?.aportacion_de ?? null);
    if (esCuota) {
      exigir(!cuotasCadaMeses, "Una cuota no lleva serie: la serie es la de su herramienta.");
      exigir(!aportacionDeFinal, "Una cuota no es una aportación extraordinaria: es la comisión de un periodo de su herramienta.");
      exigir(unidades > 0, "Una cuota cobra algo: pon sus unidades, mayores que cero.");
    } else if (cadaFinal !== null) {
      exigir(
        tipoComision === "sobre_recibo" || tipoComision === "sobre_saldo",
        "Solo una comisión sobre recibo (o sobre saldo) cobra en cuotas. Si el recibo es mensual, la comisión va anualizada, de una vez: elige “Anualizada”.",
      );
      exigir(!aportacionDeFinal, "Una aportación extraordinaria no cobra en cuotas: la serie es la de su herramienta.");
      // La que ya cobró ella su primera cuota (el RC de antes) la conserva; en las demás, cada periodo es su cuota
      if (!existente || numero(existente.unidades) === 0) {
        exigir(unidades === 0, "Una serie nueva no cobra en la firma: cada periodo es su cuota. Deja a 0 las unidades para cobrar.");
      }
    }

    // La compañía tiene que estar en las suyas (si no, la FK lo pararía) y los porcentajes, si no vienen
    const { contexto: reglas, deSerie } = await contexto(consultorId);
    exigir(!deSerie.companias && reglas.companias.some((c) => c.codigo === compania), "Esa compañía no está: añádela en Ajustes.");
    const pctHucha = pctHuchaDado ?? pctHuchaPara(compania, producto, periodicidad, reglas, { unidades, propio });
    const pctIrpf = pctIrpfDado ?? reglas.ajustes.pctIrpf;

    let clienteCreado: string | null = null;
    let cliente = clienteId;
    if (!cliente && nuevo?.nombre) {
      const { data, error } = await supabase
        .from("consultoria_clientes")
        .insert({ consultor_id: consultorId, nombre: nuevo.nombre, referencia: nuevo.referencia })
        .select("id")
        .single();
      if (error) return { error: mensajeDe(error) };
      cliente = clienteCreado = data.id as string;
    }

    const fila: Record<string, unknown> = {
      cliente_id: cliente,
      compania,
      producto,
      pago,
      periodicidad,
      tipo_comision: tipoComision,
      duracion_anios: duracionAnios,
      propio,
      // Una cuota no lleva aportación: así no suma dos veces
      aportacion: esCuota ? null : aportacion,
      unidades,
      unidades_nivel: unidadesNivel,
      valor_unidad: valorUnidad,
      pct_hucha: pctHucha,
      pct_irpf: pctIrpf,
      fecha_confirmacion: fechaConfirmacion,
      mes_produccion: mesProduccion,
      fecha_efecto: fechaEfecto,
      fecha_cobro: fechaCobro,
      fechas_provisionales: firma.fechasProvisionales === true,
      notas,
      ...estado,
      // Sin decir, el enlace no se toca
      ...(aportacionDe !== undefined ? { aportacion_de: aportacionDe } : {}),
      // Sin decir, la serie tampoco; una cuota no la lleva nunca
      ...(cuotasCadaMeses !== undefined && !esCuota ? { cuotas_cada_meses: cuotasCadaMeses, unidades_cuota: unidadesCuota } : {}),
    };
    // De una cobrada, lo que protege su disparador solo se escribe si cambia (y entonces él lo para, con su mensaje)
    if (loCobrado) {
      if (mismaCantidad(unidades, loCobrado.unidades)) delete fila.unidades;
      if (mismaCantidad(valorUnidad, loCobrado.valor_unidad)) delete fila.valor_unidad;
      if (mismaCantidad(pctHucha, loCobrado.pct_hucha)) delete fila.pct_hucha;
      if (mismaCantidad(pctIrpf, loCobrado.pct_irpf)) delete fila.pct_irpf;
      if (fechaCobro === loCobrado.fecha_cobro) delete fila.fecha_cobro;
    }
    const { data, error } = id
      ? await supabase.from("consultoria_herramientas").update(fila).eq("id", id).eq("consultor_id", consultorId).select("id")
      : await supabase.from("consultoria_herramientas").insert({ ...fila, consultor_id: consultorId }).select("id");

    if (error || !data?.length) {
      if (clienteCreado) {
        const { error: alBorrar } = await supabase
          .from("consultoria_clientes")
          .delete()
          .eq("id", clienteCreado)
          .eq("consultor_id", consultorId);
        if (alBorrar) console.error(`[consultoría] Se ha quedado un cliente nuevo sin herramienta: ${alBorrar.message}`);
      }
      if (!error) return { error: "Esa herramienta ya no está." };
      return {
        error: mensajeDe(error, {
          consultoria_herramientas_compania_fk: "Esa compañía no está: añádela en Ajustes.",
          consultoria_herramientas_cliente_fk: "Ese cliente ya no está.",
          consultoria_herramientas_aportacion_fk: "La herramienta de la que es aportación extraordinaria ya no está.",
        }),
      };
    }
    const guardadaId = data[0].id as string;
    const hecho = id ? "Herramienta guardada" : "Firma apuntada";
    if (esCuota || cadaFinal === null) return { ok: `${hecho}.`, id: guardadaId };

    // Una serie: sus cuotas, al día y programadas. Lo guardado se queda aunque esto falle
    const { programadas, fallo, rehecha } = await ponerAlDiaLasCuotas(supabase, consultorId, guardadaId, existente, {
      cadaMeses: cadaFinal,
      unidadesCuota: unidadesCuotaFinal ?? 0,
      fechaEfecto,
      estado: estadoFinal,
      copiado: {
        compania,
        producto,
        pago,
        periodicidad,
        tipo_comision: tipoComision,
        duracion_anios: duracionAnios,
        propio,
        valor_unidad: valorUnidad,
        pct_hucha: pctHucha,
        fecha_confirmacion: fechaConfirmacion,
        mes_produccion: mesProduccion,
        fechas_provisionales: firma.fechasProvisionales === true,
      },
    });
    if (fallo) return { ok: `${hecho}, pero no se han podido programar sus cuotas: hazlo desde su herramienta.`, id: guardadaId };
    if (!programadas) return { ok: `${hecho}.`, id: guardadaId };
    const n = programadas.programadas;
    const sinProgramar = rehecha ? textoDeSinProgramar(programadas) : "";
    if (!id) {
      const conCuotas = n > 0 ? `, con ${n === 1 ? "1 cuota programada" : `${n} cuotas programadas`}` : "";
      const cuandoLaPrimera =
        n === 0 && !sinProgramar ? " Su primera cuota se programará cuando falten seis meses para cobrarla, con «Ha llegado» o desde su herramienta." : "";
      return { ok: `${hecho}${conCuotas}.${cuandoLaPrimera}${sinProgramar}`, id: guardadaId };
    }
    const lasProgramadas = textoDeProgramadas(programadas);
    return { ok: `${hecho}.${lasProgramadas ? ` ${lasProgramadas}` : ""}${sinProgramar}`, id: guardadaId };
  });
}

function leerExtorno(extorno: ExtornoAGuardar) {
  exigir(extorno && typeof extorno === "object", "No sé qué extorno guardar.");
  const importe = cantidad(extorno.importe, "El extorno tiene que ser mayor que cero: si no hay extorno, anula sin él.", {
    mayorQue: 0,
    maximo: MAXIMO.euros,
  });
  const deHucha = cantidad(extorno.deHucha, "Lo que cubre la hucha va de 0 al importe del extorno.", { minimo: 0, maximo: importe });
  const resto = (Math.round(importe * 100) - Math.round(deHucha * 100)) / 100;
  return {
    fecha: fecha(extorno.fecha, "Pon la fecha del extorno."),
    importe,
    de_hucha: deHucha,
    // Lo que la hucha no cubre es un cargo en la liquidación de ese mes
    resto_cobro: resto > 0 ? finDeMes(extorno.restoCobro, "Di en qué liquidación se carga lo que la hucha no cubre.") : null,
    irpf_hucha:
      cantidadONula(extorno.irpfHucha, "El IRPF de la parte de la hucha no puede ser negativo.", { minimo: 0, maximo: MAXIMO.euros }) ?? 0,
    irpf_resto: cantidadONula(extorno.irpfResto, "El IRPF del resto va de 0 a lo que la hucha no cubre.", { minimo: 0, maximo: resto }) ?? 0,
    notas: textoONulo(extorno.notas, 500, NOTAS_LARGAS),
  };
}

/**
 * Las cuotas sin cobrar de una serie recién anulada de los periodos que empiezan después de la
 * anulación, como `cuotasQueSeCortan` de `reglas.ts`: se borran, porque nunca se cobraron. La del
 * periodo en que cae la anulación se queda pendiente (Facundo, 2026-11-01). Devuelve lo que se añade
 * al mensaje
 */
async function cortarCuotas(supabase: Supabase, consultorId: string, id: string, anuladaEl: string): Promise<string> {
  const { data, error } = await supabase
    .from("consultoria_herramientas")
    .delete()
    .eq("consultor_id", consultorId)
    .eq("cuota_de", id)
    .is("liquidacion_id", null)
    .gt("cuota_periodo", anuladaEl)
    .select("id");
  if (error) {
    console.error(`[consultoría] No se han podido cortar las cuotas de una serie anulada: ${paraElLog(error)}`);
    return " Pero no se han podido cortar sus cuotas sin cobrar: bórralas desde la herramienta.";
  }
  const n = data?.length ?? 0;
  if (n === 0) return "";
  return n === 1 ? " Se ha cortado 1 cuota sin cobrar." : ` Se han cortado ${n} cuotas sin cobrar.`;
}

/**
 * Anular una herramienta y, si se cobró y viene `extorno`, crearlo con el reparto que se ha visto
 * (`proponerExtorno`). Si el extorno no se guarda, la herramienta vuelve a su estado. **Si es una
 * serie** (REQ-002), después se cortan sus cuotas sin cobrar de los periodos que empiezan después
 * (`cortarCuotas`), y ya no se programan más
 */
export async function anularHerramienta(entrada: AnulacionAGuardar): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué herramienta anular.");
    const id = uuid(entrada.id, "No sé qué herramienta anular.");
    const anuladaEl = fecha(entrada.anuladaEl, "Pon la fecha de la anulación.");
    const extorno = vacio(entrada.extorno) ? null : leerExtorno(entrada.extorno as ExtornoAGuardar);

    const { data: actual, error } = await supabase
      .from("consultoria_herramientas")
      .select("estado, liquidacion_id, cuotas_cada_meses")
      .eq("id", id)
      .eq("consultor_id", consultorId)
      .maybeSingle();
    if (error) return { error: mensajeDe(error) };
    if (!actual) return { error: "Esa herramienta ya no está." };
    if (actual.estado === "anulada") return { error: "Ya está anulada." };
    if (extorno && !actual.liquidacion_id) return { error: "No se llegó a cobrar: no hay extorno." };
    const esSerie = comoCadaMeses(actual.cuotas_cada_meses) !== null;

    const { error: alAnular } = await supabase
      .from("consultoria_herramientas")
      .update({ estado: "anulada", anulada_el: anuladaEl })
      .eq("id", id)
      .eq("consultor_id", consultorId);
    if (alAnular) return { error: mensajeDe(alAnular) };
    if (!extorno) {
      const cortadas = esSerie ? await cortarCuotas(supabase, consultorId, id, anuladaEl) : "";
      return { ok: `${actual.liquidacion_id ? "Anulada, sin extorno." : "Anulada: deja de contar en lo previsto."}${cortadas}` };
    }

    const { error: alCrear } = await supabase
      .from("consultoria_extornos")
      .insert({ ...extorno, consultor_id: consultorId, herramienta_id: id });
    if (!alCrear) {
      const cortadas = esSerie ? await cortarCuotas(supabase, consultorId, id, anuladaEl) : "";
      return { ok: await conAvisoDeHucha(`Anulada, con su extorno.${cortadas}`, consultorId) };
    }

    const { error: alDevolver } = await supabase
      .from("consultoria_herramientas")
      .update({ estado: actual.estado, anulada_el: null })
      .eq("id", id)
      .eq("consultor_id", consultorId);
    const motivo = mensajeDe(alCrear, { "23505": "Esa herramienta ya tiene su extorno." });
    if (alDevolver) {
      console.error(`[consultoría] La herramienta se ha quedado anulada sin su extorno: ${alDevolver.message}`);
      return { error: `La herramienta se ha quedado anulada, pero el extorno no se ha guardado: ${motivo} Apúntalo desde la herramienta.` };
    }
    return { error: motivo };
  });
}

/**
 * Cambiar el reparto, la fecha o los supuestos de IRPF de un extorno (con `id`) o crear el de una
 * herramienta anulada que se cobró y aún no lo tiene (con `herramientaId`). Si su resto ya se
 * aplicó, la base de datos no deja cambiar el importe, el reparto ni el mes (lo dice su disparador)
 */
export async function guardarExtorno(entrada: ExtornoACambiar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué extorno guardar.");
    const id = vacio(entrada.id) ? null : uuid(entrada.id, "No sé qué extorno cambiar.");
    const datos = leerExtorno(entrada);
    const { data, error } = id
      ? await supabase.from("consultoria_extornos").update(datos).eq("id", id).eq("consultor_id", consultorId).select("id")
      : await supabase
          .from("consultoria_extornos")
          .insert({ ...datos, consultor_id: consultorId, herramienta_id: uuid(entrada.herramientaId, "No sé de qué herramienta es el extorno.") })
          .select("id");
    if (error) return { error: mensajeDe(error, { "23505": "Esa herramienta ya tiene su extorno: cámbialo.", "23503": "Esa herramienta ya no está." }) };
    if (!data?.length) return { error: "Ese extorno ya no está." };
    return { ok: await conAvisoDeHucha("Extorno guardado.", consultorId), id: data[0].id as string };
  });
}

/** Quitar un extorno (por ejemplo, para poder deshacer la liquidación en que se cobró su herramienta) */
export async function borrarExtorno(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { data, error } = await supabase
      .from("consultoria_extornos")
      .delete()
      .eq("id", uuid(id, "No sé qué extorno quitar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Ese extorno ya no está." };
    return { ok: "Extorno quitado." };
  });
}

/**
 * Borrar una herramienta que no se ha cobrado (una prevista que se cae, o una cuota pendiente que no
 * va a llegar). Cobrada, con extorno o con aportaciones extraordinarias colgando (la FK de
 * `aportacion_de`), no. **Una serie** (REQ-002) con alguna cuota cobrada tampoco (se anula); si
 * ninguna se ha cobrado, se borran antes sus cuotas y después ella. Antes de borrar nada se mira lo que
 * la pararía, para no dejarla sin cuotas y sin borrar
 */
export async function borrarHerramienta(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const herramientaId = uuid(id, "No sé qué herramienta borrar.");
    const { data: actual, error: alLeer } = await supabase
      .from("consultoria_herramientas")
      .select("producto, liquidacion_id, cuotas_cada_meses")
      .eq("id", herramientaId)
      .eq("consultor_id", consultorId)
      .maybeSingle();
    if (alLeer) return { error: mensajeDe(alLeer) };
    if (!actual) return { error: "Esa herramienta ya no está." };

    let cuotasBorradas = 0;
    if (comoCadaMeses(actual.cuotas_cada_meses) !== null) {
      if (actual.liquidacion_id) return { error: conPunto(`La herramienta «${actual.producto}» ya se cobró: deshaz antes la liquidación`) };
      const cuenta = (columna: "cuota_de" | "aportacion_de", cobradas: boolean) => {
        let consulta = supabase
          .from("consultoria_herramientas")
          .select("id", { count: "exact", head: true })
          .eq("consultor_id", consultorId)
          .eq(columna, herramientaId);
        if (cobradas) consulta = consulta.not("liquidacion_id", "is", null);
        return consulta;
      };
      const [cobradas, apex] = await Promise.all([cuenta("cuota_de", true), cuenta("aportacion_de", false)]);
      if (cobradas.error) return { error: mensajeDe(cobradas.error) };
      if (apex.error) return { error: mensajeDe(apex.error) };
      if ((cobradas.count ?? 0) > 0) return { error: "Tiene cuotas cobradas: anúlala." };
      if ((apex.count ?? 0) > 0) return { error: "Tiene aportaciones extraordinarias: bórralas o desengánchalas antes." };

      const { data: borradas, error: alBorrarCuotas } = await supabase
        .from("consultoria_herramientas")
        .delete()
        .eq("consultor_id", consultorId)
        .eq("cuota_de", herramientaId)
        .is("liquidacion_id", null)
        .select("id");
      if (alBorrarCuotas) return { error: mensajeDe(alBorrarCuotas) };
      cuotasBorradas = borradas?.length ?? 0;
    }

    const { data, error } = await supabase
      .from("consultoria_herramientas")
      .delete()
      .eq("id", herramientaId)
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) {
      const motivo = mensajeDe(error, {
        consultoria_herramientas_aportacion_fk: "Tiene aportaciones extraordinarias: bórralas o desengánchalas antes.",
        consultoria_herramientas_cuota_fk: "Tiene cuotas: bórralas antes.",
        "23503": "Tiene un extorno: quítalo antes de borrarla.",
      });
      // Sus cuotas sin cobrar ya se han borrado: el botón «Programar» de la herramienta las vuelve a poner
      return { error: cuotasBorradas ? `${motivo} Sus cuotas sin cobrar sí se han borrado: vuelve a programarlas desde la herramienta.` : motivo };
    }
    if (!data?.length) return { error: "Esa herramienta ya no está." };
    if (cuotasBorradas === 0) return { ok: "Herramienta borrada." };
    return { ok: cuotasBorradas === 1 ? "Herramienta borrada, con su cuota." : `Herramienta borrada, con sus ${cuotasBorradas} cuotas.` };
  });
}

/**
 * Programar las cuotas que faltan (REQ-002) de una serie (`herramientaId`) o, sin él, de todas las que
 * no están anuladas: las que se cobran hasta seis meses después de hoy y no están guardadas. Relanzarla
 * no duplica. Las que se cobrarían antes de la última liquidación que llegó no se programan: el
 * mensaje lo dice y cómo arreglarlo
 */
export async function programarCuotas(herramientaId?: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const id = vacio(herramientaId) ? undefined : uuid(herramientaId, "No sé de qué herramienta programar las cuotas.");
    if (id) {
      const { data, error } = await supabase
        .from("consultoria_herramientas")
        .select("producto, estado, cuotas_cada_meses")
        .eq("id", id)
        .eq("consultor_id", consultorId)
        .maybeSingle();
      if (error) return { error: mensajeDe(error) };
      if (!data) return { error: "Esa herramienta ya no está." };
      if (comoCadaMeses(data.cuotas_cada_meses) === null) return { error: `«${data.producto}» no se cobra en cuotas.` };
      if (data.estado === "anulada") return { error: `«${data.producto}» está anulada: no se programan más cuotas.` };
    }
    const programadas = await programar(supabase, consultorId, { herramientaId: id, hoy: hoyEnMadrid() });
    if ("error" in programadas) return { error: programadas.error };
    return { ok: `${textoDeProgramadas(programadas) || "No faltaba ninguna."}${textoDeSinProgramar(programadas)}` };
  });
}

// ---------------------------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------------------------

/** Alta o cambio de un cliente: lo mínimo, y en las notas, nada de datos personales */
export async function guardarCliente(cliente: ClienteAGuardar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(cliente && typeof cliente === "object", "No sé qué cliente guardar.");
    const id = vacio(cliente.id) ? null : uuid(cliente.id, "No sé qué cliente cambiar.");
    const nombre = textoONulo(cliente.nombre, 80, "El nombre es de 80 caracteres como mucho.");
    exigir(nombre, "Escribe el nombre del cliente.");
    const fila = {
      nombre,
      referencia: textoONulo(cliente.referencia, 40, "La referencia es de 40 caracteres como mucho: «ref. Marta»."),
      proxima_revision: vacio(cliente.proximaRevision) ? null : fecha(cliente.proximaRevision, "La fecha de la próxima revisión no es válida."),
      notas: textoONulo(cliente.notas, 500, NOTAS_LARGAS),
    };
    const { data, error } = id
      ? await supabase.from("consultoria_clientes").update(fila).eq("id", id).eq("consultor_id", consultorId).select("id")
      : await supabase.from("consultoria_clientes").insert({ ...fila, consultor_id: consultorId }).select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Ese cliente ya no está." };
    return { ok: "Cliente guardado.", id: data[0].id as string };
  });
}

/** Borrar un cliente sin herramientas (con alguna, su FK no deja) */
export async function borrarCliente(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { data, error } = await supabase
      .from("consultoria_clientes")
      .delete()
      .eq("id", uuid(id, "No sé qué cliente borrar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) return { error: mensajeDe(error, { "23503": "Tiene herramientas: no se puede borrar." }) };
    if (!data?.length) return { error: "Ese cliente ya no está." };
    return { ok: "Cliente borrado." };
  });
}

// ---------------------------------------------------------------------------------------------
// Liquidaciones
// ---------------------------------------------------------------------------------------------

/**
 * «Ha llegado»: `consultoria_liquidar_mes()`, todo en una transacción. Las herramientas marcadas
 * pasan a cobradas; las demás del mes, al siguiente con el motivo en sus notas; los restos de
 * extornos y los cargos marcados se aplican. Vale también para un mes sin comisiones. Con la clave
 * secreta no hay `auth.uid()`: el consultor va en `p_consultor` (spec 4.3).
 * Después, las cuotas que falten de todas las series (REQ-002): la ventana de seis meses avanza. Si eso
 * falla, la liquidación queda apuntada y el mensaje lo dice
 */
export async function marcarLiquidacion(entrada: LiquidacionAMarcar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué liquidación marcar.");
    const motivo = vacio(entrada.motivo) ? null : textoONulo(entrada.motivo, 200, "El motivo es demasiado largo: 200 caracteres como mucho.");
    const elMes = mes(entrada.mes, "No sé qué mes marcar.");
    const { data, error } = await supabase.rpc("consultoria_liquidar_mes", {
      p_consultor: consultorId,
      p_mes: elMes,
      p_fecha: fecha(entrada.fecha, "Pon la fecha de la liquidación."),
      p_entraron: uuids(entrada.entraron, "No sé qué herramientas han entrado."),
      p_extornos: uuids(entrada.extornos, "No sé qué extornos se aplican."),
      p_cargos: uuids(entrada.cargos, "No sé qué cargos se aplican."),
      p_numero: enteroONulo(entrada.numero, "El n.º de la liquidación es un número mayor que 0.", 1, 2_147_483_647),
      p_importe_recibido: cantidadONula(entrada.importeRecibido, "Lo recibido no puede ser negativo.", { minimo: 0, maximo: MAXIMO.euros }),
      p_motivo: motivo,
    });
    if (error) return { error: mensajeDe(error, { "23505": "Ese mes ya está marcado como cobrado." }) };
    const liquidacionId = data as string;

    const programadas = await programar(supabase, consultorId, { hoy: hoyEnMadrid() });
    if ("error" in programadas) {
      return { ok: "Liquidación apuntada, pero no se han podido programar las próximas cuotas: hazlo desde su herramienta.", id: liquidacionId };
    }
    const n = programadas.programadas;
    const conCuotas = n > 0 ? ` ${n === 1 ? "Programada 1 cuota" : `Programadas ${n} cuotas`}.` : "";
    // Solo las de este mes: las de antes ya se avisaron al programar su serie
    const deEsteMes = programadas.sinProgramar
      .filter((c) => c.fechaCobro.slice(0, 7) === elMes.slice(0, 7))
      .map(
        (c) =>
          ` Ojo: la cuota de ${nombreDelPeriodo(c.periodo, c.cadaMeses)} de «${c.producto}» se cobraría en esta liquidación y no estaba programada. ` +
          "Si llegó en ella, deshazla, programa las cuotas desde su herramienta y vuelve a marcar «Ha llegado»; si no, apúntala a mano.",
      )
      .join("");
    return { ok: `Liquidación apuntada.${conCuotas}${deEsteMes}`, id: liquidacionId };
  });
}

/**
 * Cambiar la fecha, el n.º, lo recibido o las notas de una liquidación que ya llegó. **El mes no se
 * cambia nunca** (no va en la petición, así que `consultoria_proteger_liquidacion` ni salta): para moverla, se
 * deshace y se vuelve a marcar
 */
export async function guardarLiquidacion(entrada: LiquidacionAGuardar): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué liquidación cambiar.");
    // Lo que no viene no se toca (undefined); null lo vacía. Si no, cambiar solo la fecha borraría las notas
    const cambios: Record<string, unknown> = { fecha: fecha(entrada.fecha, "Pon la fecha de la liquidación.") };
    if (entrada.numero !== undefined) {
      cambios.numero = enteroONulo(entrada.numero, "El n.º de la liquidación es un número mayor que 0.", 1, 2_147_483_647);
    }
    if (entrada.importeRecibido !== undefined) {
      cambios.importe_recibido = cantidadONula(entrada.importeRecibido, "Lo recibido no puede ser negativo.", { minimo: 0, maximo: MAXIMO.euros });
    }
    if (entrada.notas !== undefined) cambios.notas = textoONulo(entrada.notas, 500, NOTAS_LARGAS);
    const { data, error } = await supabase
      .from("consultoria_liquidaciones")
      .update(cambios)
      .eq("id", uuid(entrada.id, "No sé qué liquidación cambiar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Esa liquidación ya no está." };
    return { ok: "Liquidación guardada." };
  });
}

/**
 * Deshacer «Ha llegado» (`consultoria_deshacer_liquidacion()`): sus herramientas vuelven a estar por
 * cobrar y su reserva sale de la hucha. Si una tiene extorno, no se deshace y el mensaje dice cuál
 */
export async function deshacerLiquidacion(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { error } = await supabase.rpc("consultoria_deshacer_liquidacion", {
      p_consultor: consultorId,
      p_id: uuid(id, "No sé qué liquidación deshacer."),
    });
    if (error) return { error: mensajeDe(error) };
    return { ok: await conAvisoDeHucha("Liquidación deshecha: sus herramientas vuelven a estar por cobrar.", consultorId) };
  });
}

// ---------------------------------------------------------------------------------------------
// La cuenta de comisiones y la hucha
// ---------------------------------------------------------------------------------------------

/** Un cargo (negativo) o abono (positivo) de la cuenta de comisiones. Uno ya aplicado no cambia de importe ni de fecha */
export async function guardarCargo(cargo: CargoAGuardar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(cargo && typeof cargo === "object", "No sé qué cargo guardar.");
    const id = vacio(cargo.id) ? null : uuid(cargo.id, "No sé qué cargo cambiar.");
    const concepto = textoONulo(cargo.concepto, 120, "El concepto es de 120 caracteres como mucho.");
    exigir(concepto, "Escribe el concepto: «Curso de formación».");
    const importe = cantidad(cargo.importe, "El importe no puede ser 0: un cargo va en negativo y un abono en positivo.", {
      minimo: -MAXIMO.euros,
      maximo: MAXIMO.euros,
    });
    exigir(importe !== 0, "El importe no puede ser 0: un cargo va en negativo y un abono en positivo.");
    const fila = { fecha: fecha(cargo.fecha, "Pon la fecha del apunte."), concepto, importe };
    const { data, error } = id
      ? await supabase.from("consultoria_cuenta").update(fila).eq("id", id).eq("consultor_id", consultorId).select("id")
      : await supabase.from("consultoria_cuenta").insert({ ...fila, consultor_id: consultorId }).select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Ese cargo ya no está." };
    return { ok: importe < 0 ? "Cargo guardado." : "Abono guardado.", id: data[0].id as string };
  });
}

/** Quitar un cargo o abono que aún no se ha aplicado */
export async function borrarCargo(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { data, error } = await supabase
      .from("consultoria_cuenta")
      .delete()
      .eq("id", uuid(id, "No sé qué cargo quitar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Ese cargo ya no está." };
    return { ok: "Quitado de la cuenta." };
  });
}

const TIPOS_DE_HUCHA: readonly MovimientoDeHuchaAGuardar["tipo"][] = ["inicial", "reclamacion", "ajuste"];

/**
 * El saldo de partida, una reclamación o un ajuste de la hucha. El importe llega en positivo y el
 * signo lo pone el tipo (en un ajuste, `sentido`). Una reclamación sin IRPF dicho lleva el que
 * propone `irpfDeReclamacion` con el de Ajustes (un supuesto)
 */
export async function guardarMovimientoHucha(movimiento: MovimientoDeHuchaAGuardar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(movimiento && typeof movimiento === "object", "No sé qué movimiento de la hucha guardar.");
    const id = vacio(movimiento.id) ? null : uuid(movimiento.id, "No sé qué movimiento cambiar.");
    const tipo = unoDe(movimiento.tipo, TIPOS_DE_HUCHA, "Elige qué es: saldo de partida, reclamación o ajuste.");
    const importe = cantidad(movimiento.importe, "El importe tiene que ser mayor que cero.", { mayorQue: 0, maximo: MAXIMO.euros });
    const sale =
      tipo === "reclamacion" ||
      (tipo === "ajuste" && unoDe(movimiento.sentido, ["entra", "sale"] as const, "Di si el ajuste entra en la hucha o sale de ella.") === "sale");

    let irpf = 0;
    if (tipo === "reclamacion") {
      irpf =
        cantidadONula(movimiento.irpf, "El IRPF de la reclamación va de 0 a lo reclamado.", { minimo: 0, maximo: importe }) ??
        irpfDeReclamacion(importe, (await contexto(consultorId)).contexto.ajustes.pctIrpf);
    }
    const fila = {
      fecha: fecha(movimiento.fecha, "Pon la fecha."),
      tipo,
      importe: sale ? -importe : importe,
      irpf,
      notas: textoONulo(movimiento.notas, 500, NOTAS_LARGAS),
    };
    const { data, error } = id
      ? await supabase.from("consultoria_hucha").update(fila).eq("id", id).eq("consultor_id", consultorId).select("id")
      : await supabase.from("consultoria_hucha").insert({ ...fila, consultor_id: consultorId }).select("id");
    if (error) return { error: mensajeDe(error, { "23505": "Ya hay un saldo de partida: cámbialo." }) };
    if (!data?.length) return { error: "Ese movimiento ya no está." };
    return { ok: await conAvisoDeHucha("Guardado en la hucha.", consultorId), id: data[0].id as string };
  });
}

/** Quitar un movimiento apuntado a mano en la hucha (los de las liquidaciones y los extornos salen de ellos) */
export async function borrarMovimientoHucha(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { data, error } = await supabase
      .from("consultoria_hucha")
      .delete()
      .eq("id", uuid(id, "No sé qué movimiento quitar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) return { error: mensajeDe(error) };
    if (!data?.length) return { error: "Ese movimiento ya no está." };
    return { ok: await conAvisoDeHucha("Quitado de la hucha.", consultorId) };
  });
}

// ---------------------------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------------------------

const REGLAS = ["axa_pias", "por_pago", "sin_calendario"] as const;
const CALENDARIOS = ["INTESA", "AVANZA", "AXA_PIAS"] as const;

/** Alta o cambio de una compañía, por su código (en mayúsculas) */
export async function guardarCompania(compania: CompaniaAGuardar): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(compania && typeof compania === "object", "No sé qué compañía guardar.");
    const nombre = textoONulo(compania.nombre, 40, "El nombre de la compañía es de 40 caracteres como mucho.");
    exigir(nombre, "Escribe el nombre de la compañía: «Allianz».");
    const regla = unoDe(compania.regla, REGLAS, "Elige cómo salen sus fechas.");
    const { error } = await supabase.from("consultoria_companias").upsert(
      {
        consultor_id: consultorId,
        codigo: codigoDeCompania(compania.codigo, "El código va en mayúsculas, de 2 a 10 letras, números o «_», como sale en la liquidación: AXA, ALL."),
        nombre,
        regla,
        // Sin calendario no lleva; las demás, el suyo
        calendario: regla === "sin_calendario" ? null : unoDe(compania.calendario, CALENDARIOS, "Elige qué calendario de cierres sigue."),
        pct_hucha: porcentajeONulo(compania.pctHucha, "La reserva va del 0 al 100 %."),
        meses_hasta_cobro: enteroONulo(compania.mesesHastaCobro, "Los meses del efecto al cobro van de 0 a 12.", 0, 12),
      },
      { onConflict: "consultor_id,codigo" },
    );
    if (error) return { error: mensajeDe(error) };
    return { ok: "Compañía guardada." };
  });
}

/** Las unidades previas y los porcentajes de serie. Lo ya apuntado no cambia: cada herramienta guarda los suyos */
export async function guardarAjustes(ajustes: AjustesAGuardar): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(ajustes && typeof ajustes === "object", "No sé qué ajustes guardar.");
    const pctHucha = porcentajeONulo(ajustes.pctHucha, "La reserva va del 0 al 100 %.");
    const pctIrpf = porcentajeONulo(ajustes.pctIrpf, "El IRPF va del 0 al 100 %.");
    exigir(pctHucha !== null, "Pon la reserva de cancelación de serie (0 vale).");
    exigir(pctIrpf !== null, "Pon el IRPF (0 vale).");
    const { error } = await supabase.from("consultoria_ajustes").upsert(
      {
        consultor_id: consultorId,
        unidades_previas: cantidad(ajustes.unidadesPrevias, "Las unidades previas no pueden ser negativas.", { minimo: 0, maximo: MAXIMO.unidades }),
        pct_hucha: pctHucha,
        pct_irpf: pctIrpf,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "consultor_id" },
    );
    if (error) return { error: mensajeDe(error) };
    return { ok: "Ajustes guardados. Los porcentajes nuevos valen para las firmas nuevas: lo apuntado no cambia." };
  });
}

/**
 * Los niveles del consultor, en lugar de los que tenía: primero se guardan los nuevos (por nombre) y
 * después se quitan los que ya no están, para que un fallo a medias no lo deje sin niveles. Sin
 * ninguno, valen los de serie del cuadro
 */
export async function guardarNiveles(niveles: Nivel[]): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(Array.isArray(niveles) && niveles.length <= 20, "No sé qué niveles guardar.");
    const filas = niveles.map((nivel) => {
      exigir(nivel && typeof nivel === "object", "No sé qué niveles guardar.");
      const nombre = textoONulo(nivel.nombre, 40, "El nombre de un nivel es de 40 caracteres como mucho.");
      exigir(nombre, "Cada nivel lleva su nombre: «Financial Consultant».");
      return {
        consultor_id: consultorId,
        nombre,
        valor_unidad: cantidad(nivel.valorUnidad, `El €/unidad de «${nombre}» tiene que ser mayor que cero.`, { mayorQue: 0, maximo: MAXIMO.valorUnidad }),
        desde_unidades: cantidadONula(nivel.desdeUnidades, `Las unidades de «${nombre}» no pueden ser negativas.`, { minimo: 0, maximo: MAXIMO.unidades }),
        desde_mes: vacio(nivel.desdeMes) ? null : mes(nivel.desdeMes, `El mes desde el que vale «${nombre}» no es válido.`),
      };
    });
    const nombres = filas.map((f) => f.nombre.toLocaleLowerCase("es"));
    exigir(new Set(nombres).size === nombres.length, "Hay dos niveles con el mismo nombre.");

    const { data: actuales, error } = await supabase.from("consultoria_niveles").select("id, nombre").eq("consultor_id", consultorId);
    if (error) return { error: mensajeDe(error) };
    if (filas.length) {
      const { error: alGuardar } = await supabase.from("consultoria_niveles").upsert(filas, { onConflict: "consultor_id,nombre" });
      if (alGuardar) return { error: mensajeDe(alGuardar) };
    }
    const sobran = (actuales ?? []).filter((a) => !filas.some((f) => f.nombre === a.nombre)).map((a) => a.id as string);
    if (sobran.length) {
      const { error: alQuitar } = await supabase.from("consultoria_niveles").delete().in("id", sobran).eq("consultor_id", consultorId);
      if (alQuitar) return { error: `Los niveles nuevos están guardados, pero no se han podido quitar los de antes: ${mensajeDe(alQuitar)}` };
    }
    return { ok: filas.length ? "Niveles guardados." : "Sin niveles propios: valen los de serie del cuadro." };
  });
}
