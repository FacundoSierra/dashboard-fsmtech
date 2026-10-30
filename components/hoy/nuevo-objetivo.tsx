'use client';

import type { MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { BOTON_PRINCIPAL } from '@/components/estilos';

/**
 * «Nuevo objetivo», el botón principal de Hoy: lleva al campo de añadir de la tarjeta de objetivos
 * y deja el cursor dentro, listo para escribir. Sin JavaScript, el enlace baja hasta la tarjeta
 */
export function BotonNuevoObjetivo() {
  function alPulsar(evento: MouseEvent<HTMLAnchorElement>) {
    const campo = document.getElementById('nuevo-objetivo');
    if (!(campo instanceof HTMLInputElement)) return;
    evento.preventDefault();
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    campo.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'center' });
    campo.focus({ preventScroll: true });
  }

  return (
    <a href="#objetivos" onClick={alPulsar} className={`${BOTON_PRINCIPAL} max-sm:flex-1`}>
      <Plus className="size-4" aria-hidden />
      Nuevo objetivo
    </a>
  );
}
