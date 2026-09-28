import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { updateTag } from 'next/cache';
import { API_GITHUB, cabecerasGitHub, configGitHub, rutaApi } from './github';
import { buscarLinea, finDeBloque, insertarAlFinal, rangoSeccion, sangriaDe, saltoDe, type Rango } from './lineas';

/**
 * Todo lo que el panel puede escribir en la bóveda, y nada más.
 *
 * Cada escritura está acotada a un tipo de nota (por su ruta), a una sección y a una forma de
 * línea. Ninguna borra una nota ni la reescribe entera:
 *
 *  | Escritura          | Dónde                                       | Qué cambia                        |
 *  |--------------------|---------------------------------------------|-----------------------------------|
 *  | `crearNotaInbox`   | `inbox/<nombre>.md`, nueva                  | Crea la nota, nunca sobrescribe   |
 *  | `crearDiaria`      | `daily-notes/AAAA-MM-DD.md`, nueva          | Crea la del día, nunca sobrescribe|
 *  | `marcarTarea`      | Diaria: «Objetivos» o «A la espera»         | Solo la casilla de una línea      |
 *  | `anadirObjetivo`   | Diaria: «Objetivos»                         | Una línea nueva al final          |
 *  | `moverTarea`       | Diaria: entre «Objetivos» y «A la espera»   | Mueve una línea con sus hijas     |
 *  | `marcarCobro`      | Nota de cobros: «Cobros»                    | La casilla y la fecha de cobro    |
 *  | `anadirCobroExtra` | Nota de cobros: «Cobros»                    | Una línea nueva, ya cobrada       |
 *  | `anadirRenovacion` | Ficha de cliente: «Renovaciones»            | Una línea nueva                   |
 *  | `crearNotaDocumento` | `clientes/<cliente>/documentos/…`, nueva  | Crea la nota, nunca sobrescribe   |
 *  | `crearFichaCliente`  | `clientes/<cliente>/<cliente>.md`, nueva  | Crea la ficha, nunca sobrescribe  |
 *  | `crearNotaCobros`    | Nota de cobros del cliente, nueva         | Crea la nota, nunca sobrescribe   |
 *  | `crearReunion`       | `clientes/<cliente>/reuniones/…`, nueva   | Crea la nota, nunca sobrescribe   |
 *  | `crearRequerimiento` | `proyectos/<slug>/requerimientos/…`, nueva| Crea la nota, nunca sobrescribe   |
 *
 * Si la línea que se quiere tocar ya no está igual que cuando se pintó la página (porque se ha
 * cambiado en Obsidian), no se toca nada. En producción se escribe además con el `sha` de lo
 * leído: si la nota cambia entre leer y escribir, GitHub responde 409.
 *
 * Marcar un objetivo cambia la casilla en su sitio en vez de moverlo a «Completado» a
 * propósito: Claude apunta en «Completado» desde el PC a menudo, y dos líneas añadidas al
 * final de la misma sección a la vez, una en el PC y otra en GitHub, paran la sincronización.
 */

/** Error con un mensaje que se puede enseñar tal cual en la interfaz */
export class ErrorEscritura extends Error {}
/** La nota que se iba a crear ya existe */
export class ErrorYaExiste extends ErrorEscritura {}

export interface ResultadoEscritura {
  error?: string;
}

const MENSAJE_CAMBIADA = 'La nota ha cambiado desde que abriste la página. Recárgala e inténtalo otra vez.';
const MENSAJE_NO_EXISTE = 'Esa nota ya no existe. Recarga la página.';
const MENSAJE_PERMISOS = 'El token de GitHub no puede escribir en el repo de notas: dale permiso "Contents: Read and write".';

/**
 * Lo que hacen todas las Server Actions que escriben: guardar, traducir el error a algo que se
 * pueda enseñar y caducar la bóveda en caché para que la página se pinte ya con el cambio.
 * La sesión se comprueba antes, en la propia acción.
 */
