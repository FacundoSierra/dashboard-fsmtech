/**
 * Pasa a la base del panel la producción de la consultoría (REQ-001; spec sección 6 de FSM-Finance y
 * 8 del panel). Dos entradas, por el contenido:
 *
 *   npm run consultoria:importar -- <carpeta|archivo.json>
 *        [--unidades-previas N] [--hucha-inicial N] [--aceptar-diferencias] [--guardar]
 *
 * **a) Las notas de producción**: una carpeta con notas `.md` (solo el frontmatter de las que tienen
 * `tipo: produccion`) o un `.json` con una lista de objetos con las mismas claves y `archivo`.
 * - `partner` es el código de la compañía (tiene que estar en tus compañías). El tipo de comisión,
 *   del cuadro. La periodicidad, de `periodicidad` si la nota la tiene; si no, «unica» cuando el
 *   producto lleva «extraordinaria». La reserva, de `pct_hucha` si viene (0 vale); si no, la que
 *   propone el cuadro (`pctHuchaPara`). El IRPF, el de Ajustes. `origen = 'nota:<archivo>'`
 * - Una nota `cobrada` crea la liquidación de su mes (fecha = su cobro) si no está. Una `anulada`
 *   con extorno no se importa sola: se enseña para apuntarla a mano
 *
 * **b) El histórico de liquidaciones de OVB**: un `.json` con `"formato": "ovb-liquidaciones-v1"`
 * (spec 6, apartado b), preparado fuera del repo a partir de los PDF.
 * - Cada liquidación → `consultoria_liquidaciones` (mes, fecha, número, importe recibido); sus
 *   cargos → `consultoria_cuenta`, aplicados en ella; cada línea → una herramienta **cobrada** y
 *   enlazada, con el €/unidad y la reserva que reproducen la comisión y la RC exactas, y
 *   `origen = 'ovb:<año>-<n.º>:<línea>'`. Las líneas que no son comisión (extornos) se enseñan
 * - **Antes de guardar nada se comprueba contra las cifras oficiales** (comisión, RC, neta, IRPF,
 *   importe, saldo anterior, importe a pagar, con el mínimo de 50 €, y la reserva acumulada). Si
 *   algo no cuadra, no guarda salvo con `--aceptar-diferencias`
 * - Calcula cuánto tienen que bajar las unidades previas; solo las guarda con `--unidades-previas`
 *
 * En los dos: los clientes se buscan por nombre, sin mayúsculas ni acentos (si no están, se crean;
 * si coinciden con más de uno, se para); **sin duplicar** gracias a `origen` («ya estaba»; si ha
 * cambiado, se dice y no se sobrescribe); si ya hay una herramienta igual por otro camino, se para.
 * **Una aportación extraordinaria nueva se engancha a su herramienta** (`aportacion_de`) si la hay, de esta importación o de la base: del mismo cliente, compañía y producto, no única,
 * sin anular y que no sea ya una APEX. Si no la hay (o hay más de una), entra sin enlace y se avisa.
 * Al final, las liquidaciones que salen, una línea por mes como la casilla de los cobros de OVB.
 * **Sin `--guardar` no escribe nada**, y la vista previa funciona siempre. Con `--guardar` hacen falta
 * la migración 0001, la copia y que la base del panel ya sea la fuente (**hasta el cambio, con
 * `fuente_desde` nulo, para**: spec 6.4), y se guarda en este orden: ajustes y hucha, clientes, liquidaciones, cargos y herramientas ya enlazadas
 * (en un solo insert, cada herramienta antes que sus APEX).
 *
 * **Su salida lleva nombres de clientes**: se lee en la terminal y no se copia a ninguna nota que
 * suba a GitHub. Las rutas se pasan por argumento: el repo no sabe dónde están las notas.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  AJUSTES_DE_SERIE,
  calcularImportes,
  calcularLiquidacion,
  cuentaDeComisiones,
  hoyEnMadrid,
  primerDiaDelMes,
  ultimoDiaDelMes,
  valorUnidadDelMes,
} from "../lib/consultoria/reglas.ts";
import {
  CUADRO_VIGENTE,
  TIPOS_DE_COMISION,
  cargarContexto,
  claveDeNombre,
  companiaConocida,
  comoLinea,
  contextoDeSerie,
  cuentaEnLiquidacion,
  delCuadroPara,
  euros,
  lanzar,
  leerArgumentos,
  leerCantidad,
  leerCargosGuardados,
  leerCodigo,
  leerConApex,
  leerEntero,
  leerFecha,
  leerLineasGuardadas,
  leerLiquidacionesGuardadas,
  leerMes,
  leerProduccion,
  leerSiNo,
  leerTodo,
  liquidacionesPorMes,
  Parada,
  parar,
  porcentaje,
  prepararBase,
  productoYPeriodicidad,
  puedeSerSuMadre,
  separarCliente,
  unidades,
} from "./consultoria-comun.mjs";

const USO =
  "Uso: npm run consultoria:importar -- <carpeta|archivo.json> " +
  "[--unidades-previas N] [--hucha-inicial N] [--aceptar-diferencias] [--guardar]";

const centesimas = (valor) => Math.round(Number(valor) * 100);
const iguales = (a, b) => centesimas(a) === centesimas(b);

// ---------------------------------------------------------------------------------------------
// Lo que ya hay en la base de datos
// ---------------------------------------------------------------------------------------------

async function leerLoGuardado(supabase, consultorId) {
  const clientes = await leerTodo(() =>
    supabase.from("consultoria_clientes").select("id, nombre, referencia").eq("consultor_id", consultorId).order("id"),
  );
  if (clientes.error) parar(`No se han podido leer los clientes: ${clientes.error.message}`);

  // Con `aportacion_de`: para no colgar una APEX de otra APEX
  const herramientas = await leerConApex(
    (columnas) => leerTodo(() => supabase.from("consultoria_herramientas").select(columnas).eq("consultor_id", consultorId).order("id")),
    "id, origen, cliente_id, compania, producto, pago, periodicidad, tipo_comision, aportacion, unidades, unidades_nivel, " +
      "valor_unidad, pct_hucha, mes_produccion, fecha_efecto, fecha_cobro, estado",
  );
  if (herramientas.error) parar(`No se han podido leer las herramientas: ${herramientas.error.message}`);

  const liquidaciones = await leerLiquidacionesGuardadas(supabase, consultorId);
  const lineas = await leerLineasGuardadas(supabase, consultorId);
  const cargos = await leerCargosGuardados(supabase, consultorId, liquidaciones);

  const { data: inicial, error } = await supabase
    .from("consultoria_hucha")
    .select("id, fecha, importe")
    .eq("consultor_id", consultorId)
    .eq("tipo", "inicial")
    .maybeSingle();
  if (error) parar(`No se ha podido leer la hucha: ${error.message}`);

  return { clientes: clientes.data, herramientas: herramientas.data, liquidaciones, lineas, cargos, inicial };
}

const NADA_GUARDADO = { clientes: [], herramientas: [], liquidaciones: new Map(), lineas: [], cargos: [], inicial: null };

// ---------------------------------------------------------------------------------------------
// Lo común a las dos entradas
// ---------------------------------------------------------------------------------------------

/** Qué ha cambiado entre lo leído y lo guardado con su mismo `origen` */
function cambiosDe(nueva, guardada, nombreGuardado) {
  const cambios = [];
  const apuntar = (que, deFuera, deBase) => cambios.push(`${que} (archivo: ${deFuera} · base de datos: ${deBase})`);
  if (claveDeNombre(nombreGuardado) !== nueva.cliente.clave) apuntar("cliente", nueva.cliente.nombre, nombreGuardado);
  for (const [que, deFuera, deBase] of [
    ["compañía", nueva.compania, guardada.compania],
    ["producto", nueva.producto, guardada.producto],
    ["periodicidad", nueva.periodicidad, guardada.periodicidad],
    ["tipo", nueva.tipoComision, guardada.tipo_comision],
    ["producción", nueva.mesProduccion, guardada.mes_produccion],
    ["efecto", nueva.fechaEfecto, guardada.fecha_efecto],
    ["cobro", nueva.fechaCobro, guardada.fecha_cobro],
    ["estado", nueva.estado, guardada.estado],
  ]) {
    if (deFuera !== deBase) apuntar(que, deFuera, deBase);
  }
  for (const [que, deFuera, deBase] of [
    ["unidades", nueva.unidades, guardada.unidades],
    ["€/unidad", nueva.valorUnidad, guardada.valor_unidad],
    ["reserva", nueva.pctHucha, guardada.pct_hucha],
  ]) {
    if (!iguales(deFuera, deBase)) apuntar(que, deFuera, Number(deBase));
  }
  if (nueva.aportacion !== null && guardada.aportacion !== null && !iguales(nueva.aportacion, guardada.aportacion)) {
    apuntar("aportación", nueva.aportacion, Number(guardada.aportacion));
  }
  return cambios;
}

