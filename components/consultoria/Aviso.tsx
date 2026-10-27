import type { ReactNode } from 'react';
import { IconoEstado } from '@/components/ui';
import { AVISO } from './estilos';

/**
 * Un aviso de la consultoría: el icono de «aviso» del panel y el texto en tinta normal, porque un
 * estado nunca va solo por color (en FSM-Finance era texto ámbar). `caja`, con su fondo, para los
 * que van sueltos; sin ella, en línea. `como`, la etiqueta: un `li` en las listas de avisos y un
 * `span` dentro de un párrafo.
 */
export default function Aviso({
  children,
  caja = false,
  como: Etiqueta = 'p',
  className = '',
}: {
  children: ReactNode;
  caja?: boolean;
  como?: 'p' | 'li' | 'span' | 'div';
  className?: string;
}) {
  return (
    <Etiqueta className={`flex items-start gap-2 ${caja ? AVISO : 'text-sm text-texto'} ${className}`}>
      <IconoEstado nivel="aviso" className="mt-0.5 size-4" />
      <span className="min-w-0">{children}</span>
    </Etiqueta>
  );
}
