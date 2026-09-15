import type { Tarea } from '@/lib/boveda/tipos';
import { Markdown } from './markdown';

export function ListaTareas({ tareas, rutas }: { tareas: Tarea[]; rutas: Record<string, string> }) {
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
              tarea.hecha ? 'border-ok bg-ok text-white' : 'border-tenue'
            }`}
          >
            {tarea.hecha ? '✓' : null}
            <span className="sr-only">{tarea.hecha ? 'Hecha' : 'Pendiente'}</span>
          </span>
          <span className={`min-w-0 break-words ${tarea.hecha ? 'text-tenue line-through' : ''}`}>
            <Markdown texto={tarea.texto} rutas={rutas} enLinea />
          </span>
        </li>
      ))}
    </ul>
  );
}
