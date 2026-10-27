/**
 * Apunta una firma de la consultoría en la base del panel, con las mismas reglas que la pantalla
 * (REQ-001; spec sección 6 de FSM-Finance y 8 del panel). Lo usa Claude cuando Facundo cuenta una firma.
 *
 *   npm run consultoria:firma -- --cliente "Nombre" [--referencia "ref. Marta"]
 *        --compania <código> --producto "PIAS Global+" [--pago domiciliacion|transferencia]
 *        --aportacion 100 [--unica] [--apex [--de-mes AAAA-MM]] [--duracion 30] [--unidades 81.6] [--unidades-nivel N] [--propio]
 *        [--tipo anticipada|anualizada|sobre_recibo|unica|sobre_saldo] [--pct-hucha 10]
 *        --fecha AAAA-MM-DD [--estado prevista|firmada|confirmada]
 *        [--mes-produccion AAAA-MM] [--efecto AAAA-MM-DD] [--cobro AAAA-MM] [--valor-unidad 2.5] [--nota "…"]
 *        [--calendario <nota.md>] [--produccion <carpeta|archivo.json>] [--unidades-previas N]
 *        [--repetida] [--guardar]
 *
 * - `--fecha` es la de confirmar la solicitud (o, por transferencia, la del dinero). Sin `--estado`:
 *   prevista si la fecha es futura y confirmada si no
 * - Llama a `proponerFirma` de `lib/consultoria/reglas.ts` (el mismo cálculo que la pantalla), con
 *   el cuadro de comisiones vigente: **sin `--unidades`, las propone** con la aportación y la
 *   duración (`--duracion`), y si no puede, para y las pide. La reserva, con los tramos y el
 *   contrato propio (`--propio`); `--pct-hucha` la cambia (0 vale)
 * - `--compania` acepta cualquier código: si no está en tus compañías, lo dice y no guarda.
 *   **`--efecto` es obligatorio en una compañía sin calendario** (Allianz, Plus Ultra, una desconocida)
 * - Lo que se le da a mano manda: `--efecto` (y el cobro se recalcula con él), `--mes-produccion`
 *   (y con él el €/unidad de ese mes), `--cobro`, `--valor-unidad`, `--tipo` y `--unidades-nivel`
 * - Enseña lo que sale, los avisos y **cómo queda la liquidación del mes de cobro**: la línea de la
 *   casilla de los cobros de OVB, sin nombres, con el mínimo de 50 €
 * - **De dónde sale el contexto**: de la base del panel. Para probar sin ella, se le pueden pasar
 *   `--calendario` (los cierres de la nota del calendario), `--produccion` (las notas de producción:
 *   el nivel, las repetidas y la liquidación del mes) y `--unidades-previas`. Con `--guardar` no
 *   valen: manda la base de datos
 * - Si ya hay una herramienta del mismo cliente, compañía, producto, unidades y fecha, avisa y no
 *   guarda salvo con `--repetida`
 * - **`--apex`**: una aportación extraordinaria a la herramienta que el cliente ya tiene con esa
 *   compañía y producto (la que no es única, no está anulada ni es ya una APEX), enganchada a ella
 *   (`aportacion_de`). Implica `--unica`; las unidades, las del cuadro para la aportación
 *   extraordinaria, y el pago, el de su herramienta si no se da `--pago`. Si no tiene ninguna, para
 *   y lo dice; si tiene más de una, para y las enseña, y se elige con `--de-mes AAAA-MM` (su mes de
 *   producción). Sin base de datos, la busca en `--produccion`
 * - **Sin `--guardar` no escribe nada**, y la vista previa funciona siempre. Con `--guardar` inserta
 *   la herramienta (y antes el cliente, si es nuevo), con `origen` nulo. Hace falta la migración
 *   0001, la copia y que la base del panel ya sea la fuente: **hasta el cambio (`fuente_desde` nulo,
 *   spec 6.4), `--guardar` para** y la firma se apunta en FSM-Finance
 *
 * **Su salida lleva el nombre del cliente**: a las notas que suben a GitHub solo va la línea de la
 * liquidación. Las rutas se pasan por argumento: el repo no sabe dónde están las notas.
 */
