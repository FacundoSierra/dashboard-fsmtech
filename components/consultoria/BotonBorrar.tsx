'use client';

import { useState, useTransition } from 'react';

/**
 * Borrar algo con una confirmación de un solo clic: el botón se convierte en «¿Seguro?»
 * y solo entonces borra. Sin ventanas del navegador y sin borrados por error.
 */
export default function BotonBorrar({
  onBorrar,
  etiqueta = 'Borrar',
  enCurso = 'Borrando…',
  descripcion,
  className = '',
}: {
  onBorrar: () => Promise<{ error?: string }>;
  etiqueta?: string;
  /** Lo que pone mientras trabaja: «Borrando…», «Quitando…» */
  enCurso?: string;
  /** Para quien navega con lector de pantalla: qué se está borrando. */
  descripcion: string;
  className?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, empezar] = useTransition();

  if (error) {
    return <span className="text-[13px] text-critico-texto">{error}</span>;
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        aria-label={`${etiqueta}: ${descripcion}`}
        className={`text-[13px] text-apagado underline-offset-4 hover:text-critico-texto hover:underline ${className}`}
      >
        {etiqueta}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[13px]">
      <button
        type="button"
        disabled={trabajando}
        onClick={() =>
          empezar(async () => {
            const resultado = await onBorrar();
            if (resultado?.error) {
              setError(resultado.error);
              setConfirmando(false);
            }
          })
        }
        className="font-semibold text-critico-texto underline-offset-4 hover:underline disabled:opacity-60"
      >
        {trabajando ? enCurso : '¿Seguro?'}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="text-apagado underline-offset-4 hover:underline"
      >
        No
      </button>
    </span>
  );
}