export async function guardar(que: string, escritura: () => Promise<void>): Promise<ResultadoEscritura> {
  try {
    await escritura();
  } catch (error) {
    console.error(`No se pudo ${que}`, error);
    return { error: error instanceof ErrorEscritura ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.' };
  }
  updateTag('boveda');
  return {};
}

// ── Lo común: crear y modificar ──────────────────────────────────────────────

function github() {
  const config = configGitHub();
  if (!config) throw new ErrorEscritura('Falta configurar GITHUB_TOKEN y GITHUB_REPO.');
  return config;
}

function rutaEnDisco(carpeta: string, ruta: string): string {
  return path.join(carpeta, ...ruta.split('/'));
}

function fallo(respuesta: Response, ruta: string): never {
  if (respuesta.status === 409) throw new ErrorEscritura(MENSAJE_CAMBIADA);
  if ([401, 403, 404].includes(respuesta.status)) throw new ErrorEscritura(MENSAJE_PERMISOS);
  throw new Error(`GitHub respondió ${respuesta.status} al guardar ${ruta}`);
}

/** Crea una nota que no existe. Si ya existe lanza `ErrorYaExiste(siExiste)`: nunca la sobrescribe */
async function crearNota(ruta: string, contenido: string, mensajeCommit: string, siExiste: string): Promise<void> {
  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) {
    const destino = rutaEnDisco(carpeta, ruta);
    await mkdir(path.dirname(destino), { recursive: true });
    try {
      // `wx`: falla si la nota ya existe, nunca la sobrescribe
      await writeFile(destino, contenido, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ErrorYaExiste(siExiste);
      throw error;
    }
    return;
  }

  const { token, repo, rama } = github();
  // Sin `sha`, GitHub solo crea: si la nota existe responde 422 en vez de sobrescribirla
  const respuesta = await fetch(`${API_GITHUB}/repos/${repo}/contents/${rutaApi(ruta)}`, {
    method: 'PUT',
    headers: { ...cabecerasGitHub(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensajeCommit, content: Buffer.from(contenido, 'utf8').toString('base64'), branch: rama }),
    cache: 'no-store',
  });
  if (respuesta.ok) return;
  if (respuesta.status === 422) throw new ErrorYaExiste(siExiste);
  fallo(respuesta, ruta);
}

/**
 * Lee una nota, deja que `cambiar` toque sus líneas y la guarda con los mismos saltos de línea.
 * Si `cambiar` no cambia nada, no se escribe (ni se hace un commit vacío).
 */
async function modificarNota(ruta: string, cambiar: (lineas: string[]) => void, mensajeCommit: string): Promise<void> {
  const aplicar = (actual: string): string => {
    const lineas = actual.split(/\r?\n/);
    cambiar(lineas);
    return lineas.join(saltoDe(actual));
  };

  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) {
    const destino = rutaEnDisco(carpeta, ruta);
    let actual: string;
    try {
      actual = await readFile(destino, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ErrorEscritura(MENSAJE_NO_EXISTE);
      throw error;
    }
    const nuevo = aplicar(actual);
    if (nuevo !== actual) await writeFile(destino, nuevo, 'utf8');
    return;
  }

  const { token, repo, rama } = github();
  const url = `${API_GITHUB}/repos/${repo}/contents/${rutaApi(ruta)}`;
  const leida = await fetch(`${url}?ref=${encodeURIComponent(rama)}`, { headers: cabecerasGitHub(token), cache: 'no-store' });
  if (leida.status === 404) throw new ErrorEscritura(MENSAJE_NO_EXISTE);
  if (!leida.ok) throw new Error(`GitHub respondió ${leida.status} al leer ${ruta}`);
  const { sha, content } = (await leida.json()) as { sha: string; content: string };
  const actual = Buffer.from(content, 'base64').toString('utf8');
  const nuevo = aplicar(actual);
  if (nuevo === actual) return;

  // Con el `sha` de lo leído: si la nota cambia entre leer y escribir, GitHub responde 409
  const respuesta = await fetch(url, {
    method: 'PUT',
    headers: { ...cabecerasGitHub(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: mensajeCommit, content: Buffer.from(nuevo, 'utf8').toString('base64'), sha, branch: rama }),
    cache: 'no-store',
  });
  if (respuesta.ok) return;
  fallo(respuesta, ruta);
}

/** La sección donde tiene que ir la línea; si la nota no la tiene, se dice en vez de inventarla */
function seccion(lineas: string[], clave: string, nombre: string): Rango {
  const rango = rangoSeccion(lineas, clave);
  if (!rango) throw new ErrorEscritura(`La nota no tiene sección «${nombre}».`);
  return rango;
}

/**
 * Texto escrito en el panel convertido en una línea segura: sin saltos (partirían la viñeta)
 * ni `%%` (en Obsidian abriría un comentario que escondería el resto de la nota).
 */
export function lineaLimpia(texto: string, maximo: number, que: string): string {
  const limpio = texto.replace(/%%/g, '').replace(/\s+/g, ' ').trim();
  if (!limpio) throw new ErrorEscritura(`Escribe ${que}.`);
  if (limpio.length > maximo) throw new ErrorEscritura(`${que[0].toUpperCase()}${que.slice(1)} es demasiado largo: ${maximo} caracteres como mucho.`);
  return limpio;
}

/** El texto crudo de una plantilla de `templates/`, para montar una nota igual que en el PC */
export async function leerPlantilla(nombre: 'daily-note' | 'cliente' | 'cobros' | 'reunion' | 'requerimiento'): Promise<string> {
  const ruta = `templates/${nombre}.md`;
  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) return readFile(rutaEnDisco(carpeta, ruta), 'utf8');

  const { token, repo, rama } = github();
  const respuesta = await fetch(`${API_GITHUB}/repos/${repo}/contents/${rutaApi(ruta)}?ref=${encodeURIComponent(rama)}`, {
    headers: cabecerasGitHub(token),
    next: { revalidate: 3600, tags: ['boveda'] },
  });
  if (!respuesta.ok) throw new Error(`GitHub respondió ${respuesta.status} al leer ${ruta}`);
  const { content } = (await respuesta.json()) as { content: string };
  return Buffer.from(content, 'base64').toString('utf8');
}

