import 'server-only';
import { destinoEnlace, lista, texto } from './consultas';
import type { Boveda, Nota } from './tipos';

export interface Captura {
  nota: Nota;
  categoria?: string;
  fecha?: string;
  hora?: string;
  relacionada?: string;
  /** Texto de la nota sin el título, las subsecciones ni la línea de etiquetas */
  resumen: string;
}

export interface Opcion {
  nombre: string;
  titulo: string;
}

/**
 * El resumen sin su primera línea si repite el título: una captura lleva el texto debajo de un
 * `# Título` que es su primera línea (y en las tareas, `- [ ] ` delante). Si el título se cortó
 * con «…», basta con que la línea empiece igual
 */
function sinRepetirTitulo(resumen: string, titulo: string): string {
  const [primera = '', ...resto] = resumen.split('\n');
  const limpia = primera.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|>\s*|#+\s+)?/, '').trim();
  const repite = limpia === titulo || (titulo.endsWith('…') && limpia.startsWith(titulo.slice(0, -1).trimEnd()));
  return repite ? resto.join('\n').trim() : resumen;
}

export function capturas(boveda: Boveda): Captura[] {
  return boveda.notas
    .filter((nota) => nota.carpeta === 'inbox')
    .map((nota) => {
      const p = nota.propiedades;
      const principal = nota.secciones.find((s) => s.nivel === 1)?.contenido ?? nota.secciones[0]?.contenido ?? '';
      const resumen = principal
        .split('\n')
        .filter((linea) => !/^\s*#[A-Za-z]/.test(linea))
        .join('\n')
        .trim();
      return {
        nota,
        categoria: texto(p.categoria),
        fecha: texto(p.fecha) ?? nota.nombre.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
        hora: texto(p.hora),
        relacionada: lista(p.relacionado).map(destinoEnlace)[0],
        resumen: sinRepetirTitulo(resumen, nota.titulo),
      };
    })
    .sort((a, b) =>
      `${b.fecha ?? ''} ${b.hora ?? ''} ${b.nota.nombre}`.localeCompare(`${a.fecha ?? ''} ${a.hora ?? ''} ${a.nota.nombre}`),
    );
}

/** Proyectos no completados y clientes a los que se puede enlazar una captura */
export function relacionables(boveda: Boveda): { proyectos: Opcion[]; clientes: Opcion[] } {
  const opciones = (filtro: (nota: Nota) => boolean) =>
    boveda.notas
      .filter(filtro)
      .map((nota) => ({ nombre: nota.nombre, titulo: nota.titulo }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));

  return {
    proyectos: opciones((n) => n.propiedades.tipo === 'proyecto' && texto(n.propiedades.estado) !== 'completado'),
    clientes: opciones((n) => n.propiedades.tipo === 'cliente'),
  };
}
