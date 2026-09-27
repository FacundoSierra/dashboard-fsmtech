import 'server-only';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { del, get, put } from '@vercel/blob';

/**
 * Dónde viven los archivos de los documentos: fuera de la bóveda y de Git, porque llevan datos
 * personales (nombres, NIF, direcciones) y Git los guardaría para siempre en cada equipo.
 *
 *  - Producción: un almacén **privado** de Vercel Blob conectado al proyecto. Nada se lee sin
 *    pasar por `/api/documentos`, que comprueba la sesión. En Vercel se autentica con OIDC
 *    (`BLOB_STORE_ID`), sin claves de larga duración
 *  - Desarrollo: la carpeta `DOCUMENTOS_DIR`, igual que las notas se leen de `BOVEDA_DIR`
 *
 * Sin ninguno de los dos, no se puede subir nada (y el panel lo dice).
 */

function carpetaLocal(): string | undefined {
  return process.env.DOCUMENTOS_DIR || undefined;
}

function hayBlob(): boolean {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export function almacenConfigurado(): boolean {
  return Boolean(carpetaLocal()) || hayBlob();
}

/** `clientes/cni/2026-09-27-factura.pdf` → la ruta en disco, sin salirse de la carpeta */
function enDisco(carpeta: string, pathname: string): string {
  const destino = path.resolve(carpeta, ...pathname.split('/'));
  if (!destino.startsWith(path.resolve(carpeta) + path.sep)) throw new Error(`Ruta de archivo no válida: ${pathname}`);
  return destino;
}

/**
 * Guarda un archivo nuevo y devuelve su ruta definitiva, que lleva un sufijo al azar: dos
 * documentos con el mismo nombre nunca se pisan.
 */
export async function guardarArchivo(pathname: string, datos: Buffer, contentType: string): Promise<string> {
  const carpeta = carpetaLocal();
  if (carpeta) {
    const definitiva = pathname.replace(/(\.[a-z0-9]+)$/, `-${randomBytes(6).toString('hex')}$1`);
    const destino = enDisco(carpeta, definitiva);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, datos, { flag: 'wx' });
    return definitiva;
  }
  if (!hayBlob()) throw new Error('No hay almacén de documentos configurado');

  const guardado = await put(pathname, datos, { access: 'private', addRandomSuffix: true, contentType });
  return guardado.pathname;
}

export async function borrarArchivo(pathname: string): Promise<void> {
  const carpeta = carpetaLocal();
  if (carpeta) return unlink(enDisco(carpeta, pathname));
  if (hayBlob()) await del(pathname);
}

export async function leerArchivo(pathname: string): Promise<{ contenido: ReadableStream<Uint8Array>; tamano: number } | null> {
  const carpeta = carpetaLocal();
  if (carpeta) {
    const origen = enDisco(carpeta, pathname);
    try {
      const { size } = await stat(origen);
      return { contenido: Readable.toWeb(createReadStream(origen)) as ReadableStream<Uint8Array>, tamano: size };
    } catch {
      return null;
    }
  }
  if (!hayBlob()) return null;

  const leido = await get(pathname, { access: 'private' });
  if (leido?.statusCode !== 200) return null;
  return { contenido: leido.stream, tamano: leido.blob.size };
}
