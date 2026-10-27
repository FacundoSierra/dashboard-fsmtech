/**
 * Lo común de los scripts de la consultoría en el panel (REQ-001; spec sección 6 de FSM-Finance y
 * sección 8 del panel): el entorno, el cliente de Supabase con la clave secreta de la base del panel
 * (`fsmtech`), buscar el consultor, cargar el contexto de las reglas con las mismas columnas que la
 * aplicación (compañías, cierres, niveles, ajustes y herramientas, más el cuadro de comisiones
 * vigente), leer las notas (calendario y producción) y escribir la línea de una liquidación como la
 * casilla de los cobros de OVB.
 *
 * Las reglas no se repiten aquí: se importan de `lib/consultoria/reglas.ts` y el cuadro de
 * `lib/consultoria/cuadro.ts`, que Node 22.18 o más carga tal cual quitándoles los tipos.
 *
 * - **La base es la del panel**: `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del `.env.local` del panel
 *   (la clave `pc`, ADR-002). La clave secreta se salta el RLS: todo lo que se lee o se escribe se
 *   filtra por `consultor_id`. Nunca se imprime
 * - **El consultor es el único de `consultoria_consultores`** (no hay `--consultor`). Si no hay
 *   ninguno, la base está vacía hasta la copia (`consultoria:copiar`)
 * - **La vista previa funciona siempre**: sin variables, sin la migración 0001 o sin la copia, sale de
 *   los archivos que se le pasan y de los valores de serie. **`--guardar` para** en esos casos y
 *   también **mientras `fuente_desde` sea nulo**: hasta el cambio (spec 6.4), la consultoría se
 *   apunta en FSM-Finance
 * - **Una APEX es la herramienta con `aportacion_de`**: en el recuento va con la suya («4 herramientas
 *   y 1 APEX»); en la liquidación es su propia línea, y el importe no cambia
 * - **Las notas se leen con un lector propio** de `clave: valor` del frontmatter, sin dependencias:
 *   es lo único que tienen estas notas
 * - **Ningún script llama a las funciones de las liquidaciones** («Ha llegado» y «Deshacer»): eso se
 *   hace en la pantalla
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  AJUSTES_DE_SERIE,
  COMPANIAS_DE_SERIE,
  calcularImportes,
  calcularLiquidacion,
  cuentaDeComisiones,
  pctHuchaPara,
  primerDiaDelMes,
  productoDelCuadro,
  recuentoDelMes,
  textoDeHerramientas,
  ultimoDiaDelMes,
} from "../lib/consultoria/reglas.ts";
import { CUADRO_VIGENTE, NIVELES_DE_SERIE } from "../lib/consultoria/cuadro.ts";

export { CUADRO_VIGENTE };

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const AVISO_MIGRACION = "Falta la migración 0001 en la base del panel (supabase/migraciones/0001_consultoria.sql)";
export const AVISO_COPIA = "La base nueva está vacía: copia antes los datos (`consultoria:copiar`)";
export const AVISO_FUENTE = "La consultoría aún se lleva en FSM-Finance: el cambio no está hecho (spec 6.4)";

export const TIPOS_DE_COMISION = ["anticipada", "anualizada", "sobre_recibo", "unica", "sobre_saldo"];
const ESTADOS = ["prevista", "firmada", "confirmada", "incidencia", "cobrada", "anulada"];
const FORMATO_CODIGO = /^[A-Z0-9_]{2,10}$/;

// ---------------------------------------------------------------------------------------------
// Pararse sin haber tocado nada
// ---------------------------------------------------------------------------------------------

/** Un motivo para pararse sin haber tocado nada (o sin tocar nada más) */
export class Parada extends Error {}

export function parar(mensaje) {
  throw new Parada(mensaje);
}

/**
 * Lanza `principal` y, si se para, enseña el motivo. Sin `process.exit()`: en Windows, cortar el
 * proceso con la entrada aún abierta hace saltar un error interno de Node (como borrar-cuenta.mjs)
 */
export function lanzar(principal) {
  principal().catch((error) => {
    console.error(error instanceof Parada ? `\n${error.message}\n` : error);
    process.exitCode = 1;
  });
}

// ---------------------------------------------------------------------------------------------
// Argumentos y valores
// ---------------------------------------------------------------------------------------------

/**
 * `--clave valor`, `--clave=valor` y `--bandera`. Una opción que no se conoce para el script, para
 * que una errata (`--unidad 81.6`) no pase en silencio
 */
export function leerArgumentos(argv, { valores = [], banderas = [] }) {
  const opciones = {};
  const sueltos = [];
  for (let i = 0; i < argv.length; i++) {
    const argumento = argv[i];
    if (!argumento.startsWith("--")) {
      sueltos.push(argumento);
      continue;
    }
    const igual = argumento.indexOf("=");
    const nombre = igual === -1 ? argumento.slice(2) : argumento.slice(2, igual);
    const enLinea = igual === -1 ? undefined : argumento.slice(igual + 1);
    if (nombre in opciones) parar(`La opción --${nombre} está dos veces.`);
    if (banderas.includes(nombre)) {
      if (enLinea !== undefined) parar(`La opción --${nombre} no lleva valor.`);
      opciones[nombre] = true;
    } else if (valores.includes(nombre)) {
      const valor = enLinea ?? argv[i + 1];
      if (valor === undefined || (enLinea === undefined && valor.startsWith("--"))) parar(`Falta el valor de --${nombre}.`);
      if (enLinea === undefined) i++;
      opciones[nombre] = valor;
    } else {
      parar(`No conozco la opción --${nombre}.`);
    }
  }
  return { opciones, sueltos };
}

/**
 * Una cantidad con dos decimales como mucho (euros, unidades, €/unidad, porcentajes), con punto o
 * con coma: `81.6`, `81,6` o el número de un JSON. Con más decimales para, en vez de redondear a
 * escondidas. **0 es un valor** cuando se permite (`cero`), no «falta»
 */
export function leerCantidad(valor, que, { cero = false, negativo = false, maximo = null } = {}) {
  let texto = typeof valor === "number" ? String(valor) : String(valor ?? "").trim().replace(",", ".");
  let signo = 1;
  if (negativo && texto.startsWith("-")) {
    signo = -1;
    texto = texto.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(texto)) parar(`${que}: «${valor ?? ""}» no es una cantidad (usa 81.6 u 81,6).`);
  const [, decimales = ""] = texto.split(".");
  if (decimales.replace(/0+$/, "").length > 2) parar(`${que}: «${valor}» tiene más de dos decimales.`);
  const numero = signo * Number(texto);
  if (numero === 0 && !cero) parar(`${que} tiene que ser mayor que cero.`);
  if (maximo !== null && numero > maximo) parar(`${que}: «${valor}» pasa de ${maximo}.`);
  return numero === 0 ? 0 : numero;
}

