import type { Tarea } from '@/lib/boveda/tipos';
import { Markdown } from './markdown';

/** `compacta`: cada tarea en dos líneas como mucho, para tarjetas que van en rejilla */
export function ListaTareas({
  tareas,
  rutas,
  compacta = false,
}: {
  tareas: Tarea[];
  rutas: Record<string, string>;
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
          <span
            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${
              tarea.hecha ? 'border-bien bg-bien text-white' : 'border-borde-fuerte'
            }`}
          >
            {tarea.hecha ? '✓' : null}
            <span className="sr-only">{tarea.hecha ? 'Hecha' : 'Pendiente'}</span>
          </span>
          <span
            className={`min-w-0 break-words ${tarea.hecha ? 'text-tenue line-through' : ''} ${compacta ? 'line-clamp-2' : ''}`}
            title={compacta ? tarea.texto.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, destino, alias) => alias ?? destino) : undefined}
          >
            <Markdown texto={tarea.texto} rutas={rutas} enLinea />
          </span>
        </li>
      ))}
    </ul>
  );
}
