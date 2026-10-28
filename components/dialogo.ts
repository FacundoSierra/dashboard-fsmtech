'use client';

import { useEffect, useEffectEvent, type RefObject } from 'react';

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lo que necesita para el teclado una hoja o un diálogo que tapa la página, mientras `abierto`:
 * al abrirse se lleva el foco (a `inicial`, o a la propia `caja`, que necesita `tabIndex={-1}`),
 * Esc lo cierra, el Tab da la vuelta dentro sin salirse y, al cerrarse, el foco vuelve a donde
 * estaba. Si no estaba en ningún sitio (Safari no enfoca un botón al pulsarlo), a `vuelta`.
 */
export function useDialogo({
  abierto,
  caja,
  alCerrar,
  inicial,
  vuelta,
}: {
  abierto: boolean;
  caja: RefObject<HTMLElement | null>;
  alCerrar: () => void;
  inicial?: RefObject<HTMLElement | null>;
  vuelta?: RefObject<HTMLElement | null>;
}) {
  const cerrar = useEffectEvent(alCerrar);

  useEffect(() => {
    if (!abierto) return;
    const activo = document.activeElement;
    const previo = activo instanceof HTMLElement && activo !== document.body ? activo : null;
    const respaldo = vuelta?.current;
    (inicial?.current ?? caja.current)?.focus();

    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrar();
        return;
      }
      const dentro = caja.current;
      if (evento.key !== 'Tab' || !dentro) return;
      // Solo lo que se ve: lo que está en un `details` cerrado o con `hidden` no cuenta
      const lista = [...dentro.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((elemento) => elemento.getClientRects().length > 0);
      if (lista.length === 0) {
        evento.preventDefault();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const actual = document.activeElement;
      const fuera = !(actual instanceof Node) || !dentro.contains(actual) || actual === dentro;
      if (evento.shiftKey && (fuera || actual === primero)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (fuera || actual === ultimo)) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      const destino = previo?.isConnected ? previo : respaldo;
      destino?.focus();
    };
  }, [abierto, caja, inicial, vuelta]);
}