// ── Inbox ────────────────────────────────────────────────────────────────────

const RE_RUTA_INBOX = /^inbox\/[a-z0-9][a-z0-9-]*\.md$/;

export async function crearNotaInbox(ruta: string, contenido: string, mensajeCommit: string): Promise<void> {
  if (!RE_RUTA_INBOX.test(ruta)) throw new ErrorEscritura('El nombre de la nota no es válido.');
  await crearNota(ruta, contenido, mensajeCommit, 'Ya hay una captura con ese nombre: espera un minuto o cambia la primera línea.');
}

// ── La diaria ────────────────────────────────────────────────────────────────

const RE_RUTA_DIARIA = /^daily-notes\/(\d{4}-\d{2}-\d{2})\.md$/;
const RE_CASILLA = /^(\s*[-*+] \[)([ xX])(\] \S.*)$/;
const LARGO_OBJETIVO = 300;

function fechaDiaria(ruta: string): string {
  const fecha = ruta.match(RE_RUTA_DIARIA)?.[1];
  if (!fecha) throw new ErrorEscritura('Esa nota no es una diaria.');
  return fecha;
}

function comprobarTarea(linea: string): void {
  if (linea.length > 1000 || !RE_CASILLA.test(linea.trim())) throw new ErrorEscritura('Esa línea no es una tarea.');
}

/** La línea, buscada en «Objetivos» y en «A la espera», y en ningún otro sitio de la diaria */
function localizarTarea(lineas: string[], original: string, secciones: string[]): { indice: number; rango: Rango } {
  for (const clave of secciones) {
    const rango = rangoSeccion(lineas, clave);
    const indice = rango ? buscarLinea(lineas, rango, original) : null;
    if (rango && indice !== null) return { indice, rango };
  }
  throw new ErrorEscritura(MENSAJE_CAMBIADA);
}

/** Crea la diaria de hoy, ya montada, con un objetivo nuevo al final de «Objetivos» */
export async function crearDiaria(ruta: string, contenido: string, objetivo: string): Promise<void> {
  const fecha = fechaDiaria(ruta);
  const nueva = `- [ ] ${lineaLimpia(objetivo, LARGO_OBJETIVO, 'el objetivo')}`;
  const lineas = contenido.split(/\r?\n/);
  insertarAlFinal(lineas, seccion(lineas, 'objetivos', '🎯 Objetivos'), [nueva]);
  await crearNota(ruta, lineas.join(saltoDe(contenido)), `diaria: ${fecha} creada desde el panel`, 'La diaria de hoy ya existe.');
}

/** Marca o desmarca una tarea de «Objetivos» o «A la espera». Solo cambia la casilla, en su sitio */
export async function marcarTarea(ruta: string, original: string, hecha: boolean): Promise<void> {
  const fecha = fechaDiaria(ruta);
  comprobarTarea(original);
  await modificarNota(
    ruta,
    (lineas) => {
      const { indice } = localizarTarea(lineas, original, ['objetivos', 'a la espera']);
      lineas[indice] = lineas[indice].replace(RE_CASILLA, `$1${hecha ? 'x' : ' '}$3`);
    },
    `diaria: ${fecha} ${hecha ? 'tarea hecha' : 'tarea desmarcada'}`,
  );
}

export async function anadirObjetivo(ruta: string, texto: string): Promise<void> {
  const fecha = fechaDiaria(ruta);
  const nueva = `- [ ] ${lineaLimpia(texto, LARGO_OBJETIVO, 'el objetivo')}`;
  await modificarNota(
    ruta,
    (lineas) => insertarAlFinal(lineas, seccion(lineas, 'objetivos', '🎯 Objetivos'), [nueva]),
    `diaria: ${fecha} objetivo nuevo`,
  );
}

