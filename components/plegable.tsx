import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Lo que se guarda plegado («Completado hoy» en Hoy, «El trato y todos sus cobros» en Economía, las
 * propiedades de una nota): una fila de 48 px con su chevrón, que se abre sin JavaScript (`details`).
 * `pequeno`, en 14 px y gris, para lo secundario dentro de una tarjeta
 */
export function Plegable({
  titulo,
  children,
  className = '',
  pequeno = false,
}: {
  titulo: ReactNode;
  children: ReactNode;
  className?: string;
  pequeno?: boolean;
}) {
  return (
    <details className={`group ${className}`}>
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center gap-2.5 hover:text-acento [&::-webkit-details-marker]:hidden ${
          pequeno ? 'text-sm text-tenue' : 'text-[15px] font-medium text-texto'
        }`}
      >
        <ChevronRight className="size-4 shrink-0 text-tenue motion-safe:transition-transform group-open:rotate-90" aria-hidden />
        <span className="min-w-0">{titulo}</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