import {
  calcularImportes,
  datosDeCompania,
  hoyEnMadrid,
  primerDiaDelMes,
  proponerFirma,
  ultimoDiaDelMes,
  valorUnidadDelMes,
} from "../lib/consultoria/reglas.ts";
import {
  TIPOS_DE_COMISION,
  cargarContexto,
  claveDeNombre,
  companiaConocida,
  comoLinea,
  contextoDeSerie,
  cuentaEnLiquidacion,
  euros,
  lanzar,
  leerArgumentos,
  leerCalendario,
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
  liquidacionesPorMes,
  mesEnTexto,
  numero,
  parar,
  porcentaje,
  prepararBase,
  puedeSerSuMadre,
  separarCliente,
  unidades,
} from "./consultoria-comun.mjs";

const USO = `Uso: npm run consultoria:firma -- --cliente "Nombre" --compania <código> --producto "PIAS Global+"
       --aportacion 100 --fecha AAAA-MM-DD [--duracion 30] [--unidades 81.6] [--pago domiciliacion|transferencia]
       [--unica] [--apex [--de-mes AAAA-MM]] [--propio] [--tipo …] [--unidades-nivel N] [--pct-hucha 10] [--estado prevista|firmada|confirmada]
       [--referencia "ref. …"] [--mes-produccion AAAA-MM] [--efecto AAAA-MM-DD] [--cobro AAAA-MM] [--valor-unidad 2.5]
       [--nota "…"] [--calendario <nota.md>] [--produccion <carpeta|json>] [--unidades-previas N]
       [--repetida] [--guardar]`;

const centesimas = (valor) => Math.round(Number(valor) * 100);

/** `producción 2026-11 · TopPlan · 300,00 €/mes · prevista` */
const describirMadre = (h) =>
  `producción ${h.mesProduccion.slice(0, 7)} · ${h.producto}` +
  `${h.aportacion !== null && h.aportacion !== undefined ? ` · ${euros(h.aportacion)}/mes` : ""} · ${h.estado}`;

/**
 * La herramienta de la que cuelga la APEX (`--apex`), de entre las del cliente con esa compañía: la
 * de ese producto que no es única, no está anulada ni es ya una APEX. Si no hay ninguna, para y lo
 * dice; si hay más de una, para y las enseña, y se elige con `--de-mes` (su mes de producción)
 */
function elegirMadre(suyas, { cliente, compania, producto, deMes }) {
  const posibles = suyas.filter((h) => puedeSerSuMadre(h, { compania, producto }));
  const elegidas = deMes ? posibles.filter((h) => h.mesProduccion === deMes) : posibles;
  if (elegidas.length === 1) return elegidas[0];
  const lista = posibles.map((h) => `  - ${describirMadre(h)}`).join("\n");
  if (!posibles.length) {
    parar(
      `«${cliente}» no tiene ninguna herramienta de ${compania} «${producto}» a la que hacerle una aportación extraordinaria ` +
        "(no única, sin anular y que no sea ya una APEX). No se ha guardado nada.",
    );
  }
  if (!elegidas.length) parar(`Ninguna de sus herramientas de ${compania} «${producto}» es de producción de ${deMes.slice(0, 7)}:\n${lista}\nNo se ha guardado nada.`);
  if (deMes) {
    parar(
      `Hay ${elegidas.length} herramientas de ${compania} «${producto}» de producción de ${deMes.slice(0, 7)} y no sé a cuál va: ` +
        `engánchala desde la pantalla.\n${lista}\nNo se ha guardado nada.`,
    );
  }
  return parar(
    `«${cliente}» tiene ${posibles.length} herramientas de ${compania} «${producto}»: di a cuál va con --de-mes AAAA-MM (su mes de producción).\n` +
      `${lista}\nNo se ha guardado nada.`,
  );
}

