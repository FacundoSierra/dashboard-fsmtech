/**
 * Carga los cierres de OVB de un año desde la nota del calendario de producción, en la base del panel
 * (REQ-001; spec sección 6 de FSM-Finance y 8 del panel). Es el camino de cada año: en diciembre, los
 * del siguiente.
 *
 *   npm run consultoria:cierres -- <nota-del-calendario.md> [--guardar]
 *
 * - Lee el año de la propiedad `anio:` y la tabla `| Mes | INTESA | AVANZA | AXA PIAS | Ranking |`,
 *   con casillas como `19 · inc. 21`, `26 · inc. 3 feb` o `22 · inc. en enero`. Si una casilla no
 *   se entiende, se para diciendo cuál
 * - **Sin `--guardar` no escribe nada**: enseña los cierres como los ha entendido y, si puede mirar
 *   la base de datos, cuáles son nuevos y cuáles cambiarían
 * - Con `--guardar`, `upsert` de todos a la vez por `(consultor_id, mes, calendario)`. Hace falta
 *   la migración 0001, la copia y que la base del panel ya sea la fuente (`fuente_desde`, spec 6.4):
 *   antes del cambio, `--guardar` para. Los cierres no llevan datos de clientes
 * - El consultor: el único de la base del panel
 *
 * La ruta de la nota se pasa por argumento: el repo no sabe dónde están las notas.
 * Necesita SUPABASE_URL y SUPABASE_SECRET_KEY en el .env.local del panel para mirar o guardar.
 */
import { lanzar, leerArgumentos, leerCalendario, NOMBRE_DEL_CALENDARIO, parar, prepararBase } from "./consultoria-comun.mjs";

const USO = "Uso: npm run consultoria:cierres -- <nota-del-calendario.md> [--guardar]";
const ORDEN = ["INTESA", "AVANZA", "AXA_PIAS", "RANKING"];

/** `2026-02-03` en una casilla del mes `2026-01-01` → `3 feb` */
function diaCorto(fecha, mes) {
  if (!fecha) return "—";
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dia = String(Number(fecha.slice(8, 10)));
  if (fecha.slice(0, 7) === mes.slice(0, 7)) return dia;
  const otro = `${dia} ${nombres[Number(fecha.slice(5, 7)) - 1]}`;
  return fecha.slice(0, 4) === mes.slice(0, 4) ? otro : `${otro} ${fecha.slice(0, 4)}`;
}

async function principal() {
  const { opciones, sueltos } = leerArgumentos(process.argv.slice(2), { valores: [], banderas: ["guardar"] });
  if (sueltos.length !== 1) parar(USO);
  const guardar = Boolean(opciones.guardar);

  // ── Lo que dice la nota ───────────────────────────────────────────────────
  const { anio, cierres, meses } = leerCalendario(sueltos[0]);

  console.log(`\nCierres de ${anio}, como se han entendido de la nota (hasta las 23:59 de cada día):\n`);
  const ancho = 18;
  console.log(`  ${"Mes".padEnd(9)}${ORDEN.map((c) => NOMBRE_DEL_CALENDARIO[c].padEnd(ancho)).join("")}`);
  const porMes = Map.groupBy(cierres, (c) => c.mes);
  for (const [mes, delMes] of porMes) {
    const casillas = ORDEN.map((calendario) => {
      const cierre = delMes.find((c) => c.calendario === calendario);
      return (cierre ? `${diaCorto(cierre.confirmarHasta, mes)} · inc. ${diaCorto(cierre.incidenciasHasta, mes)}` : "—").padEnd(ancho);
    });
    console.log(`  ${mes.slice(0, 7).padEnd(9)}${casillas.join("")}`);
  }
  console.log(`\n  ${cierres.length} cierres de ${anio} (${meses} meses × 4 calendarios)`);
  if (meses !== 12) console.log(`  Ojo: la tabla tiene ${meses} meses, no 12.`);
  console.log("  «inc. —»: el calendario no da el día de las incidencias (se guarda vacío).");

  // ── Lo que hay en la base de datos ────────────────────────────────────────
  const { supabase, consultor, migracion, nota } = await prepararBase({ guardar });
  if (nota) console.log(`\n${nota}`);
  if (!supabase || !migracion) {
    console.log("\nEsto es una vista previa: no se ha guardado nada.\n");
    return;
  }

  const { data: guardados, error } = await supabase
    .from("consultoria_cierres")
    .select("mes, calendario, confirmar_hasta, incidencias_hasta")
    .eq("consultor_id", consultor.id)
    .gte("mes", `${anio}-01-01`)
    .lte("mes", `${anio}-12-01`);
  if (error) parar(`No se han podido leer los cierres guardados: ${error.message}`);

  const clave = (c) => `${c.mes}|${c.calendario}`;
  const antes = new Map((guardados ?? []).map((c) => [clave(c), c]));
  const nuevos = cierres.filter((c) => !antes.has(clave(c)));
  const cambian = cierres.filter((c) => {
    const guardado = antes.get(clave(c));
    return guardado && (guardado.confirmar_hasta !== c.confirmarHasta || guardado.incidencias_hasta !== c.incidenciasHasta);
  });
  const sobran = (guardados ?? []).filter((g) => !cierres.some((c) => clave(c) === clave(g)));

  console.log(`\nConsultor: ${consultor.nombre}`);
  console.log(`En la base de datos: ${antes.size} de ${anio} · nuevos ${nuevos.length} · cambian ${cambian.length} · iguales ${cierres.length - nuevos.length - cambian.length}`);
  for (const c of cambian) {
    const g = antes.get(clave(c));
    console.log(
      `  ${c.mes.slice(0, 7)} ${NOMBRE_DEL_CALENDARIO[c.calendario]}: ${g.confirmar_hasta} · inc. ${g.incidencias_hasta ?? "—"}` +
        ` → ${c.confirmarHasta} · inc. ${c.incidenciasHasta ?? "—"}`,
    );
  }
  if (sobran.length) {
    console.log(`  Hay ${sobran.length} guardados que la nota no tiene: se quedan como están (${sobran.map((g) => `${g.mes.slice(0, 7)} ${g.calendario}`).join(", ")}).`);
  }

  if (!guardar) {
    console.log("\nEsto es una vista previa: no se ha guardado nada. Para hacerlo, añade --guardar.\n");
    return;
  }
  if (!nuevos.length && !cambian.length) {
    console.log("\nYa estaban todos: no hay nada que guardar.\n");
    return;
  }

  // ── Guardar: todos en una sola petición, así entran todos o ninguno ─────────
  const filas = cierres.map((c) => ({
    consultor_id: consultor.id,
    mes: c.mes,
    calendario: c.calendario,
    confirmar_hasta: c.confirmarHasta,
    incidencias_hasta: c.incidenciasHasta,
  }));
  const { error: fallo } = await supabase.from("consultoria_cierres").upsert(filas, { onConflict: "consultor_id,mes,calendario" });
  if (fallo) parar(`No se han podido guardar los cierres: ${fallo.message}. No se ha guardado ninguno.`);
  console.log(`\n✓ Guardados los ${filas.length} cierres de ${anio} (${nuevos.length} nuevos, ${cambian.length} cambiados).\n`);
}

lanzar(principal);
