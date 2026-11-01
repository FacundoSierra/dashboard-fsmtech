'use client';

import { useState, useTransition } from 'react';
import { programarCuotas } from '@/lib/consultoria/acciones';
import type { Resultado } from '@/lib/consultoria/tipos';
import { BOTON_SECUNDARIO, ERROR } from './estilos';
import MensajeHecho from './MensajeHecho';

/**
 * «Programar las que faltan (N)» de la página de una serie (REQ-002). Va siempre en la página de una
 * serie sin anular, aunque no falte ninguna: así, al volver a pintarse sin el botón, el mensaje de lo
 * programado se queda a la vista
 */
export default function ProgramarCuotas({ herramientaId, faltan }: { herramientaId: string; faltan: number }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [trabajando, empezar] = useTransition();

  if (faltan === 0 && !resultado) return null;
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      {faltan > 0 && (
        <button
          type="button"
          disabled={trabajando}
          onClick={() => empezar(async () => setResultado(await programarCuotas(herramientaId)))}
          className={BOTON_SECUNDARIO}
        >
          {trabajando ? 'Programando…' : `Programar las que faltan (${faltan})`}
        </button>
      )}
      {resultado?.error && (
        <p role="alert" className={ERROR}>
          {resultado.error}
        </p>
      )}
      {resultado?.ok && <MensajeHecho texto={resultado.ok} className="self-stretch" />}
    </div>
  );
}
