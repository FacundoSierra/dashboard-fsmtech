import { Check } from 'lucide-react';
import type { Tarea } from '@/lib/boveda/tipos';
import { Markdown, textoPlano } from './markdown';
import { TareaEditable } from './tarea-editable';

/**
 * Tareas que solo se leen (Urgente, Completado, Proyectos, Semana). No llevan casilla, para que
 * no parezcan pulsables junto a las que sí lo son: un punto si está pendiente y un `Check` si está
 * hecha. `compacta`: cada tarea en dos líneas como mucho, para tarjetas que van en rejilla
 */
export function ListaTareas({
  tareas,
  rutas,
  titulos,
  compacta = false,
}: {
  tareas: Tarea[];
  rutas: Record<string, string>;
  titulos?: Record<string, string>;
  compacta?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {tareas.map((tarea, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-[15px] leading-snug"
          style={{ marginLeft: `${tarea.nivel * 1.25}rem` }}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
            {tarea.hecha ? (
              <Check className="size-4 text-serie" strokeWidth={2.5} />
            ) : (
              <span className="size-1.5 rounded-full bg-apagado" />
            )}
          </span>
          <span className="sr-only">{tarea.hecha ? 'Hecha: ' : 'Pendiente: '}</span>
          <span
            className={`min-w-0 break-words ${tarea.hecha ? 'text-tenue line-through' : ''} ${compacta ? 'line-clamp-2' : ''}`}
            title={compacta ? textoPlano(tarea.texto, titulos) : undefined}
          >
            <Markdown texto={tarea.texto} rutas={rutas} titulos={titulos} enLinea />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Las filas de tareas que se marcan, separadas por una raya: cada una se lee como una cosa */
export const LISTA_EDITABLE = 'divide-y divide-borde';

/**
 * Las tareas de una diaria, que se marcan desde el panel. `mover`: a qué otra lista se pueden
 * mandar las de primer nivel. Lo que se escribe en la nota va siempre con `tarea.linea`, la línea
 * tal cual; lo que se ve, limpio (`textoParaPanel`, en el Markdown en línea)
 */
export function ListaTareasEditable({
  tareas,
  rutas,
  titulos,
  ruta,
  mover,
}: {
  tareas: Tarea[];
  rutas: Record<string, string>;
  titulos?: Record<string, string>;
  /** La diaria donde están */
  ruta: string;
  mover?: 'espera' | 'objetivos';
}) {
  return (
    <ul className={LISTA_EDITABLE}>
      {tareas.map((tarea, i) => (
        <TareaEditable
          key={`${i}-${tarea.linea}`}
          ruta={ruta}
          linea={tarea.linea}
          hecha={tarea.hecha}
          nivel={tarea.nivel}
          mover={tarea.nivel === 0 ? mover : undefined}
        >
          <Markdown texto={tarea.texto} rutas={rutas} titulos={titulos} enLinea />
        </TareaEditable>
      ))}
    </ul>
  );
}
