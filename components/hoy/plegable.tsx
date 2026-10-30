import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Lo que en Hoy se guarda plegado («Completado hoy», «De días anteriores», «Urgente en los
 * proyectos»): una fila de 48 px con su chevrón, que se abre sin JavaScript (`details`)
 */
export function Plegable({ titulo, children, className = '' }: { titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 text-[15px] font-medium text-texto hover:text-acento [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-tenue motion-safe:transition-transform group-open:rotate-90" aria-hidden />
        <span className="min-w-0">{titulo}</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
