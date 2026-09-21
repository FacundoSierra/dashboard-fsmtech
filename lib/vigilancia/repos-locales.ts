import 'server-only';
import { texto } from '@/lib/boveda/consultas';
import type { Boveda } from '@/lib/boveda/tipos';

/**
 * Estado de los repos de código del PC: commits sin subir y cambios sin guardar.
 *
 * Los repos de `.repos/` no están en GitHub con la bóveda, así que el panel no los ve.
 * Los describe `.scripts/estado-repos.ps1`, que la sincronización de la bóveda lanza
 * cada dos minutos y que escribe esta nota solo cuando algo cambia.
 */
export const NOTA_REPOS_LOCALES = 'dashboards/repos-locales.md';

export interface RepoLocal {
  nombre: string;
  grupo: string;
  rama?: string;
  /** Commits hechos en el PC que no están en GitHub; `undefined` si no tiene remoto */
  sinSubir?: number;
  /** Archivos modificados sin commit */
  sinCommit: number;
  ultimoCommit?: string;
}

export interface ReposLocales {
  actualizado?: string;
  repos: RepoLocal[];
}

function numero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;
}

export function reposLocales(boveda: Boveda): ReposLocales | null {
  const nota = boveda.porRuta.get(NOTA_REPOS_LOCALES);
  if (!nota) return null;

  const lista = Array.isArray(nota.propiedades.repos) ? nota.propiedades.repos : [];
  const repos = lista.flatMap((valor): RepoLocal[] => {
    if (!valor || typeof valor !== 'object') return [];
    const r = valor as Record<string, unknown>;
    const nombre = texto(r.nombre);
    if (!nombre) return [];
    return [
      {
        nombre,
        grupo: texto(r.grupo) ?? '',
        rama: texto(r.rama),
        sinSubir: numero(r.sin_subir),
        sinCommit: numero(r.sin_commit) ?? 0,
        ultimoCommit: texto(r.ultimo_commit),
      },
    ];
  });

  return { actualizado: texto(nota.propiedades.actualizado), repos };
}