/**
 * Separa lo leído en nuevas, ya estaban y han cambiado (por `origen`); da a cada nueva su cliente
 * (el que ya está o uno nuevo); y para si un nombre coincide con varios clientes o si ya hay una
 * herramienta igual (cliente, compañía, producto, unidades y mes de producción) por otro camino
 */
function clasificar(leidas, guardado) {
  const nombreDe = new Map(guardado.clientes.map((c) => [c.id, c.nombre]));
  const porOrigen = new Map(guardado.herramientas.filter((h) => h.origen).map((h) => [h.origen, h]));
  const nuevas = [];
  const yaEstaban = [];
  const cambiadas = [];
  for (const h of leidas) {
    const guardada = porOrigen.get(h.origen);
    if (!guardada) {
      nuevas.push(h);
      continue;
    }
    const cambios = cambiosDe(h, guardada, nombreDe.get(guardada.cliente_id) ?? "");
    (cambios.length ? cambiadas : yaEstaban).push({ h, cambios });
  }

  const clientesNuevos = new Map(); // clave → { nombre, referencia }
  const otrasIguales = [];
  for (const h of nuevas) {
    const mismos = guardado.clientes.filter((c) => claveDeNombre(c.nombre) === h.cliente.clave);
    if (mismos.length > 1) {
      parar(`«${h.cliente.nombre}» (${h.origen}) coincide con ${mismos.length} clientes de la base de datos: no sé cuál es. No se ha importado nada.`);
    }
    h.clienteId = mismos[0]?.id ?? null;
    if (!h.clienteId) {
      const ya = clientesNuevos.get(h.cliente.clave);
      if (!ya) clientesNuevos.set(h.cliente.clave, { nombre: h.cliente.nombre, referencia: h.cliente.referencia });
      else if (!ya.referencia) ya.referencia = h.cliente.referencia;
      continue;
    }
    const igual = guardado.herramientas.find(
      (g) =>
        g.origen !== h.origen &&
        g.cliente_id === h.clienteId &&
        g.compania === h.compania &&
        claveDeNombre(g.producto) === claveDeNombre(h.producto) &&
        iguales(g.unidades, h.unidades) &&
        g.mes_produccion === h.mesProduccion,
    );
    if (igual) otrasIguales.push(`${h.origen} es igual que una que ya está (${igual.origen ?? "apuntada a mano"})`);
  }
  if (otrasIguales.length) {
    parar(`No se importa dos veces la misma firma por dos caminos:\n  - ${otrasIguales.join("\n  - ")}\nNo se ha importado nada.`);
  }
  return { nuevas, yaEstaban, cambiadas, clientesNuevos };
}

/**
 * Engancha cada aportación extraordinaria nueva (única) a su herramienta (spec 11.2): de esta misma
 * importación o de la base, del mismo cliente, compañía y producto, no única, sin anular y que no sea
 * ya una APEX. Si es una de esta importación, lleva su `id` desde aquí, para ir en el mismo insert
 * (antes que su APEX). Lo que «ya estaba» no se toca. Devuelve los avisos de las que entran sin enlace:
 * las que hay más de una a la que podrían ir y las que dicen «extraordinaria» y no tienen ninguna (una
 * prima única sin herramienta de la que colgar no avisa: no es una APEX)
 */
function engancharAportaciones(nuevas, guardado) {
  const deLaBase = guardado.herramientas.map((g) => ({
    id: g.id,
    clienteId: g.cliente_id,
    compania: g.compania,
    producto: g.producto,
    periodicidad: g.periodicidad,
    estado: g.estado,
    aportacionDe: g.aportacion_de ?? null,
    mesProduccion: g.mes_produccion,
    enLaBase: true,
  }));
  const avisos = [];
  for (const h of nuevas) {
    if (h.periodicidad !== "unica") continue;
    const candidatas = [
      ...(h.clienteId ? deLaBase.filter((g) => g.clienteId === h.clienteId) : []),
      ...nuevas.filter((n) => n !== h && n.cliente.clave === h.cliente.clave),
    ].filter((c) => puedeSerSuMadre(c, h));
    if (candidatas.length === 1) {
      const [madre] = candidatas;
      madre.id ??= randomUUID();
      h.aportacionDe = madre.id;
      h.madre = { producto: madre.producto, mesProduccion: madre.mesProduccion, enLaBase: Boolean(madre.enLaBase) };
    } else if (candidatas.length > 1) {
      avisos.push(
        `${h.origen}: ese cliente tiene ${candidatas.length} herramientas de ${h.compania} «${h.producto}» a las que podría ir; ` +
          "entra sin enlace (engánchala desde la pantalla)",
      );
    } else if (h.extraordinaria) {
      avisos.push(
        `${h.origen}: es una aportación extraordinaria y ese cliente no tiene ninguna herramienta de ${h.compania} «${h.producto}» ` +
          "(no única y sin anular) a la que engancharla; entra sin enlace",
      );
    }
  }
  return avisos;
}

function describir(h) {
  return (
    `${h.mesProduccion.slice(0, 7)} · ${h.cliente.nombre}${h.cliente.referencia ? ` (${h.cliente.referencia})` : ""}` +
    ` · ${h.compania} ${h.producto}${h.periodicidad === "unica" ? " (única)" : ""}` +
    `${h.aportacion !== null ? ` · ${euros(h.aportacion)}${h.periodicidad === "unica" ? "" : "/mes"}` : ""}` +
    ` · ${h.tipoComision}${h.propio ? " · propio" : ""}`
  );
}

