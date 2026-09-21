'use client';

import { useActionState } from 'react';
import { Check, Loader2, Undo2 } from 'lucide-react';
import { cambiarCobro, type EstadoCobro } from '@/app/(panel)/economia/acciones';

/** Marca un cobro desde el panel. Escribe en la nota de cobros y llega a Obsidian con la sincronización */
export function BotonCobro({ ruta, linea, cobrado }: { ruta: string; linea: string; cobrado: boolean }) {
  const [estado, accion, guardando] = useActionState<EstadoCobro, FormData>(cambiarCobro, {});

  return (
    <form action={accion} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="ruta" value={ruta} />
      <input type="hidden" name="linea" value={linea} />
      <input type="hidden" name="cobrado" value={cobrado ? '0' : '1'} />
      {cobrado ? (
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-tenue hover:bg-superficie-2 hover:text-texto disabled:opacity-60"
        >
          {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />}
          Deshacer
        </button>
      ) : (
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-1 rounded-md bg-acento-fuerte px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
          Cobrado
        </button>
      )}
      {estado.error && (
        <span role="alert" className="max-w-56 text-right text-xs text-critico-texto">
          {estado.error}
        </span>
      )}
    </form>
  );
}
