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
 */
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { baseDeDatos } from "@/lib/base/cliente";
import { contextoDeReglas, saldoDeHuchaAhora } from "@/lib/consultoria/consultas";
import { irpfDeReclamacion, pctHuchaPara } from "@/lib/consultoria/reglas";
import type { EstadoHerramienta, Nivel, Pago, Periodicidad, TipoComision } from "@/lib/consultoria/reglas";
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
const NO_SE_HA_GUARDADO = "No se ha podido guardar. Vuelve a intentarlo dentro de un momento.";
/** Antes del cambio (spec 6.2): la fuente sigue siendo FSM-Finance y aquí no se guarda nada */
const AUN_EN_FSM_FINANCE = "La consultoría aún se lleva en FSM-Finance: el cambio no está hecho.";

/** Lo que dice una acción si la sección aún no puede enseñar nada (`exigirConsultoria()`) */
const PENDIENTE: Record<LoQueFalta, string> = {
  configuracion: "Falta configurar la base de datos del panel.",
  "0001": MIGRACION,
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
  // Lo que no existe: falta la 0001
  if (["42P01", "42703", "42883", "PGRST205", "PGRST204", "PGRST202"].includes(codigo)) return MIGRACION;
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

    // La madre: suya, y que no sea a su vez una aportación (un solo nivel)
    let madre: Madre | null = null;
    if (aportacionDe) {
      const { data, error } = await supabase
        .from("consultoria_herramientas")
        .select("cliente_id, compania, producto, pago, aportacion_de")
        .eq("id", aportacionDe)
        .eq("consultor_id", consultorId)
        .maybeSingle();
      if (error) return { error: mensajeDe(error) };
      if (!data) return { error: "La herramienta de la que es aportación extraordinaria ya no está." };
      madre = data as Madre;
      exigir(!madre.aportacion_de, `«${madre.producto}» ya es una aportación extraordinaria: elige la herramienta de la que cuelga.`);
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
    const unidades = cantidad(firma.unidades, "Las unidades tienen que ser mayores que cero.", { minimo: 0, maximo: MAXIMO.unidades });
    const unidadesNivel = cantidadONula(firma.unidadesNivel, "Las unidades para el nivel no pueden ser negativas.", { minimo: 0, maximo: MAXIMO.unidades });
    // La firma de una sobre recibo o sobre saldo lleva 0 u que cobrar y las de producción para el nivel
    exigir(unidades > 0 || (unidadesNivel ?? 0) > 0, "Las unidades tienen que ser mayores que cero.");
    const valorUnidad = cantidad(firma.valorUnidad, "Pon el €/unidad: tiene que ser mayor que cero.", { mayorQue: 0, maximo: MAXIMO.valorUnidad });
    const pctHuchaDado = porcentajeONulo(firma.pctHucha, "La reserva va del 0 al 100 %.");
    const pctIrpfDado = porcentajeONulo(firma.pctIrpf, "El IRPF va del 0 al 100 %.");
    const fechaConfirmacion = vacio(firma.fechaConfirmacion) ? null : fecha(firma.fechaConfirmacion, "La fecha de confirmación no es válida.");
    const mesProduccion = mes(firma.mesProduccion, "Falta el mes de producción.");
    const fechaEfecto = fecha(firma.fechaEfecto, "Falta la fecha de efecto.");
    const fechaCobro = finDeMes(firma.fechaCobro, "Falta el mes de cobro.");
    exigir(fechaCobro >= fechaEfecto, "El cobro no puede ser antes del efecto.");
    const notas = textoONulo(firma.notas, 500, NOTAS_LARGAS);

    // Lo que ya está, para saber qué estado se puede poner
    let existente: { estado: EstadoHerramienta; liquidacion_id: string | null } | null = null;
    if (id) {
      const { data, error } = await supabase
        .from("consultoria_herramientas")
        .select("estado, liquidacion_id")
        .eq("id", id)
        .eq("consultor_id", consultorId)
        .maybeSingle();
      if (error) return { error: mensajeDe(error) };
      if (!data) return { error: "Esa herramienta ya no está." };
      existente = data;
    } else {
      exigir(firma.estado !== "anulada", "Una firma nueva no se apunta anulada.");
    }
    const estado = estadoAlCambiar(firma.estado, existente);

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

    const fila = {
      cliente_id: cliente,
      compania,
      producto,
      pago,
      periodicidad,
      tipo_comision: tipoComision,
      duracion_anios: duracionAnios,
      propio,
      aportacion,
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
    };
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
    return { ok: id ? "Herramienta guardada." : "Firma apuntada.", id: data[0].id as string };
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
 * Anular una herramienta y, si se cobró y viene `extorno`, crearlo con el reparto que se ha visto
 * (`proponerExtorno`). Si el extorno no se guarda, la herramienta vuelve a su estado
 */
export async function anularHerramienta(entrada: AnulacionAGuardar): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué herramienta anular.");
    const id = uuid(entrada.id, "No sé qué herramienta anular.");
    const anuladaEl = fecha(entrada.anuladaEl, "Pon la fecha de la anulación.");
    const extorno = vacio(entrada.extorno) ? null : leerExtorno(entrada.extorno as ExtornoAGuardar);

    const { data: actual, error } = await supabase
      .from("consultoria_herramientas")
      .select("estado, liquidacion_id")
      .eq("id", id)
      .eq("consultor_id", consultorId)
      .maybeSingle();
    if (error) return { error: mensajeDe(error) };
    if (!actual) return { error: "Esa herramienta ya no está." };
    if (actual.estado === "anulada") return { error: "Ya está anulada." };
    if (extorno && !actual.liquidacion_id) return { error: "No se llegó a cobrar: no hay extorno." };

    const { error: alAnular } = await supabase
      .from("consultoria_herramientas")
      .update({ estado: "anulada", anulada_el: anuladaEl })
      .eq("id", id)
      .eq("consultor_id", consultorId);
    if (alAnular) return { error: mensajeDe(alAnular) };
    if (!extorno) {
      return { ok: actual.liquidacion_id ? "Anulada, sin extorno." : "Anulada: deja de contar en lo previsto." };
    }

    const { error: alCrear } = await supabase
      .from("consultoria_extornos")
      .insert({ ...extorno, consultor_id: consultorId, herramienta_id: id });
    if (!alCrear) return { ok: await conAvisoDeHucha("Anulada, con su extorno.", consultorId) };

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
 * Borrar una herramienta que no se ha cobrado (una prevista que se cae). Cobrada, con extorno o con
 * aportaciones extraordinarias colgando (la FK de `aportacion_de`), no
 */
export async function borrarHerramienta(id: string): Promise<Resultado> {
  return comoConsultor(async ({ supabase, consultorId }) => {
    const { data, error } = await supabase
      .from("consultoria_herramientas")
      .delete()
      .eq("id", uuid(id, "No sé qué herramienta borrar."))
      .eq("consultor_id", consultorId)
      .select("id");
    if (error) {
      return {
        error: mensajeDe(error, {
          consultoria_herramientas_aportacion_fk: "Tiene aportaciones extraordinarias: bórralas o desengánchalas antes.",
          "23503": "Tiene un extorno: quítalo antes de borrarla.",
        }),
      };
    }
    if (!data?.length) return { error: "Esa herramienta ya no está." };
    return { ok: "Herramienta borrada." };
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
 * secreta no hay `auth.uid()`: el consultor va en `p_consultor` (spec 4.3)
 */
export async function marcarLiquidacion(entrada: LiquidacionAMarcar): Promise<ResultadoConId> {
  return comoConsultor<ResultadoConId>(async ({ supabase, consultorId }) => {
    exigir(entrada && typeof entrada === "object", "No sé qué liquidación marcar.");
    const motivo = vacio(entrada.motivo) ? null : textoONulo(entrada.motivo, 200, "El motivo es demasiado largo: 200 caracteres como mucho.");
    const { data, error } = await supabase.rpc("consultoria_liquidar_mes", {
      p_consultor: consultorId,
      p_mes: mes(entrada.mes, "No sé qué mes marcar."),
      p_fecha: fecha(entrada.fecha, "Pon la fecha de la liquidación."),
      p_entraron: uuids(entrada.entraron, "No sé qué herramientas han entrado."),
      p_extornos: uuids(entrada.extornos, "No sé qué extornos se aplican."),
      p_cargos: uuids(entrada.cargos, "No sé qué cargos se aplican."),
      p_numero: enteroONulo(entrada.numero, "El n.º de la liquidación es un número mayor que 0.", 1, 2_147_483_647),
      p_importe_recibido: cantidadONula(entrada.importeRecibido, "Lo recibido no puede ser negativo.", { minimo: 0, maximo: MAXIMO.euros }),
      p_motivo: motivo,
    });
    if (error) return { error: mensajeDe(error, { "23505": "Ese mes ya está marcado como cobrado." }) };
    return { ok: "Liquidación apuntada.", id: data as string };
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