function ensenarHerramientas({ nuevas, yaEstaban, cambiadas }) {
  if (nuevas.length) {
    console.log("\nNuevas");
    for (const h of nuevas) {
      console.log(`  + ${describir(h)} · ${h.clienteId ? "cliente que ya estaba" : "cliente nuevo"}`);
      console.log(
        `      ${unidades(h.unidades)}${h.unidadesNivel !== null ? ` (${unidades(h.unidadesNivel)} para el nivel)` : ""}` +
          ` × ${euros(h.valorUnidad)} = ${euros(h.bruto)} · reserva ${porcentaje(h.pctHucha)} = ${euros(h.hucha)}`,
      );
      console.log(`      efecto ${h.fechaEfecto} · cobro ${h.fechaCobro} · ${h.estado}${h.anuladaEl ? ` el ${h.anuladaEl}` : ""}`);
      if (h.madre) {
        console.log(
          `      APEX de: ${h.madre.producto} (producción ${h.madre.mesProduccion.slice(0, 7)}, ` +
            `${h.madre.enLaBase ? "ya en la base de datos" : "nueva en esta importación"})`,
        );
      }
      for (const aviso of h.avisos) console.log(`      ! ${aviso}`);
    }
  }
  if (yaEstaban.length) {
    console.log("\nYa estaban (no se tocan)");
    for (const { h } of yaEstaban) console.log(`  = ${describir(h)}`);
  }
  if (cambiadas.length) {
    console.log("\nYa estaban, pero lo leído ha cambiado (no se sobrescribe: se cambia a mano)");
    for (const { h, cambios } of cambiadas) {
      console.log(`  ~ ${describir(h)} · ${h.origen}`);
      for (const cambio of cambios) console.log(`      ${cambio}`);
    }
  }
}

/** Las liquidaciones que salen con lo guardado y lo nuevo, como las casillas de OVB */
function ensenarLiquidaciones(guardado, nuevas, llegadasNuevas, cargosNuevos = [], saldoInicial = 0) {
  const lineas = [...guardado.lineas, ...nuevas.filter((h) => cuentaEnLiquidacion(h)).map(comoLinea)];
  const llegadas = new Map([...guardado.liquidaciones, ...llegadasNuevas]);
  const { meses, sinMes } = liquidacionesPorMes({ lineas, cargos: [...guardado.cargos, ...cargosNuevos], llegadas, saldoInicial });
  console.log(`\nLiquidaciones que salen (la línea de la casilla de los cobros de OVB, sin nombres; mínimo de transferencia ${euros(CUADRO_VIGENTE.minimoTransferencia)}):`);
  if (!meses.length) console.log("  ninguna");
  for (const { texto } of meses) console.log(`  ${texto}`);
  if (sinMes.length) console.log(`  Cargos sin aplicar y sin mes al que ir: ${euros(sinMes.reduce((t, c) => t + centesimas(c.importe), 0) / 100)}`);
  return meses;
}

/** Ajustes (unidades previas) y saldo de partida de la hucha, si se piden */
function ensenarAjustesYHucha({ previasDadas, huchaInicial, fechaInicial, guardado, guardar }) {
  if (previasDadas !== null) console.log(`\n  Ajustes: unidades previas ${unidades(previasDadas)}${guardar ? "" : " (se guardarían)"}`);
  if (huchaInicial === null) return;
  if (guardado.inicial) {
    console.log(
      `  Hucha: ya hay saldo de partida (${euros(Number(guardado.inicial.importe))} el ${guardado.inicial.fecha}): no se cambia` +
        `${iguales(guardado.inicial.importe, huchaInicial) ? "" : `, aunque se ha pedido ${euros(huchaInicial)}`}`,
    );
  } else {
    console.log(`  Hucha: saldo de partida ${euros(huchaInicial)} con fecha ${fechaInicial}${guardar ? "" : " (se guardaría)"}`);
  }
}

/**
 * Guarda, en este orden: ajustes y saldo de partida (pequeños: volver a lanzarlo los deja igual),
 * clientes nuevos, liquidaciones nuevas, cargos nuevos ya aplicados y herramientas nuevas ya
 * enlazadas, cada cosa en una sola petición. Si algo falla después de los clientes, se quita lo que
 * se acaba de crear: o entra todo, o no queda nada a medias
 */
