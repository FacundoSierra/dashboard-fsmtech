import type { ReactNode } from 'react';
import { TITULO_TARJETA } from '@/components/ui';
import { TARJETA } from './estilos';

interface BloqueProps {
  titulo: string;
  periodo?: string;
  /** Lo que va a la derecha del título: un botón, un enlace… */
  accion?: ReactNode;
  className?: string;
  /** Para llegar con un enlace (`#nivel`): se queda por debajo de la cabecera fija */
  id?: string;
  children: ReactNode;
}

/**
 * El `Bloque` de FSM-Finance con el aspecto de `Tarjeta` del panel: blanca, de 20 px, sin borde ni
 * sombra, y el título de 17 px. Se queda aparte porque lleva debajo del título una línea que dice
 * de qué va (`periodo`), y `Tarjeta` no la tiene.
 */
export default function Bloque({ titulo, periodo, accion, className = '', id, children }: BloqueProps) {
  return (
    <section id={id} className={`${TARJETA} scroll-mt-24 ${className}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={TITULO_TARJETA}>{titulo}</h2>
          {periodo && <p className="mt-0.5 text-sm text-tenue">{periodo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}
