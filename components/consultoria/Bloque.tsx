import type { ReactNode } from 'react';
import { TARJETA } from './estilos';

interface BloqueProps {
  titulo: string;
  periodo?: string;
  /** Lo que va a la derecha del título: un botón, un enlace… */
  accion?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * El `Bloque` de FSM-Finance con el aspecto de `Tarjeta` del panel. Se queda aparte porque lleva
 * debajo del título una línea que dice de qué va (`periodo`), y `Tarjeta` no la tiene.
 */
export default function Bloque({ titulo, periodo, accion, className = '', children }: BloqueProps) {
  return (
    <section className={`${TARJETA} ${className}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
          {periodo && <p className="mt-0.5 text-sm text-tenue">{periodo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}