/**
 * Pasa una tarea de «Objetivos» a «A la espera», con el formato de siempre
 * (`— **quién** — desde AAAA-MM-DD`), o la devuelve cuando el otro ha contestado.
 * Solo tareas de primer nivel; sus hijas van con ellas.
 */
export async function moverTarea(
  ruta: string,
  original: string,
  destino: { a: 'espera'; quien: string; desde: string } | { a: 'objetivos' },
): Promise<void> {
  const fecha = fechaDiaria(ruta);
  comprobarTarea(original);
  const quien = destino.a === 'espera' ? lineaLimpia(destino.quien.replace(/\*/g, ''), 60, 'quién lo tiene') : '';

  await modificarNota(
    ruta,
    (lineas) => {
      const { indice, rango } = localizarTarea(lineas, original, [destino.a === 'espera' ? 'objetivos' : 'a la espera']);
      if (sangriaDe(lineas[indice]) > 0) throw new ErrorEscritura('Solo se mueven las tareas de primer nivel.');

      const bloque = lineas.splice(indice, finDeBloque(lineas, indice, rango.fin) - indice);
      if (destino.a === 'espera') bloque[0] = `${bloque[0].trimEnd()} — **${quien}** — desde ${destino.desde}`;
      const [clave, nombre] = destino.a === 'espera' ? ['a la espera', '⏳ A la espera'] : ['objetivos', '🎯 Objetivos'];
      insertarAlFinal(lineas, seccion(lineas, clave, nombre), bloque);
    },
    `diaria: ${fecha} ${destino.a === 'espera' ? `tarea a la espera de ${quien}` : 'tarea de vuelta a objetivos'}`,
  );
}

// ── Cobros ───────────────────────────────────────────────────────────────────

// `clientes/<cliente>/cobros/<cliente>-cobros-<año>.md`: la nota tiene que estar en la carpeta de su cliente
const RE_RUTA_COBROS = /^clientes\/([a-z0-9][a-z0-9-]*)\/cobros\/\1-cobros-\d{4}\.md$/;
const RE_LINEA_COBRO = /^(\s*[-*+] \[)([ xX])(\] \d{4}-\d{2}\s*[—–-].+€)(.*)$/;

/** Cambia la casilla y apunta o quita la fecha de cobro */
function alternar(linea: string, cobrado: boolean, fecha: string): string {
  const partes = linea.match(RE_LINEA_COBRO);
  if (!partes) throw new ErrorEscritura('Esa línea no es un cobro.');
  const resto = partes[4].replace(/\s*[—–-]\s*cobrado \d{4}-\d{2}-\d{2}/, '');
  return cobrado
    ? `${partes[1]}x${partes[3]} — cobrado ${fecha}${resto}`
    : `${partes[1]} ${partes[3]}${resto}`;
}

function clienteDeCobros(ruta: string): string {
  const cliente = ruta.match(RE_RUTA_COBROS)?.[1];
  if (!cliente) throw new ErrorEscritura('Esa nota no es de cobros.');
  return cliente;
}

export async function marcarCobro(ruta: string, original: string, cobrado: boolean, fecha: string): Promise<void> {
  const cliente = clienteDeCobros(ruta);
  if (!RE_LINEA_COBRO.test(original.trim())) throw new ErrorEscritura('Esa línea no es un cobro.');
  await modificarNota(
    ruta,
    (lineas) => {
      const indice = buscarLinea(lineas, seccion(lineas, 'cobros', 'Cobros'), original);
      if (indice === null) throw new ErrorEscritura(MENSAJE_CAMBIADA);
      lineas[indice] = alternar(lineas[indice], cobrado, fecha);
    },
    `cobros: ${cliente} ${cobrado ? 'cobrado' : 'desmarcado'} ${original.match(/\d{4}-\d{2}/)?.[0] ?? ''}`.trim(),
  );
}

/** `70` → `70`; `12.5` → `12,50`: como se escriben a mano en las notas */
function importeEnNota(importe: number): string {
  return Number.isInteger(importe) ? String(importe) : importe.toFixed(2).replace('.', ',');
}

