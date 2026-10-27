/**
 * Copia la consultoría de FSM-Finance a la base del panel y compara las cifras de las dos (REQ-001,
 * spec 6.1 del panel; ADR-003). Se puede repetir desde cero hasta el cambio (spec 6.4).
 *
 *   npm run consultoria:copiar -- --origen <ruta al .env.local de FSM-Finance> [--guardar] [--exportar <archivo.json>]
 *
 * - **El origen se lee con su propio `.env.local`** (`NEXT_PUBLIC_SUPABASE_URL` y
 *   `SUPABASE_SERVICE_ROLE_KEY`), cuya ruta se le pasa: **solo `select`**. El cliente del origen solo
 *   deja llamar a `from(…).select(…)`, así que no puede escribir aunque el código se equivoque. El
 *   consultor de origen es el único `perfiles.rol = 'consultor'`
 * - **El destino es la base del panel**, con `SUPABASE_URL` y `SUPABASE_SECRET_KEY` de su `.env.local`.
 *   Si faltan las variables, la 0001 o los datos, lo dice y enseña igual el origen
 * - **Sin `--guardar` (vista previa) no escribe nada** y enseña, de origen y destino lado a lado, con
 *   «igual» o «DISTINTO» en cada fila: las filas y la huella de cada tabla (`sha256` del JSON de sus
 *   filas por clave primaria, sin las columnas generadas, con los números como texto y las fechas
 *   tal cual), la línea de la casilla de OVB de cada mes, la hucha, el nivel y los clientes. **Sin
 *   nombres**: solo recuentos, huellas e importes. El destino se lee entero (sin filtrar por consultor),
 *   así que una fila de más también sale como distinta
 * - **Con `--guardar`**: para si el destino ya es la fuente (`fuente_desde`) o si alguna de sus tablas
 *   tiene filas. Si no, inserta conservando `id`, `consultor_id`, `creado_en`/`creada_en` y `origen`,
 *   sin las columnas generadas, en el orden que piden los disparadores (spec 6.1, paso 2), vuelve a
 *   leer el destino y compara otra vez. PostgREST no hace una transacción entre tablas: si una
 *   inserción falla a medias, lo dice y pide vaciar (bloque de 6.3) y repetir; no intenta arreglarlo
 * - **Con `--exportar <archivo.json>`**: escribe las filas de origen en un JSON
 *   (`formato: "consultoria-copia-v1"`). **Lleva nombres**: se niega si la ruta está dentro de un repo
 *   con remoto que no la ignore, y nunca sobrescribe un archivo
 * - Sale con código 0 si todo es igual y con 1 si algo es distinto, si el destino no se puede comparar
 *   o si se para
 *
 * - **El consultor se inserta solo con `id`, `nombre` («Facundo») y `creado_en`** (el de su perfil en
 *   FSM-Finance): `fuente_desde` no se escribe nunca, ni nulo. La clave secreta no puede cambiarlo
 *   (la 0001 solo le deja `update (nombre)`); el cambio lo hace Facundo como `postgres` (spec 6.4).
 *   Ningún script hace `update` de `consultoria_consultores`
 * - Si `SUPABASE_URL` apunta a una base con `perfiles` (la de FSM-Finance u otra), o a la misma que
 *   `--origen`, para antes de leer nada más
 *
 * Nunca imprime una clave ni un nombre.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hoyEnMadrid, saldoDeHucha, valorUnidadDelMes } from "../lib/consultoria/reglas.ts";
import {
  AVISO_COPIA,
  AVISO_MIGRACION,
  RAIZ,
  comprobarQueEsLaDelPanel,
  cargarContexto,
  clienteDeSupabase,
  conectar,
  euros,
  hayMigracion,
  lanzar,
  leerArgumentos,
  leerCargosGuardados,
  leerEnv,
  leerLineasGuardadas,
  leerLiquidacionesGuardadas,
  leerTodo,
  liquidacionesPorMes,
  parar,
  unidades,
} from "./consultoria-comun.mjs";

const USO =
  "Uso: npm run consultoria:copiar -- --origen <ruta al .env.local de FSM-Finance> [--guardar] [--exportar <archivo.json>]";

/** El nombre del consultor en la base del panel (spec 6.1) */
const NOMBRE_EN_DESTINO = "Facundo";
/** El día de la hucha que se compara además de hoy (spec 6.1) */
const DIA_DE_LA_HUCHA = "2026-07-29";
/** Los meses cuyo nivel se compara (spec 6.1) */
const MESES_DEL_NIVEL = ["2026-10-01", "2026-11-01"];
const POR_INSERCION = 500;