async function guardarTodo({ supabase, consultor, previasDadas, huchaInicial, fechaInicial, guardado, clientesNuevos, liquidacionesNuevas, cargosNuevos, nuevas }) {
  const id = consultor.id;
  if (previasDadas !== null) {
    const { data: fila, error } = await supabase.from("consultoria_ajustes").select("consultor_id").eq("consultor_id", id).maybeSingle();
    if (error) parar(`No se han podido leer los ajustes: ${error.message}. No se ha guardado nada.`);
    const { error: fallo } = fila
      ? await supabase
          .from("consultoria_ajustes")
          .update({ unidades_previas: previasDadas, actualizado_en: new Date().toISOString() })
          .eq("consultor_id", id)
      : await supabase.from("consultoria_ajustes").insert({
          consultor_id: id,
          unidades_previas: previasDadas,
          pct_hucha: AJUSTES_DE_SERIE.pctHucha,
          pct_irpf: AJUSTES_DE_SERIE.pctIrpf,
        });
    if (fallo) parar(`No se han podido guardar las unidades previas: ${fallo.message}. No se ha guardado nada.`);
    console.log(`\n✓ Unidades previas: ${unidades(previasDadas)}`);
  }
  if (huchaInicial !== null && !guardado.inicial) {
    const { error } = await supabase
      .from("consultoria_hucha")
      .insert({ consultor_id: id, fecha: fechaInicial, tipo: "inicial", importe: huchaInicial });
    if (error) parar(`No se ha podido guardar el saldo de partida de la hucha: ${error.message}. No se ha importado nada más.`);
    console.log(`✓ Saldo de partida de la hucha: ${euros(huchaInicial)}`);
  }
  if (!nuevas.length && !liquidacionesNuevas.size && !cargosNuevos.length) {
    console.log("\nNo hay nada nuevo que importar.\n");
    return;
  }

  const creados = { clientes: [], liquidaciones: [], cargos: [] };
  const deshacer = async () => {
    // Un cargo aplicado no se borra (disparador): primero se desaplica
    if (creados.cargos.length) {
      await supabase.from("consultoria_cuenta").update({ liquidacion_id: null }).in("id", creados.cargos).eq("consultor_id", id);
      await supabase.from("consultoria_cuenta").delete().in("id", creados.cargos).eq("consultor_id", id);
    }
    if (creados.liquidaciones.length) await supabase.from("consultoria_liquidaciones").delete().in("id", creados.liquidaciones).eq("consultor_id", id);
    if (creados.clientes.length) await supabase.from("consultoria_clientes").delete().in("id", creados.clientes).eq("consultor_id", id);
  };
  const fallar = async (que, error) => {
    await deshacer();
    parar(`${que}: ${error.message}. No se ha importado nada (se ha quitado lo que se acababa de crear).`);
  };

  if (clientesNuevos.size) {
    const { data, error } = await supabase
      .from("consultoria_clientes")
      .insert([...clientesNuevos.values()].map((c) => ({ consultor_id: id, nombre: c.nombre, referencia: c.referencia })))
      .select("id, nombre");
    if (error) parar(`No se han podido crear los clientes: ${error.message}. No se ha importado nada.`);
    creados.clientes = data.map((c) => c.id);
    const idDe = new Map(data.map((c) => [claveDeNombre(c.nombre), c.id]));
    for (const h of nuevas) h.clienteId ??= idDe.get(h.cliente.clave);
  }

  const liquidacionDe = new Map([...guardado.liquidaciones].map(([mes, l]) => [mes, l.id]));
  if (liquidacionesNuevas.size) {
    const { data, error } = await supabase
      .from("consultoria_liquidaciones")
      .insert(
        [...liquidacionesNuevas.values()].map((l) => ({
          consultor_id: id,
          mes: l.mes,
          fecha: l.fecha,
          numero: l.numero ?? null,
          importe_recibido: l.importeRecibido ?? null,
        })),
      )
      .select("id, mes");
    if (error) await fallar("No se han podido crear las liquidaciones", error);
    creados.liquidaciones = data.map((l) => l.id);
    for (const l of data) liquidacionDe.set(l.mes, l.id);
  }

  if (cargosNuevos.length) {
    const { data, error } = await supabase
      .from("consultoria_cuenta")
      .insert(
        cargosNuevos.map((c) => ({
          consultor_id: id,
          fecha: c.fecha,
          concepto: c.concepto,
          importe: c.importe,
          liquidacion_id: liquidacionDe.get(c.mes),
        })),
      )
      .select("id");
    if (error) await fallar("No se han podido apuntar los cargos de la cuenta", error);
    creados.cargos = data.map((c) => c.id);
  }

  if (nuevas.length) {
    // Con su id desde aquí (las que son madre de una APEX ya lo llevan) y cada herramienta antes que sus
    // APEX: el disparador `consultoria_proteger_aportacion` busca la madre al insertar la APEX, y la ve si va antes en el insert
    const filas = [...nuevas].sort((a, b) => Number(Boolean(a.aportacionDe)) - Number(Boolean(b.aportacionDe))).map((h) => ({
      id: h.id ?? randomUUID(),
      consultor_id: id,
      cliente_id: h.clienteId,
      compania: h.compania,
      producto: h.producto,
      pago: h.pago,
      periodicidad: h.periodicidad,
      tipo_comision: h.tipoComision,
      duracion_anios: h.duracionAnios,
      propio: h.propio,
      aportacion: h.aportacion,
      unidades: h.unidades,
      unidades_nivel: h.unidadesNivel,
      valor_unidad: h.valorUnidad,
      pct_hucha: h.pctHucha,
      pct_irpf: h.pctIrpf,
      fecha_confirmacion: null,
      mes_produccion: h.mesProduccion,
      fecha_efecto: h.fechaEfecto,
      fecha_cobro: h.fechaCobro,
      estado: h.estado,
      fechas_provisionales: false,
      liquidacion_id: h.estado === "cobrada" ? liquidacionDe.get(primerDiaDelMes(h.fechaCobro)) : null,
      anulada_el: h.anuladaEl,
      origen: h.origen,
      aportacion_de: h.aportacionDe ?? null,
    }));
    const { error } = await supabase.from("consultoria_herramientas").insert(filas);
    if (error) await fallar("No se han podido importar las herramientas", error);
  }

  console.log(
    `\n✓ Importado: ${nuevas.length} herramientas, ${clientesNuevos.size} clientes nuevos, ` +
      `${liquidacionesNuevas.size} liquidaciones y ${cargosNuevos.length} cargos.`,
  );
  const despues = await leerLoGuardado(supabase, id);
  console.log("\nLiquidaciones en la base de datos:");
  const { meses } = liquidacionesPorMes({ lineas: despues.lineas, cargos: despues.cargos, llegadas: despues.liquidaciones });
  for (const { texto } of meses) console.log(`  ${texto}`);
  console.log("");
}

// ---------------------------------------------------------------------------------------------
// a) Las notas de producción
// ---------------------------------------------------------------------------------------------

