import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { API_GITHUB, cabecerasGitHub, configGitHub, type ConfigGitHub } from './github';

export interface ArchivoNota {
  ruta: string;
  contenido: string;
}

/** Solo notas: fuera carpetas ocultas (`.obsidian`, `.repos`, `.claude`…), plantillas y el CLAUDE.md de la raíz */
export function esNotaVisible(ruta: string): boolean {
  if (!ruta.toLowerCase().endsWith('.md')) return false;
  const partes = ruta.split('/');
  if (partes.some((parte) => parte.startsWith('.') || parte === 'node_modules')) return false;
  if (partes[0] === 'templates') return false;
  return !(partes.length === 1 && partes[0] === 'CLAUDE.md');
}

/** Desarrollo: lee la bóveda directamente del disco */
async function leerCarpeta(raiz: string): Promise<ArchivoNota[]> {
  const archivos: ArchivoNota[] = [];

  async function recorrer(relativa: string): Promise<void> {
    const entradas = await readdir(path.join(raiz, relativa), { withFileTypes: true });
    await Promise.all(
      entradas.map(async (entrada) => {
        // Sin entrar en carpetas ocultas: `.repos` tiene miles de archivos de código
        if (entrada.name.startsWith('.') || entrada.name === 'node_modules') return;
        const ruta = relativa ? `${relativa}/${entrada.name}` : entrada.name;
        if (entrada.isDirectory()) return recorrer(ruta);
        if (entrada.isFile() && esNotaVisible(ruta)) {
          archivos.push({ ruta, contenido: await readFile(path.join(raiz, ruta), 'utf8') });
        }
      }),
    );
  }

  await recorrer('');
  return archivos;
}

/** Producción: lee el repo privado de notas con la API de GitHub */
async function leerGitHub({ token, repo, rama }: ConfigGitHub): Promise<ArchivoNota[]> {
  const arbol = await fetch(`${API_GITHUB}/repos/${repo}/git/trees/${encodeURIComponent(rama)}?recursive=1`, {
    headers: cabecerasGitHub(token),
    next: { revalidate: 60, tags: ['boveda'] },
  });
  if (!arbol.ok) throw new Error(`GitHub respondió ${arbol.status} al listar las notas`);

  const { tree, truncated } = (await arbol.json()) as {
    tree: { path: string; type: string; sha: string }[];
    truncated: boolean;
  };
  if (truncated) console.warn('GitHub devolvió la lista de archivos incompleta');

  return Promise.all(
    tree
      .filter((elemento) => elemento.type === 'blob' && esNotaVisible(elemento.path))
      .map(async ({ path: ruta, sha }) => {
        // Un SHA siempre tiene el mismo contenido: se guarda en caché sin caducidad
        // y solo se descargan las notas que han cambiado
        const respuesta = await fetch(`${API_GITHUB}/repos/${repo}/git/blobs/${sha}`, {
          headers: cabecerasGitHub(token),
          cache: 'force-cache',
        });
        if (!respuesta.ok) throw new Error(`GitHub respondió ${respuesta.status} al leer ${ruta}`);

        const blob = (await respuesta.json()) as { content: string; encoding: string };
        const contenido = blob.encoding === 'base64' ? Buffer.from(blob.content, 'base64').toString('utf8') : blob.content;
        return { ruta, contenido };
      }),
  );
}

export async function leerNotas(): Promise<ArchivoNota[]> {
  const carpeta = process.env.BOVEDA_DIR;
  if (carpeta) return leerCarpeta(carpeta);

  const github = configGitHub();
  if (github) return leerGitHub(github);

  throw new Error('Falta la fuente de las notas: define BOVEDA_DIR (local) o GITHUB_TOKEN y GITHUB_REPO (producción)');
}