/**
 * Las diez tablas de la consultoría, **en el orden en que se insertan** (spec 6.1, paso 2), con su
 * clave primaria y sus columnas sin las generadas (`bruto`, `hucha`, `irpf`, `neto` y `resto`, que
 * Postgres no deja escribir). Las columnas son las de la 0013 y la 0016 de FSM-Finance, iguales que las
 * de la 0001 del panel
 */
const TABLAS = [
  {
    tabla: "consultoria_companias",
    clave: ["consultor_id", "codigo"],
    columnas: ["consultor_id", "codigo", "nombre", "regla", "calendario", "pct_hucha", "meses_hasta_cobro"],
  },
  {
    tabla: "consultoria_ajustes",
    clave: ["consultor_id"],
    columnas: ["consultor_id", "unidades_previas", "pct_hucha", "pct_irpf", "actualizado_en"],
  },
  {
    tabla: "consultoria_niveles",
    clave: ["id"],
    columnas: ["id", "consultor_id", "nombre", "valor_unidad", "desde_unidades", "desde_mes"],
  },
  {
    tabla: "consultoria_cierres",
    clave: ["consultor_id", "mes", "calendario"],
    columnas: ["consultor_id", "mes", "calendario", "confirmar_hasta", "incidencias_hasta"],
  },
  {
    tabla: "consultoria_clientes",
    clave: ["id"],
    columnas: ["id", "consultor_id", "nombre", "referencia", "proxima_revision", "notas", "creado_en"],
  },
  {
    tabla: "consultoria_liquidaciones",
    clave: ["id"],
    columnas: ["id", "consultor_id", "mes", "fecha", "numero", "importe_recibido", "notas", "creada_en"],
  },
  {
    tabla: "consultoria_herramientas",
    clave: ["id"],
    columnas: [
      "id", "consultor_id", "cliente_id", "compania", "producto", "pago", "periodicidad", "tipo_comision", "duracion_anios",
      "propio", "aportacion", "unidades", "unidades_nivel", "valor_unidad", "pct_hucha", "pct_irpf", "fecha_confirmacion",
      "mes_produccion", "fecha_efecto", "fecha_cobro", "estado", "fechas_provisionales", "liquidacion_id", "anulada_el",
      "notas", "origen", "creada_en", "aportacion_de",
    ],
  },
  {
    tabla: "consultoria_extornos",
    clave: ["id"],
    columnas: [
      "id", "consultor_id", "herramienta_id", "fecha", "importe", "de_hucha", "resto_cobro", "liquidacion_id", "irpf_hucha",
      "irpf_resto", "notas", "creado_en",
    ],
  },
  {
    tabla: "consultoria_cuenta",
    clave: ["id"],
    columnas: ["id", "consultor_id", "fecha", "concepto", "importe", "liquidacion_id", "creado_en"],
  },
  {
    tabla: "consultoria_hucha",
    clave: ["id"],
    columnas: ["id", "consultor_id", "fecha", "tipo", "importe", "irpf", "notas", "creado_en"],
  },
];

// ---------------------------------------------------------------------------------------------
// Las dos bases
// ---------------------------------------------------------------------------------------------

/** Un cliente que solo sabe leer: `from(tabla).select(…)` y nada más (ni insert, ni update, ni rpc) */
function soloLectura(cliente) {
  return { from: (tabla) => ({ select: (columnas, opciones) => cliente.from(tabla).select(columnas, opciones) }) };
}