async function importarNotas({ ruta, opciones, base, cargado, guardado, previasDadas, huchaInicial, guardar }) {
  if (opciones["aceptar-diferencias"]) parar("--aceptar-diferencias solo vale con el histórico de liquidaciones.");
  const { contexto } = cargado;
  const { herramientas: leidas, apartadas, problemas, leidas: cuantas } = leerProduccion(ruta, contexto);
  if (problemas.length) {
    parar(`No se importa nada: hay ${problemas.length === 1 ? "una nota que no se entiende" : `${problemas.length} notas que no se entienden`}:\n  - ${problemas.join("\n  - ")}`);
  }
  if (!cuantas) parar(`No hay notas de producción (tipo: produccion) en ${ruta}.`);

  const clasificadas = clasificar(leidas, guardado);
  const { nuevas, yaEstaban, cambiadas, clientesNuevos } = clasificadas;
  const sinEnlace = engancharAportaciones(nuevas, guardado);

  // Las cobradas, en la liquidación de su mes: la que ya está o una nueva, con la fecha de su cobro
  const liquidacionesNuevas = new Map();
  for (const h of nuevas.filter((n) => n.estado === "cobrada")) {
    const mes = primerDiaDelMes(h.fechaCobro);
    if (!guardado.liquidaciones.has(mes) && !liquidacionesNuevas.has(mes)) liquidacionesNuevas.set(mes, { mes, fecha: h.fechaCobro });
  }
  const llegaron = (mes) => guardado.liquidaciones.has(mes) || liquidacionesNuevas.has(mes);
  const enMesCobrado = nuevas.filter((n) => !["cobrada", "anulada"].includes(n.estado) && llegaron(primerDiaDelMes(n.fechaCobro)));

  const numClientes = new Set(leidas.map((n) => n.cliente.clave)).size;
  console.log(`\nImportar las notas de producción${guardar ? "" : " · vista previa"}\n`);
  console.log(
    `  Notas:       ${cuantas} de producción ${cuantas === 1 ? "leída" : "leídas"}` +
      `${apartadas.length ? `, ${apartadas.length} ${apartadas.length === 1 ? "apartada" : "apartadas"}` : ""}`,
  );
  console.log(`  Consultor:   ${base.consultor ? base.consultor.nombre : "— (sin base de datos)"}`);
  console.log(`  Cuadro:      ${contexto.cuadro.version} · IRPF ${porcentaje(contexto.ajustes.pctIrpf)} ${cargado.ajustesDeSerie ? "(de serie)" : "(de Ajustes)"}`);
  if (base.nota) console.log(`\n  ${base.nota}`);

  ensenarHerramientas(clasificadas);
  for (const aviso of sinEnlace) console.log(`  ! ${aviso}`);
  if (apartadas.length) {
    console.log("\nApartadas (no se importan solas)");
    for (const a of apartadas) console.log(`  - ${a.archivo}: ${a.motivo}`);
  }

  console.log(
    `\n  ${leidas.length} ${leidas.length === 1 ? "herramienta" : "herramientas"} de ${numClientes} ${numClientes === 1 ? "cliente" : "clientes"}:` +
      ` ${nuevas.length} nuevas · ${yaEstaban.length} ya estaban · ${cambiadas.length} han cambiado`,
  );
  console.log(`  Clientes nuevos: ${clientesNuevos.size}`);
  if (liquidacionesNuevas.size) {
    console.log(`  Liquidaciones que se crean (de las cobradas): ${[...liquidacionesNuevas.values()].map((l) => `${l.mes.slice(0, 7)} con fecha ${l.fecha}`).join(" · ")}`);
  }
  for (const h of enMesCobrado) console.log(`  ! ${h.origen}: su mes de cobro ya está liquidado y ella no está cobrada; entra como pendiente de ese mes`);

  // El €/unidad de cada nota frente al nivel que sale de las unidades
  const previas = previasDadas ?? (cargado.ajustesDeSerie ? null : contexto.ajustes.unidadesPrevias);
  if (previas === null) {
    console.log("\n  Sin --unidades-previas no se comprueba el €/unidad de las notas con el nivel.");
  } else {
    const contextoNivel = {
      ...contexto,
      ajustes: { ...contexto.ajustes, unidadesPrevias: previas },
      herramientas: [
        ...contexto.herramientas,
        ...nuevas.map((n) => ({ mesProduccion: n.mesProduccion, unidades: n.unidades, unidadesNivel: n.unidadesNivel, estado: n.estado })),
      ],
    };
    console.log(`\nNivel de cada mes de producción (${unidades(previas)} previas${previasDadas === null ? ", de Ajustes" : ""}, más estas herramientas)`);
    const meses = [...new Set(leidas.filter((n) => n.estado !== "anulada").map((n) => n.mesProduccion))].sort();
    for (const mes of meses) {
      const nivel = valorUnidadDelMes(mes, contextoNivel);
      const delMes = leidas.filter((n) => n.mesProduccion === mes && n.estado !== "anulada");
      const distintas = delMes.filter((n) => !iguales(n.valorUnidad, nivel.valorUnidad));
      console.log(
        `  ${mes.slice(0, 7)}: ${unidades(nivel.unidadesAntes)} antes → ${nivel.nivel || "sin nivel"}, ${euros(nivel.valorUnidad)}/u · ` +
          (distintas.length
            ? `${distintas.length} de ${delMes.length} notas dicen otro €/unidad`
            : `coincide con ${delMes.length === 1 ? "la nota" : `las ${delMes.length} notas`}`),
      );
      for (const n of distintas) console.log(`      ! ${n.origen}: la nota dice ${euros(n.valorUnidad)}/u (se importa lo que dice la nota)`);
      for (const aviso of nivel.avisos) console.log(`      ! ${aviso.texto}`);
    }
  }

  ensenarLiquidaciones(guardado, nuevas, liquidacionesNuevas);
  const fechaInicial = hoyEnMadrid();
  ensenarAjustesYHucha({ previasDadas, huchaInicial, fechaInicial, guardado, guardar });

  if (!guardar) {
    console.log("\nEsto es una vista previa: no se ha guardado nada. Para hacerlo, añade --guardar.\n");
    return;
  }
  await guardarTodo({
    supabase: base.supabase,
    consultor: base.consultor,
    previasDadas,
    huchaInicial,
    fechaInicial,
    guardado,
    clientesNuevos,
    liquidacionesNuevas,
    cargosNuevos: [],
    nuevas,
  });
}

// ---------------------------------------------------------------------------------------------
// b) El histórico de liquidaciones de OVB (ovb-liquidaciones-v1)
// ---------------------------------------------------------------------------------------------

/**
 * El €/unidad (en céntimos) que, con esas unidades, da la comisión exacta: `round(u × v, 2) = c`.
 * Prueba el cociente redondeado y sus vecinos; null si ninguno la da
 */
function valorExacto(unidadesLinea, comision) {
  const u = centesimas(unidadesLinea);
  const c = centesimas(comision);
  const cerca = Math.round((c * 100) / u);
  for (const v of [cerca, cerca - 1, cerca + 1]) {
    if (v > 0 && v <= 999_999 && iguales(calcularImportes(unidadesLinea, v / 100, 0, 0).bruto, comision)) return v / 100;
  }
  return null;
}

/** El % de reserva (en centésimas de punto) que, sobre esa comisión, da la RC exacta; null si ninguno */
function reservaExacta(unidadesLinea, valor, comision, rc) {
  if (centesimas(rc) === 0) return 0;
  const cerca = Math.round((centesimas(rc) * 10_000) / centesimas(comision));
  for (const p of [cerca, cerca - 1, cerca + 1]) {
    if (p >= 0 && p <= 10_000 && iguales(calcularImportes(unidadesLinea, valor, p / 100, 0).hucha, rc)) return p / 100;
  }
  return null;
}