/** Un entero entre `minimo` y `maximo` (la duración en años) */
export function leerEntero(valor, que, minimo, maximo) {
  const texto = String(valor ?? "").trim();
  if (!/^\d+$/.test(texto) || Number(texto) < minimo || Number(texto) > maximo) {
    parar(`${que}: «${texto}» tiene que ser un número entero de ${minimo} a ${maximo}.`);
  }
  return Number(texto);
}

/** Sí o no: `true`, `false`, `sí`, `no`, `1`, `0` (de una nota o de un JSON) */
export function leerSiNo(valor, que) {
  if (valor === true || valor === false) return valor;
  const texto = claveDeNombre(valor);
  if (["true", "si", "1"].includes(texto)) return true;
  if (["false", "no", "0", ""].includes(texto)) return false;
  return parar(`${que}: «${valor}» tiene que ser sí o no.`);
}

/** Una fecha `AAAA-MM-DD` que existe */
export function leerFecha(valor, que) {
  const texto = String(valor ?? "").trim();
  try {
    primerDiaDelMes(texto);
  } catch {
    parar(`${que}: «${texto}» no es una fecha AAAA-MM-DD.`);
  }
  return texto;
}

/** Un mes `AAAA-MM` (o una fecha de ese mes) como su día 1 */
export function leerMes(valor, que) {
  const texto = String(valor ?? "").trim();
  return primerDiaDelMes(leerFecha(/^\d{4}-\d{2}$/.test(texto) ? `${texto}-01` : texto, que));
}

/** Un código de compañía como sale en la liquidación: `AXA`, `ALL`, `PLU`… */
export function leerCodigo(valor, que) {
  const codigo = String(valor ?? "").trim().toUpperCase();
  if (!FORMATO_CODIGO.test(codigo)) parar(`${que}: «${valor ?? ""}» no es un código de compañía (2 a 10 letras, números o _).`);
  return codigo;
}

// ---------------------------------------------------------------------------------------------
// Entorno y Supabase
// ---------------------------------------------------------------------------------------------

/**
 * Lee un .env sencillo sin dependencias. Quita las comillas que rodeen un valor
 * (`CLAVE="valor"`), como hace Next al cargar el `.env.local`
 */
export function leerEnv(ruta) {
  const valores = {};
  let contenido = "";
  try {
    contenido = readFileSync(ruta, "utf8");
  } catch {
    return valores;
  }
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const separador = limpia.indexOf("=");
    if (separador === -1) continue;
    let valor = limpia.slice(separador + 1).trim();
    if (valor.length >= 2 && (valor[0] === '"' || valor[0] === "'") && valor.at(-1) === valor[0]) valor = valor.slice(1, -1);
    valores[limpia.slice(0, separador).trim()] = valor;
  }
  return valores;
}

/**
 * Un cliente de Supabase sin sesión, con esa URL y esa clave. La clave solo viaja cifrada: una URL que
 * no sea `https` para. `que` dice de qué base es, para el mensaje
 */