/** El origen: FSM-Finance con las claves de su `.env.local`, de solo lectura, y su único consultor */
async function abrirOrigen(ruta) {
  const entorno = leerEnv(path.resolve(ruta));
  if (!entorno.NEXT_PUBLIC_SUPABASE_URL || !entorno.SUPABASE_SERVICE_ROLE_KEY) {
    parar(`En ${ruta} no están NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY: tiene que ser el .env.local de FSM-Finance.`);
  }
  const base = soloLectura(clienteDeSupabase(entorno.NEXT_PUBLIC_SUPABASE_URL, entorno.SUPABASE_SERVICE_ROLE_KEY, "FSM-Finance (NEXT_PUBLIC_SUPABASE_URL)"));
  const { data, error } = await base.from("perfiles").select("id, creado_en").eq("rol", "consultor");
  if (error) parar(`No se ha podido leer el consultor de FSM-Finance: ${error.code ?? "sin código"} ${error.message}`);
  if (data.length !== 1) parar(`En FSM-Finance hay ${data.length} consultores (perfiles.rol = 'consultor'): tiene que haber uno.`);
  return { base, consultorId: data[0].id, consultorCreadoEn: data[0].creado_en ?? null };
}

/**
 * El destino: la base del panel. `estado` dice si se puede comparar: `configuracion` (faltan las
 * variables), `0001` (falta la migración) o `lista`. Para leer, `lectura`; para escribir, `escritura`.
 * Si la URL apunta a una base con `perfiles` (la de FSM-Finance), se para
 */
async function abrirDestino({ obligatorio }) {
  const escritura = conectar({ obligatorio });
  if (!escritura) return { estado: "configuracion" };
  const lectura = soloLectura(escritura);
  await comprobarQueEsLaDelPanel(lectura);
  if (!(await hayMigracion(lectura))) return { estado: "0001", lectura, escritura };
  return { estado: "lista", lectura, escritura };
}

/** Las filas de una tabla, por su clave primaria. Con `consultorId`, solo las suyas; sin él, todas */
async function leerTabla(base, { tabla, clave, columnas }, consultorId, que) {
  const { data, error } = await leerTodo(() => {
    let consulta = base.from(tabla).select(columnas.join(", "));
    if (consultorId) consulta = consulta.eq("consultor_id", consultorId);
    for (const columna of clave) consulta = consulta.order(columna);
    return consulta;
  });
  if (error) parar(`No se ha podido leer ${tabla} de ${que}: ${error.code ?? "sin código"} ${error.message}`);
  // El orden también aquí, igual en las dos bases aunque ordenen el texto con otra intercalación
  const claveDe = (fila) => JSON.stringify(clave.map((c) => fila[c]));
  return [...data].sort((a, b) => (claveDe(a) < claveDe(b) ? -1 : claveDe(a) > claveDe(b) ? 1 : 0));
}

/** La huella de unas filas: `sha256` del JSON de sus columnas en orden, con los números como texto */
function huella(filas, columnas) {
  const canonico = (valor) => (valor === null || valor === undefined ? null : typeof valor === "number" ? String(valor) : valor);
  return createHash("sha256")
    .update(JSON.stringify(filas.map((fila) => columnas.map((c) => canonico(fila[c])))))
    .digest("hex");
}

/** Todas las tablas de una base, como `Map` de tabla → filas */
async function leerTablas(base, consultorId, que) {
  const tablas = new Map();
  for (const definicion of TABLAS) tablas.set(definicion.tabla, await leerTabla(base, definicion, consultorId, que));
  return tablas;
}

/**
 * Las cifras de la consultoría de un consultor, sin nombres, con las mismas funciones que los demás
 * scripts: la línea de la casilla de OVB de cada mes, la hucha (hoy y a `DIA_DE_LA_HUCHA`), las
 * unidades previas, el nivel de `MESES_DEL_NIVEL` y los clientes del resumen
 */