/** Lee el histórico, línea a línea, y para con todo lo que no se entienda */
function leerHistorico(doc, contexto) {
  if (!Array.isArray(doc.liquidaciones) || !doc.liquidaciones.length) parar("El histórico no tiene «liquidaciones».");
  const problemas = [];
  const intento = (donde, leer) => {
    try {
      return leer();
    } catch (error) {
      if (!(error instanceof Parada)) throw error;
      problemas.push(`${donde}: ${error.message}`);
      return null;
    }
  };

  const liquidaciones = [];
  const herramientas = [];
  const apartadas = [];
  const avisos = [];
  const vistos = new Set();

  for (const [i, liq] of doc.liquidaciones.entries()) {
    const donde = `liquidación ${liq?.numero ?? `n.º ${i + 1} del archivo`}`;
    const mes = intento(donde, () => leerMes(liq.mes, "mes"));
    const fecha = intento(donde, () => leerFecha(liq.fecha, "fecha"));
    const numeroLiq = intento(donde, () => leerEntero(liq.numero, "numero", 1, 999_999));
    const importeRecibido =
      liq.importe_recibido === null || liq.importe_recibido === undefined
        ? null
        : intento(donde, () => leerCantidad(liq.importe_recibido, "importe_recibido", { cero: true }));
    if (mes && vistos.has(mes)) problemas.push(`${donde}: el mes ${mes.slice(0, 7)} está dos veces`);
    if (mes) vistos.add(mes);
    if (!mes || !fecha || !numeroLiq) continue;

    const cargos = (liq.cargos ?? []).map((c, j) => {
      const dondeCargo = `${donde}, cargo ${j + 1}`;
      const concepto = String(c?.concepto ?? "").trim();
      if (!concepto || concepto.length > 120) problemas.push(`${dondeCargo}: el concepto, de 1 a 120 caracteres`);
      return {
        mes,
        fecha: intento(dondeCargo, () => leerFecha(c.fecha, "fecha")),
        concepto,
        importe: intento(dondeCargo, () => leerCantidad(c.importe, "importe", { negativo: true })),
      };
    });

    const lineas = [];
    for (const [j, l] of (liq.lineas ?? []).entries()) {
      const numeroLinea = intento(`${donde}, línea ${j + 1}`, () => leerEntero(l.linea, "linea", 1, 9999));
      const dondeLinea = `${donde}, línea ${numeroLinea ?? j + 1}`;
      const { nombre, referencia } = separarCliente(l.cliente);
      if (claveDeNombre(l.tipo ?? "comision") !== "comision") {
        apartadas.push({ donde: dondeLinea, motivo: `«${l.tipo}» (${euros(Number(l.comision ?? 0))}) no es una comisión: se apunta a mano (un extorno)` });
        continue;
      }
      const fallos = problemas.length;
      if (!nombre || nombre.length > 80) problemas.push(`${dondeLinea}: el cliente, de 1 a 80 caracteres`);
      if (referencia && referencia.length > 40) problemas.push(`${dondeLinea}: la referencia pasa de 40 caracteres`);
      const compania = intento(dondeLinea, () => leerCodigo(l.partner, "partner"));
      if (compania && !companiaConocida(compania, contexto)) problemas.push(`${dondeLinea}: falta la compañía «${compania}» en tus compañías`);
      const { producto, periodicidad, extraordinaria } = productoYPeriodicidad(l.producto, l.periodicidad);
      if (!producto || producto.length > 60) problemas.push(`${dondeLinea}: el producto, de 1 a 60 caracteres`);
      if (!["mensual", "unica"].includes(periodicidad)) problemas.push(`${dondeLinea}: periodicidad «${l.periodicidad}»`);
      const pago = l.pago ? claveDeNombre(l.pago) : "domiciliacion";
      if (!["domiciliacion", "transferencia"].includes(pago)) problemas.push(`${dondeLinea}: pago «${l.pago}»`);
      const mesProduccion = intento(dondeLinea, () => leerMes(l.mes_produccion, "mes_produccion"));
      const fechaEfecto = intento(dondeLinea, () => leerFecha(l.fecha_efecto, "fecha_efecto"));
      const unidadesLinea = intento(dondeLinea, () => leerCantidad(l.unidades, "unidades"));
      const comision = intento(dondeLinea, () => leerCantidad(l.comision, "comision"));
      const rc = intento(dondeLinea, () => leerCantidad(l.rc ?? 0, "rc", { cero: true }));
      const aportacion = l.aportacion === null || l.aportacion === undefined ? null : intento(dondeLinea, () => leerCantidad(l.aportacion, "aportacion"));
      const propio = l.propio === undefined || l.propio === null ? false : intento(dondeLinea, () => leerSiNo(l.propio, "propio"));
      const duracionAnios =
        l.duracion_anios === undefined || l.duracion_anios === null ? null : intento(dondeLinea, () => leerEntero(l.duracion_anios, "duracion_anios", 1, 99));
      const tipoDado = l.tipo_comision ? claveDeNombre(l.tipo_comision) : null;
      if (tipoDado && !TIPOS_DE_COMISION.includes(tipoDado)) problemas.push(`${dondeLinea}: tipo_comision «${l.tipo_comision}»`);
      const unidadesNivelDadas =
        l.unidades_nivel === undefined || l.unidades_nivel === null ? null : intento(dondeLinea, () => leerCantidad(l.unidades_nivel, "unidades_nivel", { cero: true }));
      if (problemas.length > fallos || !numeroLinea) continue;

      const fechaCobro = ultimoDiaDelMes(mes);
      if (fechaCobro < fechaEfecto) problemas.push(`${dondeLinea}: se cobra en ${mes.slice(0, 7)} y su efecto (${fechaEfecto}) es posterior`);
      const valorUnidad = valorExacto(unidadesLinea, comision);
      if (valorUnidad === null) {
        problemas.push(`${dondeLinea}: ningún €/unidad da ${euros(comision)} con ${unidades(unidadesLinea)}`);
        continue;
      }
      const pctHucha = reservaExacta(unidadesLinea, valorUnidad, comision, rc);
      if (pctHucha === null) {
        problemas.push(`${dondeLinea}: ningún % de reserva da ${euros(rc)} sobre ${euros(comision)}`);
        continue;
      }

      // Del cuadro: el tipo (si el producto no está, anticipada) y la reserva que propone
      const enCuadro = delCuadroPara({ compania, producto, periodicidad, unidades: unidadesLinea, propio, tipoComision: null }, contexto);
      const tipoComision = tipoDado ?? enCuadro.enCuadro?.tipo ?? "anticipada";
      const pocoAPoco = tipoComision === "sobre_recibo" || tipoComision === "sobre_saldo";
      const avisosLinea = [];
      if (!iguales(pctHucha, enCuadro.reservaPropuesta)) {
        avisosLinea.push(`la RC es el ${porcentaje(pctHucha)} y el cuadro propone el ${porcentaje(enCuadro.reservaPropuesta)} (se importa la de OVB)`);
      }

      const h = {
        archivo: dondeLinea,
        origen: `ovb:${mes.slice(0, 4)}-${numeroLiq}:${numeroLinea}`,
        cliente: { nombre, referencia, clave: claveDeNombre(nombre) },
        compania,
        producto,
        pago,
        periodicidad,
        tipoComision,
        duracionAnios,
        propio,
        aportacion,
        unidades: unidadesLinea,
        unidadesNivel: unidadesNivelDadas ?? (pocoAPoco ? 0 : null),
        valorUnidad,
        pctHucha,
        pctIrpf: contexto.ajustes.pctIrpf,
        mesProduccion,
        fechaEfecto,
        fechaCobro,
        estado: "cobrada",
        anuladaEl: null,
        bruto: comision,
        hucha: rc,
        extraordinaria,
        aportacionDe: null,
        avisos: avisosLinea,
      };
      lineas.push(h);
      herramientas.push(h);
    }

    liquidaciones.push({ mes, fecha, numero: numeroLiq, importeRecibido, oficial: liq.oficial ?? null, cargos, lineas });
  }

  if (problemas.length) parar(`No se importa nada: hay cosas del histórico que no se entienden:\n  - ${problemas.join("\n  - ")}`);
  liquidaciones.sort((a, b) => a.mes.localeCompare(b.mes));
  const repetidos = herramientas.map((h) => h.origen).filter((o, i, todos) => todos.indexOf(o) !== i);
  if (repetidos.length) parar(`Hay líneas repetidas en el histórico: ${[...new Set(repetidos)].join(", ")}.`);
  return { liquidaciones, herramientas, apartadas, avisos };
}

/**
 * Las cifras de cada liquidación (con `calcularLiquidacion` y `cuentaDeComisiones`, como las saca la
 * aplicación) frente a las oficiales, y la reserva acumulada frente a `saldo_rc` y `hucha.saldo`
 */
