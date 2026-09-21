import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_GITHUB, cabecerasGitHub, configGitHub, rutaApi } from './github';

/** Error con un mensaje que se puede enseñar tal cual en la interfaz */
export class ErrorEscritura extends Error {}

/** El panel solo puede crear notas nuevas dentro de `inbox/`, y marcar cobros (más abajo) */
const RE_RUTA_INBOX = /^inbox\/[a-z0-9][a-z0-9-]*\.md$/;
const MENSAJE_DUPLICADA = 'Ya hay una captura con ese nombre: espera un minuto o cambia la primera línea.';

export async function crearNotaInbox(ruta: string, contenido: string, mensajeCommit: string): Promise<void> {
  if (!RE_RUTA_INBOX.test(ruta)) throw new ErrorEscritura('El nombre de la nota no es válido.');

  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) {
    const destino = path.join(carpeta, ...ruta.split('/'));
    await mkdir(path.dirname(destino), { recursive: true });
    try {
      // `wx`: falla si la nota ya existe, nunca la sobrescribe
      await writeFile(destino, contenido, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ErrorEscritura(MENSAJE_DUPLICADA);
      throw error;
    }
    return;
  }

  const github = configGitHub();
  if (!github) throw new ErrorEscritura('Falta configurar GITHUB_TOKEN y GITHUB_REPO.');

  // Sin `sha`, GitHub solo crea: si la nota existe responde 422 en vez de sobrescribirla
  const respuesta = await fetch(`${API_GITHUB}/repos/${github.repo}/contents/${rutaApi(ruta)}`, {
    method: 'PUT',
    headers: { ...cabecerasGitHub(github.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensajeCommit,
      content: Buffer.from(contenido, 'utf8').toString('base64'),
      branch: github.rama,
    }),
    cache: 'no-store',
  });
  if (respuesta.ok) return;
  if (respuesta.status === 422) throw new ErrorEscritura(MENSAJE_DUPLICADA);
  if ([401, 403, 404].includes(respuesta.status)) {
    throw new ErrorEscritura('El token de GitHub no puede escribir en el repo de notas: dale permiso "Contents: Read and write".');
  }
  throw new Error(`GitHub respondió ${respuesta.status} al guardar ${ruta}`);
}

// ── Cobros ───────────────────────────────────────────────────────────────────

/**
 * La otra única escritura del panel: marcar o desmarcar un cobro. Solo en las notas de
 * cobros de un cliente, solo una línea con forma de cobro, y solo si esa línea sigue igual
 * que cuando se pintó la página: si alguien la ha cambiado entretanto (en Obsidian), no se toca.
 */
// `clientes/<cliente>/cobros/<cliente>-cobros-<año>.md`: la nota tiene que estar en la carpeta de su cliente
const RE_RUTA_COBROS = /^clientes\/([a-z0-9][a-z0-9-]*)\/cobros\/\1-cobros-\d{4}\.md$/;
const RE_LINEA_COBRO = /^(\s*[-*+] \[)([ xX])(\] \d{4}-\d{2}\s*[—–-].+€)(.*)$/;
const MENSAJE_CAMBIADA = 'La nota ha cambiado desde que abriste la página. Recárgala e inténtalo otra vez.';

/** Cambia la casilla y apunta o quita la fecha de cobro */
function alternar(linea: string, cobrado: boolean, fecha: string): string {
  const partes = linea.match(RE_LINEA_COBRO);
  if (!partes) throw new ErrorEscritura('Esa línea no es un cobro.');
  const resto = partes[4].replace(/\s*[—–-]\s*cobrado \d{4}-\d{2}-\d{2}/, '');
  return cobrado
    ? `${partes[1]}x${partes[3]} — cobrado ${fecha}${resto}`
    : `${partes[1]} ${partes[3]}${resto}`;
}

function reemplazarLinea(contenido: string, lineaOriginal: string, cobrado: boolean, fecha: string): string {
  const salto = contenido.includes('\r\n') ? '\r\n' : '\n';
  const lineas = contenido.split(/\r?\n/);
  const indice = lineas.findIndex((l) => l.trim() === lineaOriginal.trim());
  if (indice === -1) throw new ErrorEscritura(MENSAJE_CAMBIADA);
  lineas[indice] = alternar(lineas[indice], cobrado, fecha);
  return lineas.join(salto);
}

export async function marcarCobro(ruta: string, lineaOriginal: string, cobrado: boolean, fecha: string): Promise<void> {
  if (!RE_RUTA_COBROS.test(ruta)) throw new ErrorEscritura('Esa nota no es de cobros.');
  if (!RE_LINEA_COBRO.test(lineaOriginal.trim())) throw new ErrorEscritura('Esa línea no es un cobro.');

  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) {
    const destino = path.join(carpeta, ...ruta.split('/'));
    const actual = await readFile(destino, 'utf8');
    await writeFile(destino, reemplazarLinea(actual, lineaOriginal, cobrado, fecha), 'utf8');
    return;
  }

  const github = configGitHub();
  if (!github) throw new ErrorEscritura('Falta configurar GITHUB_TOKEN y GITHUB_REPO.');
  const url = `${API_GITHUB}/repos/${github.repo}/contents/${rutaApi(ruta)}`;

  const leida = await fetch(`${url}?ref=${encodeURIComponent(github.rama)}`, {
    headers: cabecerasGitHub(github.token),
    cache: 'no-store',
  });
  if (!leida.ok) throw new Error(`GitHub respondió ${leida.status} al leer ${ruta}`);
  const { sha, content } = (await leida.json()) as { sha: string; content: string };
  const actual = Buffer.from(content, 'base64').toString('utf8');

  // Con el `sha` de lo leído: si la nota cambia entre leer y escribir, GitHub responde 409
  const respuesta = await fetch(url, {
    method: 'PUT',
    headers: { ...cabecerasGitHub(github.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `cobros: ${ruta.split('/')[1]} ${cobrado ? 'cobrado' : 'desmarcado'} ${lineaOriginal.match(/\d{4}-\d{2}/)?.[0] ?? ''}`.trim(),
      content: Buffer.from(reemplazarLinea(actual, lineaOriginal, cobrado, fecha), 'utf8').toString('base64'),
      sha,
      branch: github.rama,
    }),
    cache: 'no-store',
  });
  if (respuesta.ok) return;
  if (respuesta.status === 409) throw new ErrorEscritura(MENSAJE_CAMBIADA);
  if ([401, 403, 404].includes(respuesta.status)) {
    throw new ErrorEscritura('El token de GitHub no puede escribir en el repo de notas: dale permiso "Contents: Read and write".');
  }
  throw new Error(`GitHub respondió ${respuesta.status} al guardar ${ruta}`);
}