async function principal() {
  const { opciones, sueltos } = leerArgumentos(process.argv.slice(2), {
    valores: [
      "cliente", "referencia", "compania", "producto", "pago", "aportacion", "duracion", "unidades", "unidades-nivel",
      "tipo", "pct-hucha", "fecha", "estado", "mes-produccion", "efecto", "cobro", "valor-unidad", "nota",
      "calendario", "produccion", "unidades-previas", "de-mes",
    ],
    banderas: ["unica", "apex", "propio", "repetida", "guardar"],
  });
  if (sueltos.length) parar(`No sé qué hacer con «${sueltos.join(" ")}».\n\n${USO}`);
  for (const obligatoria of ["cliente", "compania", "producto", "aportacion", "fecha"]) {
    if (opciones[obligatoria] === undefined) parar(`Falta --${obligatoria}.\n\n${USO}`);
  }
  const guardar = Boolean(opciones.guardar);
  const desdeArchivos = ["calendario", "produccion", "unidades-previas"].filter((o) => opciones[o] !== undefined);
  if (guardar && desdeArchivos.length) {
    parar(`Con --guardar manda la base de datos: quita ${desdeArchivos.map((o) => `--${o}`).join(", ")}.`);
  }

  // ── Lo que se ha contado ──────────────────────────────────────────────────
  const separado = separarCliente(opciones.cliente);
  const cliente = { nombre: separado.nombre, referencia: opciones.referencia?.trim() || separado.referencia, clave: claveDeNombre(separado.nombre) };
  if (!cliente.nombre || cliente.nombre.length > 80) parar("--cliente: el nombre, de 1 a 80 caracteres.");
  if (cliente.referencia && cliente.referencia.length > 40) parar("--referencia: 40 caracteres como mucho.");

  const compania = leerCodigo(opciones.compania, "--compania");
  const producto = opciones.producto.trim();
  if (!producto || producto.length > 60) parar("--producto: de 1 a 60 caracteres.");
  // Sin --pago: con --apex, el de su herramienta (se sabe más abajo); si no, domiciliación
  const pagoDado = opciones.pago ? claveDeNombre(opciones.pago) : null;
  if (pagoDado && !["domiciliacion", "transferencia"].includes(pagoDado)) parar("--pago: domiciliacion o transferencia.");
  // --apex: una aportación extraordinaria a una herramienta que ya tiene, así que es única
  const apex = Boolean(opciones.apex);
  if (opciones["de-mes"] !== undefined && !apex) parar("--de-mes solo vale con --apex: elige a qué herramienta va la aportación extraordinaria.");
  const deMes = opciones["de-mes"] === undefined ? null : leerMes(opciones["de-mes"], "--de-mes");
  const periodicidad = opciones.unica || apex ? "unica" : "mensual";
  const propio = Boolean(opciones.propio);
  const aportacion = leerCantidad(opciones.aportacion, "--aportacion");
  const duracionAnios = opciones.duracion === undefined ? undefined : leerEntero(opciones.duracion, "--duracion", 1, 99);
  const unidadesDadas = opciones.unidades === undefined ? undefined : leerCantidad(opciones.unidades, "--unidades", { cero: true });
  const unidadesNivelDadas =
    opciones["unidades-nivel"] === undefined ? undefined : leerCantidad(opciones["unidades-nivel"], "--unidades-nivel", { cero: true });
  const tipoDado = opciones.tipo === undefined ? null : claveDeNombre(opciones.tipo);
  if (tipoDado && !TIPOS_DE_COMISION.includes(tipoDado)) parar(`--tipo: ${TIPOS_DE_COMISION.join(", ")}.`);
  // 0 es una reserva, no «falta»
  const pctHuchaDado = opciones["pct-hucha"] === undefined ? null : leerCantidad(opciones["pct-hucha"], "--pct-hucha", { cero: true, maximo: 100 });
  const fecha = leerFecha(opciones.fecha, "--fecha");

  const hoy = hoyEnMadrid();
  const estado = opciones.estado ? claveDeNombre(opciones.estado) : fecha > hoy ? "prevista" : "confirmada";
  if (!["prevista", "firmada", "confirmada"].includes(estado)) parar("--estado: prevista, firmada o confirmada.");
  const nota = opciones.nota?.trim() || null;
  if (nota && nota.length > 500) parar("--nota: 500 caracteres como mucho.");

  const aMano = {
    mesProduccion: opciones["mes-produccion"] === undefined ? null : leerMes(opciones["mes-produccion"], "--mes-produccion"),
    efecto: opciones.efecto === undefined ? null : leerFecha(opciones.efecto, "--efecto"),
    cobro: opciones.cobro === undefined ? null : ultimoDiaDelMes(leerMes(opciones.cobro, "--cobro")),
    valorUnidad: opciones["valor-unidad"] === undefined ? null : leerCantidad(opciones["valor-unidad"], "--valor-unidad"),
  };

  // ── El contexto: de la base del panel o, para probar, de los archivos ─────
  const base = await prepararBase({ guardar });
  const { supabase, consultor, migracion } = base;
  const cargado = migracion ? await cargarContexto(supabase, consultor.id) : contextoDeSerie();
  const contexto = { ...cargado.contexto, ajustes: { ...cargado.contexto.ajustes } };
  const fuentes = [`cuadro ${contexto.cuadro.version}`];
  fuentes.push(cargado.companiasDeSerie ? "compañías de serie" : `tus compañías (${contexto.companias.length})`);

  if (opciones.calendario !== undefined) {
    const calendario = leerCalendario(opciones.calendario);
    contexto.cierres = calendario.cierres;
    fuentes.push(`cierres de la nota del calendario de ${calendario.anio} (${calendario.cierres.length})`);
  } else {
    fuentes.push(contexto.cierres.length ? `cierres de la base de datos (${contexto.cierres.length})` : "sin cierres cargados");
  }

  let deLasNotas = null;
  if (opciones.produccion !== undefined) {
    const leido = leerProduccion(opciones.produccion, contexto);
    if (leido.problemas.length) parar(`Hay notas de producción que no se entienden:\n  - ${leido.problemas.join("\n  - ")}`);
    deLasNotas = leido.herramientas;
    contexto.herramientas = deLasNotas.map((h) => ({
      mesProduccion: h.mesProduccion,
      unidades: h.unidades,
      unidadesNivel: h.unidadesNivel,
      estado: h.estado,
    }));
    fuentes.push(`producción de las notas (${deLasNotas.length})`);
  } else {
    fuentes.push(migracion ? `producción de la base de datos (${contexto.herramientas.length})` : "sin producción anterior");
  }

  if (opciones["unidades-previas"] !== undefined) {
    contexto.ajustes.unidadesPrevias = leerCantidad(opciones["unidades-previas"], "--unidades-previas", { cero: true });
    fuentes.push(`${unidades(contexto.ajustes.unidadesPrevias)} previas (--unidades-previas)`);
  } else {
    fuentes.push(`${unidades(contexto.ajustes.unidadesPrevias)} previas${cargado.ajustesDeSerie ? " (de serie: sin Ajustes)" : " (de Ajustes)"}`);
  }
  if (cargado.nivelesDeSerie) fuentes.push("niveles del cuadro");

  // ── El cliente y, con --apex, la herramienta de la que cuelga ─────────────
  let clienteId = null;
  let clienteTexto;
  let suyas = []; // sus herramientas de esa compañía: para las repetidas y para buscar la madre
  if (deLasNotas) {
    const enLasNotas = deLasNotas.filter((h) => h.cliente.clave === cliente.clave);
    clienteTexto = enLasNotas.length ? "ya estaba (en las notas)" : "nuevo";
    suyas = enLasNotas.filter((h) => h.compania === compania);
  } else if (migracion) {
    const { data: delConsultor, error } = await supabase.from("consultoria_clientes").select("id, nombre").eq("consultor_id", consultor.id);
    if (error) parar(`No se han podido leer los clientes: ${error.message}`);
    const iguales = delConsultor.filter((c) => claveDeNombre(c.nombre) === cliente.clave);
    if (iguales.length > 1) parar(`«${cliente.nombre}» coincide con ${iguales.length} clientes: no sé cuál es. No se ha guardado nada.`);
    clienteId = iguales[0]?.id ?? null;
    clienteTexto = clienteId ? "ya estaba" : "nuevo";
    if (clienteId) {
      const { data, error: fallo } = await leerConApex(
        (columnas) =>
          supabase.from("consultoria_herramientas").select(columnas).eq("consultor_id", consultor.id).eq("cliente_id", clienteId).eq("compania", compania),
        "id, compania, producto, periodicidad, pago, aportacion, unidades, fecha_confirmacion, mes_produccion, estado",
      );
      if (fallo) parar(`No se han podido leer sus herramientas: ${fallo.message}`);
      suyas = data.map((h) => ({
        id: h.id,
        compania: h.compania,
        producto: h.producto,
        periodicidad: h.periodicidad,
        pago: h.pago,
        aportacion: numero(h.aportacion),
        unidades: numero(h.unidades),
        fechaConfirmacion: h.fecha_confirmacion,
        mesProduccion: h.mes_produccion,
        estado: h.estado,
        aportacionDe: h.aportacion_de,
      }));
    }
  } else {
    clienteTexto = "sin saber si ya estaba (ni base de datos ni --produccion)";
  }

  let madre = null;
  if (apex) {
    if (!deLasNotas && !migracion) {
      parar("--apex necesita saber qué herramientas tiene el cliente: hace falta la base de datos (o, para probar, --produccion). No se ha guardado nada.");
    }
    if (clienteTexto === "nuevo") {
      parar(
        `«${cliente.nombre}» no está${deLasNotas ? " en las notas" : ""}: una aportación extraordinaria (--apex) va a una herramienta que el cliente ya tiene. ` +
          "Revisa el nombre. No se ha guardado nada.",
      );
    }
    madre = elegirMadre(suyas, { cliente: cliente.nombre, compania, producto, deMes });
  }
  const pago = pagoDado ?? madre?.pago ?? "domiciliacion";

  // Una compañía sin calendario no tiene de dónde sacar el efecto: se pide
  const datos = datosDeCompania(compania, contexto.companias);
  const conocida = companiaConocida(compania, contexto);
  if (datos.regla === "sin_calendario" && !aMano.efecto) {
    parar(`${conocida ? datos.nombre : `«${compania}»`} no tiene calendario: pon la fecha de efecto con --efecto AAAA-MM-DD.`);
  }

  // ── La propuesta, y lo que se cambia a mano ───────────────────────────────
  const propuesta = proponerFirma(
    {
      compania,
      producto,
      periodicidad,
      pago,
      fecha,
      unidades: unidadesDadas,
      unidadesNivel: unidadesNivelDadas,
      aportacion,
      duracionAnios,
      propio,
      fechaEfecto: aMano.efecto ?? undefined,
    },
    contexto,
  );
  if (propuesta.unidades === null) {
    const porQue = propuesta.avisos
      .filter((a) => ["falta_duracion", "producto_fuera_del_cuadro"].includes(a.codigo))
      .map((a) => a.texto)
      .join(" ");
    parar(`No se pueden proponer las unidades${porQue ? `: ${porQue}` : "."} Dalas con --unidades N (o la duración con --duracion).`);
  }

  let { mesProduccion, fechaCobro, nivel, valorUnidad, unidadesAntes } = propuesta;
  const { fechaEfecto, fechasProvisionales } = propuesta;
  let avisos = propuesta.avisos.map((a) => a.texto);
  const cambiado = [];
  const unidadesFirma = propuesta.unidades;
  const unidadesNivel = propuesta.unidadesNivel;
  const tipoComision = tipoDado ?? propuesta.tipoComision;
  if (tipoDado && tipoDado !== propuesta.tipoComision) cambiado.push("tipo");

  if (aMano.mesProduccion && aMano.mesProduccion !== mesProduccion) {
    mesProduccion = aMano.mesProduccion;
    const delMes = valorUnidadDelMes(mesProduccion, contexto);
    ({ nivel, valorUnidad, unidadesAntes } = delMes);
    const deNivel = new Set(propuesta.avisos.filter((a) => ["nivel_con_previstas", "sin_niveles"].includes(a.codigo)).map((a) => a.texto));
    avisos = [...avisos.filter((texto) => !deNivel.has(texto)), ...delMes.avisos.map((a) => a.texto)];
    cambiado.push("producción");
  }
  if (aMano.efecto) cambiado.push("efecto");
  if (aMano.cobro) {
    fechaCobro = aMano.cobro;
    cambiado.push("cobro");
  }
  if (aMano.valorUnidad !== null) {
    valorUnidad = aMano.valorUnidad;
    nivel = "a mano";
    avisos = avisos.filter((texto) => !propuesta.avisos.some((a) => a.codigo === "sin_niveles" && a.texto === texto));
    cambiado.push("€/unidad");
  }
  const pctHucha = pctHuchaDado ?? propuesta.pctHucha;
  if (pctHuchaDado !== null && centesimas(pctHuchaDado) !== centesimas(propuesta.pctHucha)) cambiado.push("reserva");
  if (fechaCobro < fechaEfecto) parar(`El cobro (${fechaCobro}) no puede ser antes del efecto (${fechaEfecto}).`);
  if (!(unidadesFirma > 0) && !(unidadesNivel > 0)) parar("Hacen falta unidades: para cobrar (--unidades) o, en una sobre recibo o sobre saldo, para el nivel (--unidades-nivel).");
  if (estado !== "prevista" && fecha > hoy) avisos.push(`La fecha (${fecha}) es futura y el estado es «${estado}»: ¿no es una prevista?`);
  if (!conocida) avisos.push(`«${compania}» no está en tus compañías: no se puede guardar hasta que se añada.`);

  const { pctIrpf } = contexto.ajustes;
  const importes = calcularImportes(unidadesFirma, valorUnidad, pctHucha, pctIrpf);

  // ── Las repetidas ─────────────────────────────────────────────────────────
  const mismaFirma = (h) =>
    h.compania === compania && claveDeNombre(h.producto) === claveDeNombre(producto) && centesimas(h.unidades) === centesimas(unidadesFirma);
  let parecidas = [];
  if (deLasNotas) {
    parecidas = suyas.filter((h) => mismaFirma(h) && h.mesProduccion === mesProduccion).map((h) => `${h.origen} (${h.estado})`);
  } else if (clienteId) {
    parecidas = suyas
      .filter((h) => mismaFirma(h))
      .filter((h) => h.fechaConfirmacion === fecha || (h.fechaConfirmacion === null && h.mesProduccion === mesProduccion))
      .map((h) => `${h.mesProduccion.slice(0, 7)}, ${h.estado}`);
  }

  // ── La liquidación del mes de cobro, con y sin esta firma ─────────────────
  const mesCobro = primerDiaDelMes(fechaCobro);
  let lineas = [];
  let cargos = [];
  let llegadas = new Map();
  if (deLasNotas) {
    lineas = deLasNotas.filter((h) => cuentaEnLiquidacion(h)).map(comoLinea);
  } else if (migracion) {
    llegadas = await leerLiquidacionesGuardadas(supabase, consultor.id);
    lineas = await leerLineasGuardadas(supabase, consultor.id);
    cargos = await leerCargosGuardados(supabase, consultor.id, llegadas);
  }
  const estaFirma = {
    mes: mesCobro,
    prevista: estado === "prevista",
    unidades: unidadesFirma,
    bruto: importes.bruto,
    hucha: importes.hucha,
    pctIrpf,
    // Una APEX cuenta con su herramienta: «4 herramientas y 1 APEX». En las notas, la madre no tiene id
    aportacionDe: madre ? (madre.id ?? madre.origen) : null,
  };
  const delMes = (resultado) => resultado.meses.find((m) => m.mes === mesCobro) ?? null;
  const sin = delMes(liquidacionesPorMes({ lineas, cargos, llegadas }));
  const con = delMes(liquidacionesPorMes({ lineas: unidadesFirma > 0 ? [...lineas, estaFirma] : lineas, cargos, llegadas }));
  if (llegadas.has(mesCobro)) {
    avisos.push(`La liquidación de ${mesEnTexto(mesCobro)} ya llegó el ${llegadas.get(mesCobro).fecha}: esta firma quedaría pendiente en un mes cobrado. Revisa el cobro.`);
  }

  // ── Lo que sale ───────────────────────────────────────────────────────────
  const marca = (que) => (cambiado.includes(que) ? " (a mano)" : "");
  console.log(`\nFirma${guardar ? "" : " · vista previa"}\n`);
  console.log(`  Cliente:     ${cliente.nombre}${cliente.referencia ? ` (${cliente.referencia})` : ""} · ${clienteTexto}`);
  console.log(
    `  Herramienta: ${conocida ? datos.nombre : compania} · ${producto} · ${pago === "transferencia" ? "transferencia" : "domiciliación"} · ` +
      `${euros(aportacion)}${periodicidad === "unica" ? " una vez" : "/mes"}${duracionAnios ? ` · ${duracionAnios} años` : ""}${propio ? " · propio" : ""}`,
  );
  if (madre) console.log(`  APEX de:     ${describirMadre(madre)}${madre.origen ? ` (${madre.origen})` : ""}`);
  console.log(`  Tipo:        ${tipoComision}${marca("tipo")}`);
  console.log(`  Fecha:       ${fecha} · ${estado}`);
  console.log(`  Producción:  ${mesProduccion.slice(0, 7)}${marca("producción")}`);
  console.log(`  Efecto:      ${fechaEfecto}${marca("efecto")}${fechasProvisionales ? " (provisional: regla sin confirmar)" : ""}`);
  console.log(`  Cobro:       ${fechaCobro}${marca("cobro")} (estimado)`);
  console.log(
    `  Unidades:    ${unidades(unidadesFirma)}${unidadesDadas === undefined ? ` (propuestas por el cuadro ${propuesta.versionCuadro})` : ""}` +
      `${unidadesNivel !== null ? ` · ${unidades(unidadesNivel)} para el nivel${unidadesNivelDadas === undefined ? " (propuestas)" : ""}` : ""}`,
  );
  console.log(
    `  Nivel:       ${nivel || "ninguno"} · ${euros(valorUnidad)}/u${marca("€/unidad")}` +
      ` (${unidades(unidadesAntes)} antes de ${mesEnTexto(mesProduccion)})`,
  );
  console.log(
    `  Importes:    comisión ${euros(importes.bruto)} · RC ${euros(importes.hucha)} (${porcentaje(pctHucha)}${marca("reserva")}) · ` +
      `IRPF ≈ ${euros(importes.irpf)} (${porcentaje(pctIrpf)}) · neto ≈ ${euros(importes.neto)}`,
  );
  console.log(`  Contexto:    ${fuentes.join(" · ")}`);
  if (base.nota) console.log(`\n  ${base.nota}`);
  if (avisos.length) {
    console.log("\nAvisos");
    for (const aviso of avisos) console.log(`  ! ${aviso}`);
  }
  if (parecidas.length) {
    console.log(`\n  ! Parece repetida: ya hay una del mismo cliente, compañía, producto, unidades y fecha (${parecidas.join("; ")}).`);
    if (!opciones.repetida) console.log("    No se guarda salvo con --repetida.");
  }

  console.log(`\nLiquidación de ${mesEnTexto(mesCobro)} (la casilla de los cobros de OVB, sin nombres; el IRPF, sobre el total):`);
  if (sin && sin.lineas.length) console.log(`  Sin esta firma: ${sin.texto}`);
  if (con) console.log(`  Con esta firma: ${con.texto}`);
  if (!(unidadesFirma > 0)) console.log("  (Esta firma no es una línea: no se cobra de una vez. Cada comisión que llegue irá en su liquidación.)");
  if (!deLasNotas && !migracion) console.log("  (Solo esta firma: sin base de datos ni --produccion no se sabe qué más hay ese mes.)");

  if (!guardar) {
    console.log("\nEsto es una vista previa: no se ha guardado nada.\n");
    return;
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  if (!conocida || cargado.companiasDeSerie) {
    parar(`«${compania}» no está en tus compañías de la base de datos: añádela antes. No se ha guardado nada.`);
  }
  if (parecidas.length && !opciones.repetida) parar("Parece repetida: no se ha guardado nada. Si de verdad es otra, añade --repetida.");
  if (!(valorUnidad > 0)) parar("No hay €/unidad: ponlo con --valor-unidad. No se ha guardado nada.");

  let clienteCreado = null;
  if (!clienteId) {
    const { data, error } = await supabase
      .from("consultoria_clientes")
      .insert({ consultor_id: consultor.id, nombre: cliente.nombre, referencia: cliente.referencia })
      .select("id")
      .single();
    if (error) parar(`No se ha podido crear el cliente: ${error.message}. No se ha guardado nada.`);
    clienteId = clienteCreado = data.id;
  }

  const { error } = await supabase.from("consultoria_herramientas").insert({
    consultor_id: consultor.id,
    cliente_id: clienteId,
    compania,
    producto,
    pago,
    periodicidad,
    tipo_comision: tipoComision,
    duracion_anios: duracionAnios ?? null,
    propio,
    aportacion,
    unidades: unidadesFirma,
    unidades_nivel: unidadesNivel,
    valor_unidad: valorUnidad,
    pct_hucha: pctHucha,
    pct_irpf: pctIrpf,
    fecha_confirmacion: fecha,
    mes_produccion: mesProduccion,
    fecha_efecto: fechaEfecto,
    fecha_cobro: fechaCobro,
    estado,
    fechas_provisionales: fechasProvisionales,
    notas: nota,
    origen: null,
    ...(madre ? { aportacion_de: madre.id } : {}),
  });
  if (error) {
    if (clienteCreado) await supabase.from("consultoria_clientes").delete().eq("id", clienteCreado).eq("consultor_id", consultor.id);
    parar(`No se ha podido guardar la firma: ${error.message}. No se ha guardado nada.`);
  }

  const ahoraLlegadas = await leerLiquidacionesGuardadas(supabase, consultor.id);
  const ahora = delMes(
    liquidacionesPorMes({
      lineas: await leerLineasGuardadas(supabase, consultor.id),
      cargos: await leerCargosGuardados(supabase, consultor.id, ahoraLlegadas),
      llegadas: ahoraLlegadas,
    }),
  );
  console.log(`\n✓ Guardada${clienteCreado ? ", con el cliente nuevo" : ""}.`);
  if (ahora) console.log(`  Ahora: ${ahora.texto}\n`);
}

lanzar(principal);