function comprobarHistorico(liquidaciones, doc, huchaBase) {
  const primera = liquidaciones[0];
  const saldoInicial = Number(primera.oficial?.saldo_anterior ?? 0);
  const calculadas = liquidaciones.map((l) =>
    calcularLiquidacion(
      l.lineas.map((h) => ({ bruto: h.bruto, hucha: h.hucha, pctIrpf: h.pctIrpf })),
      l.cargos.map((c) => c.importe),
    ),
  );
  const pasos = cuentaDeComisiones(
    liquidaciones.map((l, i) => ({ mes: l.mes, importe: calculadas[i].importe })),
    saldoInicial,
    CUADRO_VIGENTE.minimoTransferencia,
  );

  const diferencias = [];
  const recibidos = [];
  const filas = [];
  let reserva = centesimas(huchaBase);
  let reservaSinBase = 0;
  let previa = null;
  liquidaciones.forEach((l, i) => {
    const calc = calculadas[i];
    const paso = pasos[i];
    reserva += centesimas(calc.rc);
    reservaSinBase += centesimas(calc.rc);
    const nuestras = {
      comision: calc.comision,
      rc: calc.rc,
      comision_neta: calc.comisionNeta,
      irpf: calc.irpf,
      importe: calc.importe,
      saldo_anterior: paso.saldoAnterior,
      importe_a_pagar: paso.aPagar,
      saldo_rc: reserva / 100,
    };
    filas.push({ l, nuestras });
    if (!l.oficial) {
      diferencias.push(`${l.mes.slice(0, 7)} (n.º ${l.numero}): no trae cifras oficiales con las que comprobar`);
      return;
    }
    for (const [clave, valor] of Object.entries(nuestras)) {
      if (l.oficial[clave] === undefined || l.oficial[clave] === null) continue;
      if (clave === "saldo_rc" && previa === null) previa = (centesimas(l.oficial.saldo_rc) - reservaSinBase) / 100;
      if (!iguales(l.oficial[clave], valor)) {
        diferencias.push(`${l.mes.slice(0, 7)} (n.º ${l.numero}) ${clave}: OVB ${euros(Number(l.oficial[clave]))} · calculado ${euros(valor)}`);
      }
    }
    // No bloquea: para eso está `importe_recibido`, que la pantalla compara con el importe a pagar
    if (l.importeRecibido !== null && !iguales(l.importeRecibido, paso.aPagar)) {
      recibidos.push(`${l.mes.slice(0, 7)} (n.º ${l.numero}) importe recibido ${euros(l.importeRecibido)} · a pagar calculado ${euros(paso.aPagar)}`);
    }
  });

  let hucha = null;
  if (doc.hucha && doc.hucha.fecha !== undefined) {
    const fecha = leerFecha(doc.hucha.fecha, "hucha.fecha");
    let enCentimos = centesimas(huchaBase);
    liquidaciones.forEach((l, i) => {
      if (l.fecha <= fecha) enCentimos += centesimas(calculadas[i].rc);
    });
    const saldo = enCentimos / 100;
    hucha = { fecha, oficial: Number(doc.hucha.saldo), calculado: saldo };
    if (!iguales(hucha.oficial, saldo)) diferencias.push(`hucha a ${fecha}: OVB ${euros(hucha.oficial)} · calculado ${euros(saldo)}`);
  }
  return { filas, diferencias, recibidos, hucha, previa, saldoInicial };
}

