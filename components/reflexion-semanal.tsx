'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { responderSemana } from '@/app/(panel)/semana/acciones';

const CAMPO =
  'w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30';

/** Las preguntas de la reflexión que aún no tienen respuesta, para contestarlas desde el móvil */
export function ReflexionSemanal({ ruta, preguntas }: { ruta: string; preguntas: string[] }) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [guardando, empezar] = useTransition();

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(undefined);
    empezar(async () => {
      const resultado = await responderSemana(
        ruta,
        preguntas.map((pregunta) => ({ pregunta, respuesta: respuestas[pregunta] ?? '' })),
      );
      if (resultado.error) setError(resultado.error);
      else setRespuestas({});
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {preguntas.map((pregunta) => (
        <label key={pregunta} className="block">
          <span className="mb-1 block text-sm font-medium">{pregunta}</span>
          <textarea
            value={respuestas[pregunta] ?? ''}
            onChange={(e) => setRespuestas((antes) => ({ ...antes, [pregunta]: e.target.value }))}
            rows={2}
            maxLength={1500}
            className={CAMPO}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm text-critico-texto">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={guardando || !Object.values(respuestas).some((r) => r.trim())}
        className="inline-flex items-center gap-2 rounded-lg bg-acento-fuerte px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Guardar en la revisión
      </button>
      <p className="text-xs text-apagado">Se puede responder una sola y dejar las demás para luego.</p>
    </form>
  );
}