async function leerCifras(base, consultorId, que) {
  const llegadas = await leerLiquidacionesGuardadas(base, consultorId);
  const lineas = await leerLineasGuardadas(base, consultorId);
  const cargos = await leerCargosGuardados(base, consultorId, llegadas);
  const { meses, sinMes } = liquidacionesPorMes({ lineas, cargos, llegadas });

  const hucha = await leerTodo(() =>
    base.from("consultoria_hucha_movimientos").select("fecha, importe").eq("consultor_id", consultorId).order("fecha"),
  );
  if (hucha.error) parar(`No se ha podido leer la hucha de ${que}: ${hucha.error.code ?? "sin código"} ${hucha.error.message}`);
  const movimientos = hucha.data.map((m) => ({ fecha: m.fecha, importe: Number(m.importe) }));

  const resumen = await leerTodo(() =>
    base.from("consultoria_clientes_resumen").select("id, herramientas, previstas").eq("consultor_id", consultorId).order("id"),
  );
  if (resumen.error) parar(`No se han podido leer los clientes de ${que}: ${resumen.error.code ?? "sin código"} ${resumen.error.message}`);
  const sumar = (columna) => resumen.data.reduce((total, fila) => total + Number(fila[columna] ?? 0), 0);

  const { contexto } = await cargarContexto(base, consultorId);
  return {
    meses: new Map(meses.map((m) => [m.mes.slice(0, 7), m.texto])),
    cargosSinMes: sinMes.length,
    huchaHoy: saldoDeHucha(movimientos),
    huchaDelDia: saldoDeHucha(movimientos, DIA_DE_LA_HUCHA),
    previas: contexto.ajustes.unidadesPrevias,
    niveles: MESES_DEL_NIVEL.map((mes) => ({ mes, ...valorUnidadDelMes(mes, contexto) })),
    clientes: { clientes: resumen.data.length, herramientas: sumar("herramientas"), previstas: sumar("previstas") },
  };
}

// ---------------------------------------------------------------------------------------------
// La comparación, lado a lado
// ---------------------------------------------------------------------------------------------

const ANCHO_QUE = 38;
const ANCHO_LADO = 40;

/**
 * Compara origen y destino y lo enseña. `destino` es null si no se puede leer (el porqué ya se ha
 * dicho arriba): entonces sale solo el origen. Devuelve la lista de lo que es distinto
 */
function comparar(origen, destino) {
  const distintas = [];
  const fila = (que, a, b) => {
    const veredicto = destino === null ? "—" : a === b ? "igual" : "DISTINTO";
    if (destino !== null && a !== b) distintas.push(que);
    console.log(`  ${que.padEnd(ANCHO_QUE)}  ${String(a).padEnd(ANCHO_LADO)}  ${String(destino === null ? "—" : b).padEnd(ANCHO_LADO)}  ${veredicto}`);
  };
  const cabecera = (titulo) => console.log(`\n${titulo.padEnd(ANCHO_QUE + 4)}${"Origen".padEnd(ANCHO_LADO + 2)}Destino`);

  if (destino === null) console.log("  Se enseña solo el origen.");

  cabecera("Tablas: filas · huella");
  // El consultor: en origen, el único; en destino, uno y con el mismo id
  const consultorDestino =
    destino === null
      ? "—"
      : `${destino.consultores.length}${destino.consultores.length === 1 && destino.consultores[0].id !== origen.consultorId ? " · OTRO id" : ""}`;
  fila("consultoria_consultores (el consultor)", "1", consultorDestino);
  for (const { tabla, columnas } of TABLAS) {
    const de = (lado) => {
      const filas = lado.tablas.get(tabla);
      return `${filas.length} · ${huella(filas, columnas).slice(0, 12)}`;
    };
    fila(tabla, de(origen), destino === null ? "—" : de(destino));
  }

  cabecera("Cifras (sin nombres)");
  const cifra = (lado, leer) => (lado === null ? "—" : leer(lado.cifras));
  const apexDe = (lado) => lado.tablas.get("consultoria_herramientas").filter((h) => h.aportacion_de).length;
  fila("Clientes (resumen)", cifra(origen, (c) => c.clientes.clientes), cifra(destino, (c) => c.clientes.clientes));
  fila(
    "Herramientas: filas · APEX",
    `${origen.tablas.get("consultoria_herramientas").length} · ${apexDe(origen)}`,
    destino === null ? "—" : `${destino.tablas.get("consultoria_herramientas").length} · ${apexDe(destino)}`,
  );
  fila("Herramientas · previstas (resumen)", cifra(origen, (c) => `${c.clientes.herramientas} · ${c.clientes.previstas}`), cifra(destino, (c) => `${c.clientes.herramientas} · ${c.clientes.previstas}`));
  fila("Unidades previas", cifra(origen, (c) => unidades(c.previas)), cifra(destino, (c) => unidades(c.previas)));
  MESES_DEL_NIVEL.forEach((mes, i) => {
    const nivel = (c) => `${unidades(c.niveles[i].unidadesAntes)} · ${c.niveles[i].nivel || "sin nivel"}`;
    fila(`Nivel: unidades antes de ${mes.slice(0, 7)}`, cifra(origen, nivel), cifra(destino, nivel));
  });
  fila(`Hucha a ${DIA_DE_LA_HUCHA}`, cifra(origen, (c) => euros(c.huchaDelDia)), cifra(destino, (c) => euros(c.huchaDelDia)));
  fila(`Hucha hoy (${hoyEnMadrid()})`, cifra(origen, (c) => euros(c.huchaHoy)), cifra(destino, (c) => euros(c.huchaHoy)));
  fila("Cargos sin mes donde ir", cifra(origen, (c) => c.cargosSinMes), cifra(destino, (c) => c.cargosSinMes));

  console.log("\nCada mes, como la casilla de los cobros de OVB (sin nombres):");
  const meses = [...new Set([...origen.cifras.meses.keys(), ...(destino ? destino.cifras.meses.keys() : [])])].sort();
  if (!meses.length) console.log("  (ningún mes)");
  for (const mes of meses) {
    const a = origen.cifras.meses.get(mes) ?? "(no está)";
    const b = destino === null ? null : (destino.cifras.meses.get(mes) ?? "(no está)");
    const veredicto = destino === null ? "" : a === b ? "  igual" : "  DISTINTO";
    if (destino !== null && a !== b) distintas.push(`el mes ${mes}`);
    console.log(`  ${mes}${veredicto}`);
    console.log(`    origen:  ${a}`);
    if (destino !== null) console.log(`    destino: ${b}`);
  }
  return distintas;
}

