import 'server-only';
import type { Boveda } from '@/lib/boveda/tipos';

/** Un panel propio al que se salta desde aquí: FSM-Finance, el de DF… */
export interface Portal {
  nombre: string;
  url: string;
  descripcion?: string;
  /** El dominio, sin `www.`, para enseñarlo debajo del nombre */
  dominio: string;
}

/**
 * Los portales de `dashboards/portales.md` (`tipo: portales`): una lista con `nombre`, `url` y
 * `descripcion`. Solo se aceptan direcciones `https`: un enlace que sale de una nota no puede
 * ser `javascript:` ni ir a un sitio sin cifrar.
 */
export function portales(boveda: Boveda): Portal[] {
  return boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'portales')
    .flatMap((nota) => (Array.isArray(nota.propiedades.portales) ? nota.propiedades.portales : []))
    .flatMap((valor): Portal[] => {
      if (!valor || typeof valor !== 'object') return [];
      const { nombre, url, descripcion } = valor as Record<string, unknown>;
      if (typeof nombre !== 'string' || !nombre.trim() || typeof url !== 'string') return [];

      let direccion: URL;
      try {
        direccion = new URL(url.trim());
      } catch {
        return [];
      }
      if (direccion.protocol !== 'https:') return [];

      return [
        {
          nombre: nombre.trim(),
          url: direccion.href,
          descripcion: typeof descripcion === 'string' && descripcion.trim() ? descripcion.trim() : undefined,
          dominio: direccion.hostname.replace(/^www\./, ''),
        },
      ];
    });
}
