import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_GITHUB, cabecerasGitHub, configGitHub, rutaApi } from './github';

/** Error con un mensaje que se puede enseñar tal cual en la interfaz */
export class ErrorEscritura extends Error {}

/** El panel solo puede crear notas nuevas dentro de `inbox/` */
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