/** Lee el destino entero para comparar: sus tablas sin filtrar, su consultor y sus cifras */
async function leerDestino(destino, origenConsultorId) {
  const { data: consultores, error } = await destino.lectura.from("consultoria_consultores").select("id, fuente_desde");
  if (error) parar(`No se ha podido leer el consultor de la base del panel: ${error.code ?? "sin código"} ${error.message}`);
  const tablas = await leerTablas(destino.lectura, null, "la base del panel");
  // Sin consultor (la base vacía), las cifras salen con el de origen: a cero
  const consultorId = consultores.length === 1 ? consultores[0].id : origenConsultorId;
  return { consultores, tablas, cifras: await leerCifras(destino.lectura, consultorId, "la base del panel") };
}

// ---------------------------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------------------------

/**
 * Por qué no se puede escribir ahí un archivo con nombres, o null si se puede: está dentro de un repo
 * de git con remoto que no lo ignora (se miran todos los repos hacia arriba). Si git no responde, no
 */
function porQueNoExportarEn(ruta) {
  const absoluta = path.resolve(ruta);
  for (let carpeta = path.dirname(absoluta); ; carpeta = path.dirname(carpeta)) {
    if (existsSync(path.join(carpeta, ".git"))) {
      let remotos;
      try {
        remotos = execFileSync("git", ["-C", carpeta, "remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      } catch {
        return `no se puede preguntar a git por el repo de ${carpeta}`;
      }
      if (remotos) {
        try {
          // 0 = lo ignora; 1 = no lo ignora; otro = no lo sabe. Solo vale el 0
          execFileSync("git", ["-C", carpeta, "check-ignore", "-q", absoluta], { stdio: "ignore" });
        } catch {
          return `está dentro del repo ${carpeta}, que tiene remoto y no lo ignora`;
        }
      }
    }
    if (path.dirname(carpeta) === carpeta) return null;
  }
}

function exportar(ruta, origen) {
  const doc = {
    formato: "consultoria-copia-v1",
    exportado_en: new Date().toISOString(),
    consultor_id: origen.consultorId,
    tablas: Object.fromEntries(TABLAS.map(({ tabla }) => [tabla, origen.tablas.get(tabla)])),
  };
  try {
    writeFileSync(path.resolve(ruta), `${JSON.stringify(doc, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") parar(`${ruta} ya existe: elige otro nombre (no se sobrescribe una copia).`);
    parar(`No se ha podido escribir ${ruta}: ${error.message}`);
  }
  const filas = TABLAS.reduce((total, { tabla }) => total + origen.tablas.get(tabla).length, 0);
  console.log(`\n✓ Exportadas las ${filas} filas de origen a ${path.resolve(ruta)}.`);
  console.log("  Lleva nombres de clientes: no la subas a ningún sitio ni la copies a una nota.");
}

// ---------------------------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------------------------

/** ¿Se puede copiar encima? Solo en una base del panel que aún no es la fuente y está vacía */
async function comprobarDestinoVacio(destino) {
  const { data: consultores, error } = await destino.lectura.from("consultoria_consultores").select("fuente_desde");
  if (error) parar(`No se ha podido leer el consultor de la base del panel: ${error.code ?? "sin código"} ${error.message}`);
  if (consultores.some((c) => c.fuente_desde)) parar("La base nueva ya es la fuente: no se copia encima. No se ha guardado nada.");

  const conFilas = [];
  for (const tabla of ["consultoria_consultores", ...TABLAS.map((t) => t.tabla)]) {
    const { count, error: fallo } = await destino.lectura.from(tabla).select("*", { count: "exact", head: true });
    if (fallo) parar(`No se ha podido contar ${tabla} en la base del panel: ${fallo.code ?? "sin código"} ${fallo.message}`);
    if (count) conFilas.push(`${tabla}: ${count}`);
  }
  if (conFilas.length) {
    parar(`La base nueva ya tiene filas (${conFilas.join(", ")}): vacíala antes con el bloque de 6.3 de la spec y vuelve a copiar. No se ha guardado nada.`);
  }
}

/** Inserta las filas de una tabla, de `POR_INSERCION` en `POR_INSERCION`, solo con sus columnas */
async function insertar(escritura, tabla, columnas, filas, copiadas, etiqueta = tabla) {
  for (let i = 0; i < filas.length; i += POR_INSERCION) {
    const tanda = filas.slice(i, i + POR_INSERCION).map((fila) => Object.fromEntries(columnas.map((c) => [c, fila[c] ?? null])));
    const { error } = await escritura.from(tabla).insert(tanda);
    if (error) {
      parar(
        `Se ha parado al copiar ${tabla} (${i} de ${filas.length} filas dentro): ${error.code ?? "sin código"} ${error.message}.\n` +
          `La base nueva se ha quedado a medias${copiadas.length ? ` (ya copiadas: ${copiadas.join(", ")})` : ""}: ` +
          "vacíala con el bloque de 6.3 de la spec y vuelve a copiar. FSM-Finance no se ha tocado.",
      );
    }
  }
  copiadas.push(`${etiqueta} ${filas.length}`);
}

/** La copia, en el orden de la spec 6.1 (paso 2) */
async function copiar(origen, destino) {
  const { escritura } = destino;
  const copiadas = [];
  // El consultor, solo con id, nombre y creado_en (el de su perfil en FSM-Finance): `fuente_desde`
  // no se escribe nunca, ni nulo. La clave secreta no puede cambiarlo; el cambio lo hace Facundo (spec 6.4)
  const consultor = { id: origen.consultorId, nombre: NOMBRE_EN_DESTINO, creado_en: origen.consultorCreadoEn };
  const columnasDelConsultor = consultor.creado_en ? ["id", "nombre", "creado_en"] : ["id", "nombre"];
  await insertar(escritura, "consultoria_consultores", columnasDelConsultor, [consultor], copiadas);
  for (const { tabla, columnas } of TABLAS) {
    const filas = origen.tablas.get(tabla);
    if (tabla === "consultoria_herramientas") {
      // Primero las que no son una APEX: el disparador de la APEX busca a su madre
      await insertar(escritura, tabla, columnas, filas.filter((h) => !h.aportacion_de), copiadas, `${tabla} (sin APEX)`);
      await insertar(escritura, tabla, columnas, filas.filter((h) => h.aportacion_de), copiadas, `${tabla} (APEX)`);
    } else {
      await insertar(escritura, tabla, columnas, filas, copiadas);
    }
  }
  console.log(`\n✓ Copiado: ${copiadas.join(" · ")}.`);
}

// ---------------------------------------------------------------------------------------------

async function principal() {
  const { opciones, sueltos } = leerArgumentos(process.argv.slice(2), { valores: ["origen", "exportar"], banderas: ["guardar"] });
  if (sueltos.length || !opciones.origen) parar(USO);
  const guardar = Boolean(opciones.guardar);
  if (opciones.exportar !== undefined) {
    if (!opciones.exportar.toLowerCase().endsWith(".json")) parar("--exportar: el archivo tiene que acabar en .json.");
    const motivo = porQueNoExportarEn(opciones.exportar);
    if (motivo) parar(`--exportar: no escribo una copia con nombres ahí (${motivo}). Usa la carpeta de laboratorio del PC.`);
  }
  // Antes de leer nada: el origen y el destino no pueden ser la misma base
  const hostDe = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };
  const hostOrigen = hostDe(leerEnv(path.resolve(opciones.origen)).NEXT_PUBLIC_SUPABASE_URL);
  if (hostOrigen && hostOrigen === hostDe(leerEnv(path.join(RAIZ, ".env.local")).SUPABASE_URL)) {
    parar("El origen y el destino son la misma base: revisa SUPABASE_URL en el .env.local del panel y la ruta de --origen. No se ha guardado nada.");
  }

  // ── El origen, entero y de solo lectura ───────────────────────────────────
  const abierto = await abrirOrigen(opciones.origen);
  const origen = {
    consultorId: abierto.consultorId,
    consultorCreadoEn: abierto.consultorCreadoEn,
    tablas: await leerTablas(abierto.base, abierto.consultorId, "FSM-Finance"),
    cifras: await leerCifras(abierto.base, abierto.consultorId, "FSM-Finance"),
  };

  // ── El destino ────────────────────────────────────────────────────────────
  const destino = await abrirDestino({ obligatorio: guardar });
  const motivo = {
    configuracion: "falta configurar la base del panel (SUPABASE_URL y SUPABASE_SECRET_KEY en su .env.local)",
    "0001": AVISO_MIGRACION.replace(/^Falta/, "falta"),
  }[destino.estado];

  console.log(`\nCopia de la consultoría de FSM-Finance a la base del panel${guardar ? "" : " · vista previa: no se escribe nada"}`);
  console.log("  Origen:  FSM-Finance, solo lectura");
  console.log(`  Destino: la base del panel${motivo ? ` · ${motivo}` : ""}`);

  if (opciones.exportar !== undefined) exportar(opciones.exportar, origen);

  const antes = destino.estado === "lista" ? await leerDestino(destino, origen.consultorId) : null;
  if (antes && antes.consultores.length === 0) console.log(`  (${AVISO_COPIA}.)`);
  const distintas = comparar(origen, antes);

  if (!guardar) {
    if (antes === null) {
      console.log(`\nNo se puede comparar: ${motivo}.\nEsto es una vista previa: no se ha guardado nada.\n`);
      process.exitCode = 1;
      return;
    }
    acabar(distintas, "Esto es una vista previa: no se ha guardado nada.");
    return;
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  if (destino.estado === "0001") parar(`${AVISO_MIGRACION}: hasta que se ejecute no se puede copiar. No se ha guardado nada.`);
  await comprobarDestinoVacio(destino);
  await copiar(origen, destino);

  console.log("\nDespués de copiar, el destino otra vez:");
  const despues = await leerDestino(destino, origen.consultorId);
  acabar(comparar(origen, despues), "La copia está guardada.");
}

/** El resumen y el código de salida: 0 si todo es igual, 1 si no */
function acabar(distintas, nota) {
  if (distintas.length) {
    console.log(`\nDISTINTO: ${distintas.join(", ")}.`);
    process.exitCode = 1;
  } else {
    console.log("\nTodo igual en las dos bases.");
  }
  console.log(`${nota}\n`);
}

lanzar(principal);