/** Un cobro que no estaba en el plan: se apunta ya cobrado, en el mes en que se cobró */
export async function anadirCobroExtra(ruta: string, cobro: { concepto: string; importe: number; fecha: string }): Promise<void> {
  const cliente = clienteDeCobros(ruta);
  if (!(cobro.importe > 0 && cobro.importe <= 1_000_000)) throw new ErrorEscritura('El importe no es válido.');
  const concepto = lineaLimpia(cobro.concepto.replace(/€/g, ''), 120, 'el concepto');
  const mes = cobro.fecha.slice(0, 7);
  const nueva = `- [x] ${mes} — ${concepto} — ${importeEnNota(cobro.importe)} € — cobrado ${cobro.fecha}`;
  await modificarNota(
    ruta,
    (lineas) => insertarAlFinal(lineas, seccion(lineas, 'cobros', 'Cobros'), [nueva]),
    `cobros: ${cliente} extra ${mes}`,
  );
}

// ── Renovaciones ─────────────────────────────────────────────────────────────

// La ficha del cliente: `clientes/<cliente>/<cliente>.md`
const RE_RUTA_FICHA = /^clientes\/([a-z0-9][a-z0-9-]*)\/\1\.md$/;

export async function anadirRenovacion(ruta: string, fecha: string, concepto: string): Promise<void> {
  const cliente = ruta.match(RE_RUTA_FICHA)?.[1];
  if (!cliente) throw new ErrorEscritura('Esa nota no es la ficha de un cliente.');
  const nueva = `- ${fecha} — ${lineaLimpia(concepto, 120, 'qué se renueva')}`;
  await modificarNota(
    ruta,
    (lineas) => insertarAlFinal(lineas, seccion(lineas, 'renovaciones', 'Renovaciones'), [nueva]),
    `renovaciones: ${cliente} ${fecha}`,
  );
}

// ── Documentos ───────────────────────────────────────────────────────────────

// `clientes/<cliente>/documentos/<AAAA-MM-DD>-<cliente>-<titulo>.md`: en la carpeta de su cliente y con su nombre delante
const RE_RUTA_DOCUMENTO = /^clientes\/([a-z0-9][a-z0-9-]*)\/documentos\/\d{4}-\d{2}-\d{2}-\1-[a-z0-9][a-z0-9-]*\.md$/;

/** La nota que describe un documento subido; el archivo va aparte, en el almacén privado */
export async function crearNotaDocumento(ruta: string, contenido: string): Promise<void> {
  const cliente = ruta.match(RE_RUTA_DOCUMENTO)?.[1];
  if (!cliente) throw new ErrorEscritura('El nombre del documento no es válido.');
  await crearNota(ruta, contenido, `documentos: ${cliente} ${ruta.split('/').at(-1)?.slice(0, 10)}`, 'Ya hay un documento con ese nombre y esa fecha: cambia el título.');
}

// ── Notas nuevas desde el panel ──────────────────────────────────────────────
// Solo crean: si la nota ya existe, no la tocan. El contenido sale de la plantilla de la bóveda

const RE_RUTA_REUNION = /^clientes\/([a-z0-9][a-z0-9-]*)\/reuniones\/\d{4}-\d{2}-\d{2}-\1-[a-z0-9][a-z0-9-]*\.md$/;
const RE_RUTA_REQUERIMIENTO = /^proyectos\/([a-z0-9][a-z0-9-]*)\/requerimientos\/req-\d{3}-[a-z0-9][a-z0-9-]*\.md$/;

export async function crearFichaCliente(ruta: string, contenido: string): Promise<void> {
  const cliente = ruta.match(RE_RUTA_FICHA)?.[1];
  if (!cliente) throw new ErrorEscritura('El nombre del cliente no es válido.');
  await crearNota(ruta, contenido, `clientes: ficha nueva de ${cliente}`, 'Ya hay un cliente con ese nombre.');
}

export async function crearNotaCobros(ruta: string, contenido: string): Promise<void> {
  const cliente = clienteDeCobros(ruta);
  await crearNota(ruta, contenido, `cobros: nota nueva de ${cliente}`, 'Ese cliente ya tiene nota de cobros de ese año.');
}

export async function crearReunion(ruta: string, contenido: string): Promise<void> {
  const cliente = ruta.match(RE_RUTA_REUNION)?.[1];
  if (!cliente) throw new ErrorEscritura('El nombre de la reunión no es válido.');
  await crearNota(ruta, contenido, `reuniones: ${cliente} ${ruta.split('/').at(-1)?.slice(0, 10)}`, 'Ya hay una reunión con ese tema ese día.');
}

export async function crearRequerimiento(ruta: string, contenido: string): Promise<void> {
  const proyecto = ruta.match(RE_RUTA_REQUERIMIENTO)?.[1];
  if (!proyecto) throw new ErrorEscritura('El nombre del requerimiento no es válido.');
  await crearNota(ruta, contenido, `requerimientos: ${proyecto} ${ruta.split('/').at(-1)?.slice(0, 7)}`, 'Ya hay un requerimiento con ese nombre.');
}