async function importarHistorico({ doc, opciones, base, cargado, guardado, previasDadas, huchaInicial, guardar }) {
  const { contexto } = cargado;
  const { liquidaciones, herramientas: leidas, apartadas } = leerHistorico(doc, contexto);
  const clasificadas = clasificar(leidas, guardado);
  const { nuevas, yaEstaban, cambiadas, clientesNuevos } = clasificadas;
  const sinEnlace = engancharAportaciones(nuevas, guardado);
  const primera = liquidaciones[0];

  // Las liquidaciones y sus cargos: lo que ya está no se toca
  const liquidacionesNuevas = new Map();
  const cargosNuevos = [];
  const avisos = [];
  for (const l of liquidaciones) {
    const guardada = guardado.liquidaciones.get(l.mes);
    if (!guardada) {
      liquidacionesNuevas.set(l.mes, { mes: l.mes, fecha: l.fecha, numero: l.numero, importeRecibido: l.importeRecibido });
      cargosNuevos.push(...l.cargos);
      continue;
    }
    if (guardada.numero !== l.numero || guardada.fecha !== l.fecha) {
      avisos.push(`${l.mes.slice(0, 7)} ya estaba con n.º ${guardada.numero ?? "—"} y fecha ${guardada.fecha}; el histórico dice n.º ${l.numero} y ${l.fecha}: no se cambia`);
    }
    const suyos = guardado.cargos.filter((c) => c.liquidacionId === guardada.id && c.cargoId);
    for (const cargo of l.cargos) {
      const ya = suyos.some((c) => c.fecha === cargo.fecha && claveDeNombre(c.concepto) === claveDeNombre(cargo.concepto) && iguales(c.importe, cargo.importe));
      if (!ya) cargosNuevos.push(cargo);
    }
  }

  // El saldo anterior de la primera, como cargo «Saldo anterior» aplicado en ella (si no hay liquidaciones de antes)
  const hayAnteriores = [...guardado.liquidaciones.keys()].some((mes) => mes < primera.mes);
  const saldoPrevio = Number(primera.oficial?.saldo_anterior ?? 0);
  if (saldoPrevio !== 0 && !hayAnteriores && liquidacionesNuevas.has(primera.mes)) {
    cargosNuevos.push({ mes: primera.mes, fecha: primera.fecha, concepto: "Saldo anterior", importe: saldoPrevio, saldoAnterior: true });
  }

  const fechaInicial = primera.mes;
  const huchaBase = huchaInicial ?? (guardado.inicial ? Number(guardado.inicial.importe) : 0);
  const { filas, diferencias, recibidos, hucha, previa, saldoInicial } = comprobarHistorico(liquidaciones, doc, huchaBase);

  console.log(`\nImportar el histórico de liquidaciones de OVB${guardar ? "" : " · vista previa"}\n`);
  console.log(`  Liquidaciones: ${liquidaciones.length} (${liquidaciones[0].mes.slice(0, 7)} a ${liquidaciones.at(-1).mes.slice(0, 7)})`);
  console.log(`  Consultor:     ${base.consultor ? base.consultor.nombre : "— (sin base de datos)"}`);
  console.log(`  Cuadro:        ${contexto.cuadro.version} · IRPF ${porcentaje(contexto.ajustes.pctIrpf)} ${cargado.ajustesDeSerie ? "(de serie)" : "(de Ajustes)"}`);
  if (base.nota) console.log(`\n  ${base.nota}`);

  console.log("\nCada liquidación, calculada como OVB (comisión · RC · neta · IRPF · importe · saldo anterior · a pagar · reserva acumulada):");
  for (const { l, nuestras: n } of filas) {
    console.log(
      `  ${l.mes.slice(0, 7)} n.º ${l.numero} (${l.fecha}): ${euros(n.comision)} · ${euros(n.rc)} · ${euros(n.comision_neta)} · ${euros(n.irpf)} · ` +
        `${euros(n.importe)} · ${euros(n.saldo_anterior)} · ${euros(n.importe_a_pagar)} · ${euros(n.saldo_rc)}` +
        `${l.lineas.length ? ` · ${l.lineas.length} ${l.lineas.length === 1 ? "línea" : "líneas"}` : ""}` +
        `${l.cargos.length ? ` · ${l.cargos.length} ${l.cargos.length === 1 ? "cargo" : "cargos"}` : ""}`,
    );
  }
  if (saldoInicial !== 0) console.log(`  (La cuenta empieza con el saldo anterior de la primera: ${euros(saldoInicial)}.)`);
  if (hucha) console.log(`  Hucha a ${hucha.fecha}: OVB ${euros(hucha.oficial)} · calculado ${euros(hucha.calculado)}`);
  if (diferencias.length) {
    console.log(`\n  ! No cuadra con OVB (${diferencias.length}):`);
    for (const d of diferencias) console.log(`      ${d}`);
  } else {
    console.log("\n  ✓ Todo cuadra con las cifras oficiales.");
  }
  for (const r of recibidos) console.log(`  ! Lo que llegó al banco no es el importe a pagar (se guarda igual y se verá la diferencia): ${r}`);
  if (previa && huchaInicial === null && !guardado.inicial) {
    console.log(`  ! Antes de la primera liquidación ya había ${euros(previa)} de reserva: pásalo con --hucha-inicial ${previa}.`);
  }

  ensenarHerramientas(clasificadas);
  for (const aviso of sinEnlace) console.log(`  ! ${aviso}`);
  if (apartadas.length) {
    console.log("\nApartadas (no se importan solas)");
    for (const a of apartadas) console.log(`  - ${a.donde}: ${a.motivo}`);
  }
  for (const aviso of avisos) console.log(`  ! ${aviso}`);

  const numClientes = new Set(leidas.map((h) => h.cliente.clave)).size;
  console.log(
    `\n  ${leidas.length} ${leidas.length === 1 ? "línea" : "líneas"} de ${numClientes} ${numClientes === 1 ? "cliente" : "clientes"}:` +
      ` ${nuevas.length} nuevas · ${yaEstaban.length} ya estaban · ${cambiadas.length} han cambiado`,
  );
  console.log(`  Clientes nuevos: ${clientesNuevos.size} · liquidaciones nuevas: ${liquidacionesNuevas.size} · cargos nuevos: ${cargosNuevos.length}`);
  for (const c of cargosNuevos.filter((c) => c.saldoAnterior)) {
    console.log(`  Cargo «Saldo anterior» de ${euros(c.importe)}, aplicado en la de ${c.mes.slice(0, 7)} (la cuenta de la aplicación empieza en 0)`);
  }

  // Las unidades del histórico ya no son «previas», pero solo las de lo que entra ahora: lo que ya
  // estaba entró en una importación anterior, y relanzar el archivo entero no puede restarlo otra vez
  const delNivelEnCentesimas = nuevas.reduce((t, h) => t + centesimas(h.unidadesNivel ?? h.unidades), 0);
  const delNivel = delNivelEnCentesimas / 100;
  const yaImportadas = yaEstaban.length + cambiadas.length;
  const ahora = cargado.ajustesDeSerie ? null : cargado.contexto.ajustes.unidadesPrevias;
  if (!nuevas.length) {
    console.log(
      `\nUnidades previas: no entra ninguna línea nueva${yaImportadas ? ` (las ${yaImportadas} del archivo ya estaban)` : ""}, así que no hay que bajar nada` +
        `${ahora === null ? "." : `: siguen en ${unidades(ahora)}.`}`,
    );
  } else {
    const meses = nuevas.map((h) => h.mesProduccion.slice(0, 7)).sort();
    const deProduccion = meses[0] === meses.at(-1) ? meses[0] : `${meses[0]} a ${meses.at(-1)}`;
    console.log(
      `\nUnidades previas: lo que entra ahora suma ${unidades(delNivel)} para el nivel` +
        ` (producción de ${deProduccion}), que dejan de ser «previas»` +
        `${yaImportadas ? `; las ${yaImportadas} líneas que ya estaban no cuentan: entraron en una importación anterior` : ""}.`,
    );
    if (ahora !== null) {
      const quedan = (centesimas(ahora) - delNivelEnCentesimas) / 100;
      console.log(`  Si las previas incluían todo eso: ${unidades(ahora)} − ${unidades(delNivel)} = ${unidades(quedan)}.`);
      if (quedan < 0) console.log("  ! Saldría negativo: las previas de ahora no incluían esas unidades. Revísalas antes de cambiarlas.");
    } else {
      console.log("  Las previas de ahora, menos esas. Solo se guardan con --unidades-previas N.");
    }
  }

  ensenarLiquidaciones(
    guardado,
    nuevas,
    new Map([...liquidacionesNuevas].map(([mes, l]) => [mes, { fecha: l.fecha }])),
    cargosNuevos.map((c) => ({ mes: c.mes, importe: c.importe })),
  );
  ensenarAjustesYHucha({ previasDadas, huchaInicial, fechaInicial, guardado, guardar });

  if (!guardar) {
    console.log("\nEsto es una vista previa: no se ha guardado nada. Para hacerlo, añade --guardar.\n");
    return;
  }
  if (diferencias.length && !opciones["aceptar-diferencias"]) {
    parar("No cuadra con las cifras oficiales: no se ha guardado nada. Revísalo o, si las diferencias están explicadas, añade --aceptar-diferencias.");
  }
  await guardarTodo({
    supabase: base.supabase,
    consultor: base.consultor,
    previasDadas,
    huchaInicial,
    fechaInicial,
    guardado,
    clientesNuevos,
    liquidacionesNuevas,
    cargosNuevos,
    nuevas,
  });
}

// ---------------------------------------------------------------------------------------------

async function principal() {
  const { opciones, sueltos } = leerArgumentos(process.argv.slice(2), {
    valores: ["unidades-previas", "hucha-inicial"],
    banderas: ["guardar", "aceptar-diferencias"],
  });
  if (sueltos.length !== 1) parar(USO);
  const ruta = sueltos[0];
  const guardar = Boolean(opciones.guardar);
  const previasDadas =
    opciones["unidades-previas"] === undefined ? null : leerCantidad(opciones["unidades-previas"], "--unidades-previas", { cero: true });
  const huchaInicial = opciones["hucha-inicial"] === undefined ? null : leerCantidad(opciones["hucha-inicial"], "--hucha-inicial");

  // ¿Histórico de OVB o notas? Por el contenido
  let doc = null;
  if (ruta.toLowerCase().endsWith(".json")) {
    try {
      doc = JSON.parse(readFileSync(ruta, "utf8").replace(/^﻿/, ""));
    } catch (error) {
      parar(`No se puede leer el JSON: ${error.message}`);
    }
    if (!Array.isArray(doc) && doc?.formato !== "ovb-liquidaciones-v1") {
      parar(`Formato desconocido «${doc?.formato ?? ""}»: se espera una lista de notas o un histórico «ovb-liquidaciones-v1».`);
    }
  }

  const base = await prepararBase({ guardar });
  const cargado = base.migracion ? await cargarContexto(base.supabase, base.consultor.id) : contextoDeSerie();
  if (guardar && cargado.companiasDeSerie) {
    parar("No hay compañías en la base del panel (llegan con la copia, `consultoria:copiar`): sin ellas no se puede guardar nada.");
  }
  const guardado = base.migracion ? await leerLoGuardado(base.supabase, base.consultor.id) : NADA_GUARDADO;
  const comun = { opciones, base, cargado, guardado, previasDadas, huchaInicial, guardar };

  if (doc && !Array.isArray(doc)) await importarHistorico({ doc, ...comun });
  else await importarNotas({ ruta, ...comun });
}

lanzar(principal);

