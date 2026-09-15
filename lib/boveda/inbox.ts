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

export function capturas(boveda: Boveda): Captura[] {
  return boveda.notas
    .filter((nota) => nota.carpeta === 'inbox')
    .map((nota) => {
      const p = nota.propiedades;
      const principal = nota.secciones.find((s) => s.nivel === 1)?.contenido ?? nota.secciones[0]?.contenido ?? '';
      return {
        nota,
        categoria: texto(p.categoria),
        fecha: texto(p.fecha) ?? nota.nombre.match(/^\d{4}-\d{2}-\d{2}/)?.[0],
        hora: texto(p.hora),
        relacionada: lista(p.relacionado).map(destinoEnlace)[0],
        resumen: principal
          .split('\n')
          .filter((linea) => !/^\s*#[A-Za-z]/.test(linea))
          .join('\n')
          .trim(),
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