export function clienteDeSupabase(url, clave, que) {
  let segura = false;
  try {
    segura = new URL(url).protocol === "https:";
  } catch {
    segura = false;
  }
  if (!segura) parar(`La URL de ${que} tiene que ser https://<ref>.supabase.co.`);
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * El cliente de la base del panel, con `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del `.env.local` del
 * panel, o `null` si falta alguna. Con `obligatorio` (al guardar), sin ellas se para
 */
export function conectar({ obligatorio = false } = {}) {
  const entorno = leerEnv(path.join(RAIZ, ".env.local"));
  if (!entorno.SUPABASE_URL || !entorno.SUPABASE_SECRET_KEY) {
    if (obligatorio) {
      parar(
        "Falta SUPABASE_URL o SUPABASE_SECRET_KEY en el .env.local del panel.\n" +
          "La clave secreta (la «pc») está en Supabase → Project Settings → API Keys. No la compartas con nadie.",
      );
    }
    return null;
  }
  return clienteDeSupabase(entorno.SUPABASE_URL, entorno.SUPABASE_SECRET_KEY, "la base del panel (SUPABASE_URL)");
}

/** El error de PostgREST de una tabla, vista, columna o función que aún no existe: falta la migración */
export function faltaLaMigracion(error) {
  return ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error?.code);
}

/**
 * ¿Es de verdad la base del panel? Si tiene la tabla `perfiles` (aunque no deje leerla), es la de
 * FSM-Finance u otra aplicación: se para antes de mirar nada más. `que` dice de dónde sale la URL
 */
export async function comprobarQueEsLaDelPanel(supabase, que = "SUPABASE_URL del .env.local del panel") {
  const { error } = await supabase.from("perfiles").select("id").limit(1);
  if (error && faltaLaMigracion(error)) return;
  if (!error || error.code === "42501") {
    parar(`La base de ${que} tiene la tabla «perfiles»: es la de FSM-Finance (u otra aplicación), no la del panel. Revisa la URL. No se ha guardado nada.`);
  }
  parar(`No se ha podido leer la base de datos: ${error.code ?? "sin código"} ${error.message}`);
}

/**
 * ¿Está ejecutada la 0001? Lee una fila de `consultoria_consultores`, su primera tabla; cualquier
 * otro error, se para
 */
export async function hayMigracion(supabase) {
  const { error } = await supabase.from("consultoria_consultores").select("id").limit(1);
  if (!error) return true;
  if (faltaLaMigracion(error)) return false;
  return parar(`No se ha podido leer la base de datos: ${error.code ?? "sin código"} ${error.message}`);
}

/**
 * Lee con `aportacion_de`, la herramienta de la que cuelga una APEX. En la base del panel está
 * siempre (la 0001 la lleva): se queda como función para no cambiar a quien la llama.
 * `leer(columnas)` hace la consulta entera y devuelve `{ data, error }`
 */
export async function leerConApex(leer, columnas) {
  return leer(`${columnas}, aportacion_de`);
}

/** Todas las filas de una consulta, de 1.000 en 1.000 (el tope de Supabase por petición) */
export async function leerTodo(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) return { data: null, error };
    filas.push(...data);
    if (data.length < 1000) return { data: filas, error: null };
  }
}

/**
 * El consultor: el único de `consultoria_consultores` (la base del panel tiene uno solo), como
 * `{ id, nombre, fuenteDesde }`, o `null` si la base aún está vacía (falta la copia)
 */
export async function buscarConsultor(supabase) {
  const { data, error } = await supabase.from("consultoria_consultores").select("id, nombre, fuente_desde").limit(2);
  if (error) parar(`No se ha podido buscar el consultor: ${error.code ?? "sin código"} ${error.message}`);
  if (data.length > 1) parar(`Hay ${data.length} consultores en la base del panel y solo puede haber uno: revisa consultoria_consultores.`);
  const fila = data[0];
  return fila ? { id: fila.id, nombre: fila.nombre, fuenteDesde: fila.fuente_desde ?? null } : null;
}

/**
 * La conexión y el consultor. **La vista previa funciona siempre**: sin variables en el `.env.local`
 * del panel, sin la 0001 o sin consultor (la base vacía hasta la copia), se sigue con lo que se le
 * pase en archivos y los valores de serie, y `migracion` es false (no hay nada que leer). **Con
 * `guardar` se para** en esos casos y también si `fuente_desde` es nulo: hasta el cambio, la fuente
 * es FSM-Finance (spec 6.4). Devuelve `{ supabase, consultor, migracion, nota }`, con `nota` diciendo
 * qué falta
 */
export async function prepararBase({ guardar }) {
  const supabase = conectar({ obligatorio: guardar });
  if (!supabase) {
    return {
      supabase: null,
      consultor: null,
      migracion: false,
      nota: "Sin SUPABASE_URL ni SUPABASE_SECRET_KEY en el .env.local del panel: no se mira la base de datos.",
    };
  }
  await comprobarQueEsLaDelPanel(supabase);
  if (!(await hayMigracion(supabase))) {
    if (guardar) parar(`${AVISO_MIGRACION}: hasta que se ejecute no se puede guardar. Sin --guardar se ve la vista previa.`);
    return {
      supabase,
      consultor: null,
      migracion: false,
      nota: `${AVISO_MIGRACION}: hasta que se ejecute, solo hay vista previa, con lo que sale de los archivos y los valores de serie.`,
    };
  }
  const consultor = await buscarConsultor(supabase);
  if (!consultor) {
    if (guardar) parar(`${AVISO_COPIA}. No se ha guardado nada.`);
    return {
      supabase,
      consultor: null,
      migracion: false,
      nota: `${AVISO_COPIA}: hasta entonces, solo hay vista previa, con lo que sale de los archivos y los valores de serie.`,
    };
  }
  if (!consultor.fuenteDesde) {
    if (guardar) parar(`${AVISO_FUENTE}: hasta entonces se apunta allí. No se ha guardado nada.`);
    return {
      supabase,
      consultor,
      migracion: true,
      nota: `${AVISO_FUENTE}: lo de aquí es la copia y solo hay vista previa. Lo que se firme, en FSM-Finance.`,
    };
  }
  return { supabase, consultor, migracion: true, nota: null };
}

/** Los números de PostgREST (numeric) como `number`, y nulos como nulos */
export const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

// ---------------------------------------------------------------------------------------------
// El contexto de las reglas
// ---------------------------------------------------------------------------------------------

/** Lo que vale sin base de datos (o sin la migración): el cuadro vigente y las compañías, niveles y ajustes de serie */
export function contextoDeSerie() {
  return {
    pendiente: true,
    companiasDeSerie: true,
    nivelesDeSerie: true,
    ajustesDeSerie: true,
    contexto: {
      cuadro: CUADRO_VIGENTE,
      companias: COMPANIAS_DE_SERIE,
      cierres: [],
      niveles: NIVELES_DE_SERIE,
      ajustes: AJUSTES_DE_SERIE,
      herramientas: [],
    },
  };
}

/**
 * El `ContextoReglas` del consultor, con las mismas columnas que leerá `contextoDeReglas` en la
 * aplicación: sus compañías (o las de serie), los cierres, los niveles (o los del cuadro), los
 * ajustes (o los de serie) y `mes_produccion, unidades, unidades_nivel, estado` de sus
 * herramientas, más `CUADRO_VIGENTE`. Sin la migración, `pendiente` y todo de serie
 */
export async function cargarContexto(supabase, consultorId) {
  const leer = async (tabla, columnas, orden) => {
    const { data, error } = await leerTodo(() => {
      let consulta = supabase.from(tabla).select(columnas).eq("consultor_id", consultorId);
      for (const columna of orden) consulta = consulta.order(columna);
      return consulta;
    });
    if (error && !faltaLaMigracion(error)) parar(`No se ha podido leer ${tabla}: ${error.message}`);
    return { filas: data ?? [], falta: Boolean(error) };
  };

  const companias = await leer("consultoria_companias", "codigo, nombre, regla, calendario, pct_hucha, meses_hasta_cobro", ["codigo"]);
  const cierres = await leer("consultoria_cierres", "mes, calendario, confirmar_hasta, incidencias_hasta", ["mes", "calendario"]);
  const niveles = await leer("consultoria_niveles", "nombre, valor_unidad, desde_unidades, desde_mes", ["valor_unidad"]);
  const ajustes = await leer("consultoria_ajustes", "unidades_previas, pct_hucha, pct_irpf", ["consultor_id"]);
  const herramientas = await leer("consultoria_herramientas", "mes_produccion, unidades, unidades_nivel, estado", ["mes_produccion", "id"]);
  if ([companias, cierres, niveles, ajustes, herramientas].some((r) => r.falta)) return contextoDeSerie();

  const fila = ajustes.filas[0];
  return {
    pendiente: false,
    companiasDeSerie: companias.filas.length === 0,
    nivelesDeSerie: niveles.filas.length === 0,
    ajustesDeSerie: !fila,
    contexto: {
      cuadro: CUADRO_VIGENTE,
      companias: companias.filas.length
        ? companias.filas.map((c) => ({
            codigo: c.codigo,
            nombre: c.nombre,
            regla: c.regla,
            calendario: c.calendario,
            pctHucha: numero(c.pct_hucha),
            mesesHastaCobro: numero(c.meses_hasta_cobro),
          }))
        : COMPANIAS_DE_SERIE,
      cierres: cierres.filas.map((c) => ({
        mes: c.mes,
        calendario: c.calendario,
        confirmarHasta: c.confirmar_hasta,
        incidenciasHasta: c.incidencias_hasta,
      })),
      niveles: niveles.filas.length
        ? niveles.filas.map((n) => ({
            nombre: n.nombre,
            valorUnidad: numero(n.valor_unidad),
            desdeUnidades: numero(n.desde_unidades),
            desdeMes: n.desde_mes,
          }))
        : NIVELES_DE_SERIE,
      ajustes: fila
        ? { unidadesPrevias: numero(fila.unidades_previas), pctHucha: numero(fila.pct_hucha), pctIrpf: numero(fila.pct_irpf) }
        : AJUSTES_DE_SERIE,
      herramientas: herramientas.filas.map((h) => ({
        mesProduccion: h.mes_produccion,
        unidades: numero(h.unidades),
        unidadesNivel: numero(h.unidades_nivel),
        estado: h.estado,
      })),
    },
  };
}

/** ¿Está ese código en las compañías del contexto? (sin él, la base de datos no deja guardar: FK) */
export function companiaConocida(codigo, contexto) {
  return contexto.companias.some((c) => c.codigo === codigo);
}

// ---------------------------------------------------------------------------------------------
// Lo guardado: líneas, liquidaciones y cargos
// ---------------------------------------------------------------------------------------------

/**
 * Las comisiones guardadas (vista `consultoria_lineas`: solo las de `unidades > 0` que cuentan), con
 * `aportacionDe` si son una APEX
 */
export async function leerLineasGuardadas(supabase, consultorId) {
  const { data, error } = await leerConApex(
    (columnas) =>
      leerTodo(() =>
        supabase
          .from("consultoria_lineas")
          .select(columnas)
          .eq("consultor_id", consultorId)
          .order("mes")
          .order("herramienta_id"),
      ),
    "mes, prevista, cobrada, unidades, bruto, hucha, pct_irpf, liquidacion_id",
  );
  if (error) {
    if (faltaLaMigracion(error)) return [];
    parar(`No se han podido leer las liquidaciones: ${error.message}`);
  }
  return data.map((l) => ({
    mes: l.mes,
    prevista: l.prevista,
    cobrada: l.cobrada,
    unidades: numero(l.unidades),
    bruto: numero(l.bruto),
    hucha: numero(l.hucha),
    pctIrpf: numero(l.pct_irpf),
    aportacionDe: l.aportacion_de ?? null,
  }));
}

/** Las liquidaciones que ya han llegado, por mes (`AAAA-MM-01` → `{ id, mes, fecha, numero, importe_recibido }`) */
export async function leerLiquidacionesGuardadas(supabase, consultorId) {
  const { data, error } = await supabase
    .from("consultoria_liquidaciones")
    .select("id, mes, fecha, numero, importe_recibido")
    .eq("consultor_id", consultorId)
    .order("mes");
  if (error) {
    if (faltaLaMigracion(error)) return new Map();
    parar(`No se han podido leer las liquidaciones: ${error.message}`);
  }
  return new Map(data.map((l) => [l.mes, l]));
}

/**
 * Los cargos y abonos de la cuenta de comisiones (vista `consultoria_cuenta_movimientos`: los de
 * `consultoria_cuenta` y los restos de los extornos), cada uno en el mes en que cuenta: el de su
 * liquidación si ya se aplicó, el previsto si es un resto de extorno y, si es un cargo sin aplicar,
 * el primer mes que aún no ha llegado (entra en la siguiente liquidación que llegue)
 */
export async function leerCargosGuardados(supabase, consultorId, llegadas) {
  const { data, error } = await leerTodo(() =>
    supabase
      .from("consultoria_cuenta_movimientos")
      .select("fecha, concepto, importe, liquidacion_id, aplicado, mes_previsto, cargo_id, extorno_id")
      .eq("consultor_id", consultorId)
      .order("fecha"),
  );
  if (error) {
    if (faltaLaMigracion(error)) return [];
    parar(`No se ha podido leer la cuenta de comisiones: ${error.message}`);
  }
  const mesDe = new Map([...llegadas.values()].map((l) => [l.id, l.mes]));
  return data.map((c) => ({
    fecha: c.fecha,
    concepto: c.concepto,
    importe: numero(c.importe),
    cargoId: c.cargo_id,
    extornoId: c.extorno_id,
    liquidacionId: c.liquidacion_id,
    /** null = un cargo sin aplicar: se reparte al primer mes pendiente en `liquidacionesPorMes` */
    mes: c.liquidacion_id ? (mesDe.get(c.liquidacion_id) ?? null) : (c.mes_previsto ?? null),
  }));
}

// ---------------------------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------------------------

const FORMATO_NUMERO = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // Sin esto, el español deja «1153,60» en las cifras de cuatro dígitos
  useGrouping: "always",
});

/** `1153.6` → `1.153,60`; en negativo, con «−» (no con el guion, que el panel lee como separador) */
export function numeroEnTexto(valor) {
  const texto = FORMATO_NUMERO.format(Math.abs(valor));
  return valor < 0 && texto !== "0,00" ? `−${texto}` : texto;
}

export const euros = (valor) => `${numeroEnTexto(valor)} €`;
export const unidades = (valor) => `${numeroEnTexto(valor)} u`;
export const porcentaje = (valor) => `${String(valor).replace(".", ",")} %`;

/** `2026-11-01` → `noviembre de 2026` */
export function mesEnTexto(mes) {
  const nombres = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${nombres[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------------------------
// La liquidación de cada mes y la línea de la casilla de OVB
// ---------------------------------------------------------------------------------------------

/**
 * Cuántas herramientas, APEX y previstas dicen esas líneas, como en la casilla de OVB: sin APEX,
 * exactamente como antes («5 herramientas (2 previstas)», «2 herramientas previstas»); con APEX, «4
 * herramientas y 1 APEX (2 previstas)». Las previstas cuentan también las APEX
 */
export function herramientasDeLaCasilla(lineas) {
  const recuento = recuentoDelMes(lineas);
  const n = recuento.herramientas + recuento.apex;
  const { previstas } = recuento;
  if (n === 0) return "sin herramientas";
  if (recuento.apex > 0) {
    const texto = textoDeHerramientas(recuento);
    return previstas ? `${texto} (${plural(previstas, "prevista", "previstas")})` : texto;
  }
  if (previstas === 0) return plural(n, "herramienta", "herramientas");
  if (previstas === n) return n === 1 ? "1 herramienta prevista" : `${n} herramientas previstas`;
  return `${plural(n, "herramienta", "herramientas")} (${plural(previstas, "prevista", "previstas")})`;
}

/**
 * La línea de un mes con el formato de la casilla de los cobros de OVB, **sin nombres de
 * clientes**: `2026-11 — Liquidación OVB · 4 herramientas y 1 APEX (2 previstas) · 542,40 u — 924,86 €` (ejemplo de las notas de producción)
 * (sin APEX enganchadas, `5 herramientas (2 previstas)`, como antes). Las unidades son las de todas las
 * líneas, también las APEX. El importe que va tras « — » es **lo que llega al banco** (el importe a
 * pagar, que es lo que lee el panel); si no coincide con el de la liquidación (cargos, saldo anterior
 * o menos de 50 €), el detalle va detrás, entre paréntesis.
 * `lineas`: `{ prevista, unidades, aportacionDe? }` del mes
 */
export function lineaDeLiquidacion(mes, lineas, liquidacion, paso, cobradaEl = null) {
  const herramientas = herramientasDeLaCasilla(lineas);

  const centesimas = lineas.reduce((total, l) => total + Math.round(l.unidades * 100), 0);
  const detalle = [];
  if (liquidacion.cargos !== 0) detalle.push(`${euros(liquidacion.cargos)} de cargos y abonos`);
  if (paso.saldoAnterior !== 0) detalle.push(`${euros(paso.saldoAnterior)} de saldo anterior`);
  let texto =
    `${mes.slice(0, 7)} — Liquidación OVB · ${herramientas} · ${unidades(centesimas / 100)} — ${euros(paso.aPagar)}` +
    `${cobradaEl ? ` — cobrado ${cobradaEl}` : ""}`;
  if (paso.aPagar === 0 && paso.saldoDespues !== 0) {
    texto += ` (sin transferencia: la liquidación es de ${euros(liquidacion.importe)}${detalle.length ? `, con ${detalle.join(" y ")}` : ""}; no llega a ${euros(CUADRO_VIGENTE.minimoTransferencia)} y ${euros(paso.saldoDespues)} pasan a la siguiente)`;
  } else if (detalle.length) {
    texto += ` (la liquidación es de ${euros(liquidacion.importe)}, con ${detalle.join(" y ")})`;
  }
  return texto;
}

/**
 * Cada mes con algo, del más antiguo al más nuevo, como lo liquida OVB: `calcularLiquidacion` (la
 * RC por fila y el IRPF sobre el total), con los cargos y abonos de ese mes, y la cuenta de
 * comisiones (`cuentaDeComisiones`) con el mínimo de transferencia del cuadro (50 €).
 * - `lineas`: `{ mes, prevista, unidades, bruto, hucha, pctIrpf, aportacionDe }` (solo las que cuentan)
 * - `cargos`: `{ mes, importe }`; los de `mes` nulo (sin aplicar) van al primer mes que no ha llegado
 * - `llegadas`: `Map` de mes → `{ fecha }` de las liquidaciones que ya han llegado
 * Devuelve `{ mes, lineas, liquidacion, paso, texto }` por mes, y los cargos que no tienen dónde ir
 */
export function liquidacionesPorMes({ lineas, cargos = [], llegadas = new Map(), saldoInicial = 0 }) {
  const meses = new Set([...lineas.map((l) => l.mes), ...cargos.filter((c) => c.mes).map((c) => c.mes), ...llegadas.keys()]);
  const ordenados = [...meses].sort();
  const pendiente = ordenados.find((m) => !llegadas.has(m)) ?? null;
  const cargosDe = new Map();
  const sinMes = [];
  for (const cargo of cargos) {
    const mes = cargo.mes ?? pendiente;
    if (!mes) {
      sinMes.push(cargo);
      continue;
    }
    if (!cargosDe.has(mes)) cargosDe.set(mes, []);
    cargosDe.get(mes).push(cargo.importe);
  }

  const delMes = (mes) => lineas.filter((l) => l.mes === mes);
  const liquidaciones = ordenados.map((mes) => calcularLiquidacion(delMes(mes), cargosDe.get(mes) ?? []));
  const pasos = cuentaDeComisiones(
    ordenados.map((mes, i) => ({ mes, importe: liquidaciones[i].importe })),
    saldoInicial,
    CUADRO_VIGENTE.minimoTransferencia,
  );
  return {
    meses: ordenados.map((mes, i) => ({
      mes,
      lineas: delMes(mes),
      liquidacion: liquidaciones[i],
      paso: pasos[i],
      texto: lineaDeLiquidacion(mes, delMes(mes), liquidaciones[i], pasos[i], llegadas.get(mes)?.fecha ?? null),
    })),
    sinMes,
  };
}

/** ¿Es una línea de liquidación? Como `consultoria_lineas`: con unidades que cobrar y no anulada, o anulada ya cobrada */
export const cuentaEnLiquidacion = (h) => h.unidades > 0 && (h.estado !== "anulada" || Boolean(h.liquidada));

// ---------------------------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------------------------

/** Para comparar nombres: sin mayúsculas, sin acentos y con los espacios de uno en uno */
export function claveDeNombre(nombre) {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Para comparar productos: como los nombres, y sin lo que vaya tras « · » («TopPlan · aportación extraordinaria» es «TopPlan») */
export function claveDeProducto(producto) {
  return claveDeNombre(String(producto ?? "").split("·")[0]);
}

/**
 * ¿Puede ser `h` la herramienta de la que cuelga una aportación extraordinaria (APEX) de esa compañía
 * y producto? La misma compañía y producto, **no única** (una única sin enlace es una APEX de antes, o
 * una prima única), sin anular y que no sea a su vez una APEX: un solo nivel. El cliente lo mira quien
 * llama. `h`: `{ compania, producto, periodicidad, estado, aportacionDe }`
 */
export function puedeSerSuMadre(h, apex) {
  return (
    h.compania === apex.compania &&
    claveDeProducto(h.producto) === claveDeProducto(apex.producto) &&
    h.periodicidad !== "unica" &&
    h.estado !== "anulada" &&
    !h.aportacionDe
  );
}

/**
 * El nombre de un cliente como viene en una nota, en el histórico o en `--cliente`: sin `[[ ]]` ni
 * alias, y con lo que vaya entre paréntesis al final como su referencia (`Lucía Prieto (ref. Marta)`
 * → nombre `Lucía Prieto`, referencia `ref. Marta`)
 */
export function separarCliente(texto) {
  let limpio = String(texto ?? "").trim();
  const enlace = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(limpio);
  if (enlace) limpio = enlace[1].trim();
  const conReferencia = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(limpio);
  if (conReferencia && conReferencia[1].trim()) {
    return { nombre: conReferencia[1].trim().replace(/\s+/g, " "), referencia: conReferencia[2].trim() };
  }
  return { nombre: limpio.replace(/\s+/g, " "), referencia: null };
}

// ---------------------------------------------------------------------------------------------
// Notas: frontmatter
// ---------------------------------------------------------------------------------------------

function valorYaml(crudo) {
  const texto = crudo.trim();
  if (texto.startsWith('"')) {
    const fin = texto.lastIndexOf('"');
    if (fin > 0) {
      try {
        return JSON.parse(texto.slice(0, fin + 1));
      } catch {
        return texto.slice(1, fin);
      }
    }
  }
  if (texto.startsWith("'")) {
    const fin = texto.lastIndexOf("'");
    if (fin > 0) return texto.slice(1, fin).replace(/''/g, "'");
  }
  const sinComentario = texto.replace(/\s+#.*$/, "").trim();
  if (sinComentario === "" || sinComentario === "~" || sinComentario === "null") return null;
  return sinComentario;
}

/**
 * El frontmatter de una nota como `{ datos: { clave: texto }, cuerpo }`. Solo `clave: valor` en una
 * línea (con o sin comillas), que es lo que tienen las notas de producción y del calendario; las
 * listas y lo anidado se saltan. `null` si la nota no tiene frontmatter
 */
export function leerFrontmatter(texto) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/);
  if (lineas[0]?.trim() !== "---") return null;
  const datos = {};
  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i];
    const limpia = linea.trim();
    if (limpia === "---" || limpia === "...") return { datos, cuerpo: lineas.slice(i + 1).join("\n") };
    if (!limpia || limpia.startsWith("#") || /^\s/.test(linea) || limpia.startsWith("- ")) continue;
    const encontrado = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(linea);
    if (encontrado) datos[encontrado[1]] = valorYaml(encontrado[2] ?? "");
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Notas: el calendario de cierres
// ---------------------------------------------------------------------------------------------

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `Enero`, `ene`, `sept.` o `setiembre` → 1…12; si no es un mes, 0 */
function numeroDeMes(texto) {
  const clave = claveDeNombre(texto).replace(/\.$/, "");
  if (/^\d{1,2}$/.test(clave)) return Number(clave) >= 1 && Number(clave) <= 12 ? Number(clave) : 0;
  const corto = clave.slice(0, 3) === "set" ? "sep" : clave.slice(0, 3);
  const indice = MESES_CORTOS.indexOf(corto);
  const valido = indice !== -1 && (clave.length <= 4 || MESES_LARGOS[indice] === clave || clave === "setiembre");
  return valido ? indice + 1 : 0;
}

const CALENDARIOS = { intesa: "INTESA", avanza: "AVANZA", "axa pias": "AXA_PIAS", ranking: "RANKING" };
const ORDEN_DE_CALENDARIOS = ["INTESA", "AVANZA", "AXA_PIAS", "RANKING"];
export const NOMBRE_DEL_CALENDARIO = { INTESA: "INTESA", AVANZA: "AVANZA", AXA_PIAS: "AXA PIAS", RANKING: "Ranking" };

function fechaSiExiste(anio, mes, dia) {
  const texto = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  try {
    primerDiaDelMes(texto);
    return texto;
  } catch {
    return null;
  }
}

/**
 * Una casilla del calendario: `19 · inc. 21` (el mismo mes), `26 · inc. 3 feb` (el mes siguiente;
 * en diciembre, enero del año siguiente), `22 · inc. en enero` (incidencias sin fecha) o solo `19`.
 * Devuelve `{ confirmarHasta, incidenciasHasta }` o un texto con lo que no se entiende
 */
function leerCasilla(texto, anio, mes) {
  const casilla = texto.replace(/\s+/g, " ").trim();
  const partes = /^(\d{1,2})(?:\s*·\s*inc\.?\s*(.+))?$/i.exec(casilla);
  if (!partes) return "no tiene la forma «19 · inc. 21»";
  const confirmarHasta = fechaSiExiste(anio, mes, Number(partes[1]));
  if (!confirmarHasta) return `el día ${partes[1]} no existe en ese mes`;
  if (partes[2] === undefined) return { confirmarHasta, incidenciasHasta: null };

  const incidencias = partes[2].trim();
  if (/^en\s+\S+$/i.test(incidencias)) {
    if (!numeroDeMes(incidencias.slice(3))) return `«${incidencias}» no es un mes`;
    return { confirmarHasta, incidenciasHasta: null };
  }
  const conMes = /^(\d{1,2})(?:\s+(?:de\s+)?(\S+?))?$/i.exec(incidencias);
  if (!conMes) return `no entiendo las incidencias «${incidencias}»`;
  let mesIncidencias = mes;
  let anioIncidencias = anio;
  if (conMes[2] !== undefined) {
    const nombrado = numeroDeMes(conMes[2]);
    if (!nombrado) return `«${conMes[2]}» no es un mes`;
    const siguiente = mes === 12 ? 1 : mes + 1;
    if (nombrado === siguiente) {
      mesIncidencias = siguiente;
      anioIncidencias = mes === 12 ? anio + 1 : anio;
    } else if (nombrado !== mes) {
      return `las incidencias caen en ${conMes[2]}: solo pueden ser del mismo mes o del siguiente`;
    }
  }
  const incidenciasHasta = fechaSiExiste(anioIncidencias, mesIncidencias, Number(conMes[1]));
  if (!incidenciasHasta) return `el día ${conMes[1]} de las incidencias no existe en ese mes`;
  if (incidenciasHasta < confirmarHasta) return "las incidencias acaban antes que la confirmación";
  return { confirmarHasta, incidenciasHasta };
}

/**
 * La nota del calendario de producción de un año: el año de su propiedad `anio:` y la tabla
 * `| Mes | INTESA | AVANZA | AXA PIAS | Ranking |`. Devuelve `{ anio, cierres, meses }` con los
 * cierres como `Cierre` de las reglas. Si una casilla no se entiende, se para diciendo cuál
 */
export function leerCalendario(ruta) {
  let texto;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    parar(`No se puede leer la nota del calendario: ${ruta}`);
  }
  const nota = leerFrontmatter(texto);
  const anio = Number(nota?.datos.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    parar("La nota del calendario no dice su año: falta la propiedad «anio: AAAA» en el frontmatter.");
  }

  const lineas = (nota?.cuerpo ?? texto).split(/\r?\n/);
  const celdas = (linea) => linea.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const inicio = lineas.findIndex((l) => /^\s*\|\s*mes\s*\|/i.test(l));
  if (inicio === -1) parar("No encuentro la tabla de cierres («| Mes | INTESA | AVANZA | AXA PIAS | Ranking |»).");

  const cabecera = celdas(lineas[inicio]).slice(1).map((c) => CALENDARIOS[claveDeNombre(c)]);
  if (cabecera.some((c) => !c) || new Set(cabecera).size !== cabecera.length) {
    parar(`La cabecera de la tabla no es la esperada: «${lineas[inicio].trim()}». Columnas: INTESA, AVANZA, AXA PIAS y Ranking.`);
  }

  const cierres = [];
  const problemas = [];
  const vistos = new Set();
  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea.startsWith("|")) break;
    const fila = celdas(linea);
    if (fila.every((c) => /^:?-+:?$/.test(c))) continue; // la línea |---|---|
    const mes = numeroDeMes(fila[0]);
    if (!mes) {
      problemas.push(`«${fila[0]}» no es un mes`);
      continue;
    }
    if (vistos.has(mes)) problemas.push(`${fila[0]} está dos veces`);
    vistos.add(mes);
    cabecera.forEach((calendario, columna) => {
      const casilla = fila[columna + 1] ?? "";
      const leido = leerCasilla(casilla, anio, mes);
      if (typeof leido === "string") {
        problemas.push(`${fila[0]}, ${NOMBRE_DEL_CALENDARIO[calendario]}: «${casilla}» — ${leido}`);
        return;
      }
      cierres.push({ mes: fechaSiExiste(anio, mes, 1), calendario, ...leido });
    });
  }

  if (problemas.length) parar(`No entiendo estas casillas del calendario de ${anio}:\n  - ${problemas.join("\n  - ")}`);
  if (!cierres.length) parar("La tabla de cierres está vacía.");
  cierres.sort(
    (a, b) => a.mes.localeCompare(b.mes) || ORDEN_DE_CALENDARIOS.indexOf(a.calendario) - ORDEN_DE_CALENDARIOS.indexOf(b.calendario),
  );
  return { anio, cierres, meses: vistos.size };
}

// ---------------------------------------------------------------------------------------------
// Notas: la producción
// ---------------------------------------------------------------------------------------------

/**
 * El producto y la periodicidad de una nota: la propiedad `periodicidad` si la tiene; si no,
 * `unica` cuando el producto lleva «extraordinaria» y `mensual` en el resto. En una extraordinaria,
 * el producto se queda en lo de antes de « · » («TopPlan · aportación extraordinaria» → «TopPlan»).
 * `extraordinaria` dice si el producto lo decía: es una APEX, y el importador avisa si no encuentra
 * su herramienta
 */
export function productoYPeriodicidad(productoEntero, periodicidadDada) {
  const entero = String(productoEntero ?? "").trim();
  const extraordinaria = claveDeNombre(entero).includes("extraordinaria");
  const antes = entero.split(" · ")[0].trim();
  const producto = extraordinaria && antes ? antes : entero;
  if (periodicidadDada !== null && periodicidadDada !== undefined && String(periodicidadDada).trim() !== "") {
    return { producto, periodicidad: claveDeNombre(periodicidadDada), extraordinaria };
  }
  return { producto, periodicidad: extraordinaria ? "unica" : "mensual", extraordinaria };
}

/**
 * Lo del cuadro para una herramienta que viene de fuera (nota o histórico): su tipo de comisión (el
 * dado, el del cuadro o, fuera del cuadro, anticipada o única) y su reserva (la dada o la que
 * propone `pctHuchaPara` con sus unidades y si es propio)
 */
export function delCuadroPara(h, contexto) {
  const enCuadro = productoDelCuadro(h.compania, h.producto, h.periodicidad, contexto.cuadro);
  const tipoComision = h.tipoComision ?? enCuadro?.tipo ?? (h.periodicidad === "unica" ? "unica" : "anticipada");
  const reservaPropuesta = pctHuchaPara(h.compania, h.producto, h.periodicidad, contexto, {
    unidades: h.unidades,
    propio: h.propio,
  });
  return { enCuadro, tipoComision, reservaPropuesta };
}

/**
 * Las notas de producción de una carpeta (solo las `.md` con `tipo: produccion`, sin entrar en
 * subcarpetas) o de un `.json` con una lista de objetos con las mismas claves y `archivo` (el nombre
 * de la nota, para no duplicar al volver a importar). `partner` es el código de la compañía y tiene
 * que estar en las del contexto. Claves opcionales: `periodicidad`, `pct_hucha` (0 vale),
 * `tipo_comision`, `propio`, `duracion_anios` y `unidades_nivel`.
 * Devuelve las herramientas como las guardaría la base de datos (con `bruto` y `hucha` calculados),
 * las que se apartan (anuladas que no se importan solas) y los problemas
 */
export function leerProduccion(ruta, contexto) {
  let entradas;
  let esCarpeta;
  try {
    esCarpeta = statSync(ruta).isDirectory();
  } catch {
    parar(`No existe: ${ruta}`);
  }

  if (esCarpeta) {
    entradas = readdirSync(ruta)
      .filter((archivo) => archivo.toLowerCase().endsWith(".md"))
      .sort()
      .map((archivo) => {
        const nota = leerFrontmatter(readFileSync(path.join(ruta, archivo), "utf8"));
        return nota ? { archivo: archivo.slice(0, -3), datos: nota.datos, cuerpo: nota.cuerpo } : null;
      })
      .filter((nota) => nota && claveDeNombre(nota.datos.tipo) === "produccion");
  } else if (ruta.toLowerCase().endsWith(".json")) {
    let lista;
    try {
      lista = JSON.parse(readFileSync(ruta, "utf8").replace(/^﻿/, ""));
    } catch (error) {
      parar(`No se puede leer el JSON: ${error.message}`);
    }
    if (!Array.isArray(lista)) parar("El JSON de notas tiene que ser una lista de objetos (o un histórico con «formato»).");
    entradas = lista.map((datos, i) => {
      if (!datos || typeof datos !== "object") parar(`El elemento ${i + 1} del JSON no es un objeto.`);
      const archivo = String(datos.archivo ?? "").trim().replace(/\.md$/i, "");
      if (!archivo) parar(`El elemento ${i + 1} del JSON no tiene «archivo» (el nombre de su nota): sin él, volver a importar duplicaría.`);
      return { archivo, datos, cuerpo: String(datos.notas ?? "") };
    });
    const repetidos = entradas.map((e) => e.archivo).filter((a, i, todos) => todos.indexOf(a) !== i);
    if (repetidos.length) parar(`En el JSON, «archivo» se repite: ${[...new Set(repetidos)].join(", ")}.`);
  } else {
    parar("Se espera una carpeta con notas .md o un archivo .json.");
  }

  const herramientas = [];
  const apartadas = [];
  const problemas = [];

  for (const { archivo, datos, cuerpo } of entradas) {
    const avisos = [];
    const fallos = [];
    const intento = (leer) => {
      try {
        return leer();
      } catch (error) {
        if (!(error instanceof Parada)) throw error;
        fallos.push(error.message);
        return null;
      }
    };
    const dado = (clave) => datos[clave] !== null && datos[clave] !== undefined && String(datos[clave]).trim() !== "";

    const { nombre, referencia } = separarCliente(datos.cliente);
    if (!nombre) fallos.push("falta el cliente");
    else if (nombre.length > 80) fallos.push("el nombre del cliente pasa de 80 caracteres");
    if (referencia && referencia.length > 40) fallos.push(`la referencia «${referencia}» pasa de 40 caracteres`);

    const compania = intento(() => leerCodigo(datos.partner ?? datos.compania, "partner"));
    if (compania && !companiaConocida(compania, contexto)) fallos.push(`la compañía «${compania}» no está en tus compañías: añádela antes`);

    const { producto, periodicidad, extraordinaria } = productoYPeriodicidad(datos.producto, datos.periodicidad);
    if (!producto) fallos.push("falta el producto");
    else if (producto.length > 60) fallos.push("el producto pasa de 60 caracteres");
    if (!["mensual", "unica"].includes(periodicidad)) fallos.push(`periodicidad «${datos.periodicidad}»: mensual o unica`);

    const pago = dado("pago") ? claveDeNombre(datos.pago) : "domiciliacion";
    if (!["domiciliacion", "transferencia"].includes(pago)) fallos.push(`pago «${datos.pago}»: domiciliacion o transferencia`);

    const aportacion = intento(() => leerCantidad(datos.aportacion, "aportacion"));
    const unidadesNota = intento(() => leerCantidad(datos.unidades, "unidades", { cero: true }));
    const unidadesNivel = dado("unidades_nivel") ? intento(() => leerCantidad(datos.unidades_nivel, "unidades_nivel", { cero: true })) : null;
    const valorUnidad = intento(() => leerCantidad(datos.valor_unidad, "valor_unidad"));
    const pctHuchaDado = dado("pct_hucha") ? intento(() => leerCantidad(datos.pct_hucha, "pct_hucha", { cero: true, maximo: 100 })) : null;
    const propio = dado("propio") ? intento(() => leerSiNo(datos.propio, "propio")) : false;
    const duracionAnios = dado("duracion_anios") ? intento(() => leerEntero(datos.duracion_anios, "duracion_anios", 1, 99)) : null;
    const tipoDado = dado("tipo_comision") ? claveDeNombre(datos.tipo_comision) : null;
    if (tipoDado && !TIPOS_DE_COMISION.includes(tipoDado)) fallos.push(`tipo_comision «${datos.tipo_comision}»: ${TIPOS_DE_COMISION.join(", ")}`);
    if (unidadesNota === 0 && !(unidadesNivel > 0)) fallos.push("con 0 unidades hacen falta unidades_nivel (las de producción)");

    const mesProduccion = intento(() => leerMes(datos.mes_produccion, "mes_produccion"));
    const fechaEfecto = intento(() => leerFecha(datos.fecha_efecto, "fecha_efecto"));
    let fechaCobro = intento(() => leerFecha(datos.fecha_cobro, "fecha_cobro"));
    if (fechaCobro && fechaCobro !== ultimoDiaDelMes(fechaCobro)) {
      avisos.push(`el cobro decía ${fechaCobro}: se lleva al último día de su mes, ${ultimoDiaDelMes(fechaCobro)}`);
      fechaCobro = ultimoDiaDelMes(fechaCobro);
    }
    if (fechaEfecto && fechaCobro && fechaCobro < fechaEfecto) fallos.push(`el cobro (${fechaCobro}) es antes que el efecto (${fechaEfecto})`);

    const estado = claveDeNombre(datos.estado);
    if (!ESTADOS.includes(estado)) fallos.push(`estado «${datos.estado ?? ""}»: ${ESTADOS.join(", ")}`);

    let anuladaEl = null;
    if (estado === "anulada") {
      if (/extorno/i.test(cuerpo)) {
        apartadas.push({ archivo, motivo: "anulada con extorno en sus notas: se apunta a mano (la herramienta y su extorno)" });
        continue;
      }
      if (!dado("anulada_el")) {
        apartadas.push({ archivo, motivo: "anulada sin «anulada_el» (el día de la cancelación): se apunta a mano" });
        continue;
      }
      anuladaEl = intento(() => leerFecha(datos.anulada_el, "anulada_el"));
    }

    if (fallos.length) {
      problemas.push(`${archivo}: ${fallos.join("; ")}`);
      continue;
    }

    const base = { compania, producto, periodicidad, unidades: unidadesNota, propio, tipoComision: tipoDado };
    const { enCuadro, tipoComision, reservaPropuesta } = delCuadroPara(base, contexto);
    const pctHucha = pctHuchaDado ?? reservaPropuesta;
    if (pctHuchaDado !== null && Math.round(pctHuchaDado * 100) !== Math.round(reservaPropuesta * 100)) {
      avisos.push(`la nota dice una reserva del ${porcentaje(pctHuchaDado)}; el cuadro propone el ${porcentaje(reservaPropuesta)} (se importa lo de la nota)`);
    }
    if (!enCuadro) avisos.push(`«${producto}» de ${compania} no está en el cuadro ${contexto.cuadro.version}: reserva de la compañía o de Ajustes`);
    const pctIrpf = contexto.ajustes.pctIrpf;
    const importes = calcularImportes(unidadesNota, valorUnidad, pctHucha, pctIrpf);

    herramientas.push({
      archivo,
      origen: `nota:${archivo}`,
      cliente: { nombre, referencia, clave: claveDeNombre(nombre) },
      compania,
      producto,
      pago,
      periodicidad,
      tipoComision,
      duracionAnios,
      propio,
      aportacion,
      unidades: unidadesNota,
      unidadesNivel,
      valorUnidad,
      pctHucha,
      pctIrpf,
      mesProduccion,
      fechaEfecto,
      fechaCobro,
      estado,
      anuladaEl,
      bruto: importes.bruto,
      hucha: importes.hucha,
      extraordinaria,
      // La herramienta de la que cuelga, si es una APEX: la pone el importador (o la firma, con --apex)
      aportacionDe: null,
      avisos,
    });
  }

  return { herramientas, apartadas, problemas, leidas: entradas.length };
}

/** Una herramienta (de las notas o nueva) como línea de liquidación, si lo es */
export function comoLinea(h) {
  return {
    mes: primerDiaDelMes(h.fechaCobro),
    prevista: h.estado === "prevista",
    unidades: h.unidades,
    bruto: h.bruto,
    hucha: h.hucha,
    pctIrpf: h.pctIrpf,
    aportacionDe: h.aportacionDe ?? null,
  };
}
