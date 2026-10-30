'use client';

import { useActionState, useState } from 'react';
import { Check, Loader2, Undo2 } from 'lucide-react';
import { cambiarCobro, type EstadoCobro } from '@/app/(panel)/economia/acciones';
import { ZONA_TOQUE } from './estilos';

/** Lo del servidor y si este botón acaba de marcarlo */
type EstadoBoton = EstadoCobro & { marcadoAqui?: boolean };

const DESHACER = `${ZONA_TOQUE} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-superficie-2 disabled:opacity-60`;

/**
 * Marca un cobro desde el panel. Escribe en la nota de cobros y llega a Obsidian con la sincronización.
 *
 * El botón dice lo que hace («Marcar cobrado»), no el estado. «Deshacer» va a un toque en el cobro
 * recién marcado (aquí mismo o hoy, `marcadoHoy`); en uno de antes, como el de marzo desde el
 * desplegable del trato, pide confirmarlo en línea, como `BotonBorrar` de la consultoría
 */
export function BotonCobro({
  ruta,
  linea,
  cobrado,
  marcadoHoy = false,
}: {
  ruta: string;
  linea: string;
  cobrado: boolean;
  /** Se marcó hoy: se deshace sin preguntar */
  marcadoHoy?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoBoton, FormData>(async (anterior, datos) => {
    const resultado = await cambiarCobro(anterior, datos);
    setConfirmando(false);
    return { ...resultado, marcadoAqui: datos.get('cobrado') === '1' && !resultado.error };
  }, {});
  const sinPreguntar = marcadoHoy || estado.marcadoAqui === true;
  const icono = (Icono: typeof Check) =>
    guardando ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <Icono className="size-3.5" aria-hidden />;

  return (
    <form action={accion} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="ruta" value={ruta} />
      <input type="hidden" name="linea" value={linea} />
      <input type="hidden" name="cobrado" value={cobrado ? '0' : '1'} />
      {!cobrado ? (
        <button
          type="submit"
          disabled={guardando}
          className={`${ZONA_TOQUE} inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-acento-fuerte px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60`}
        >
          {icono(Check)}
          Marcar cobrado
        </button>
      ) : confirmando ? (
        // Del ancho de «Deshacer», para no apretar la fila en el móvil
        <span className="inline-flex items-center gap-1 text-xs">
          <button
            type="submit"
            autoFocus
            disabled={guardando}
            aria-label="Sí, deshacer el cobro"
            className={`${DESHACER} whitespace-nowrap font-semibold text-critico-texto`}
          >
            {guardando ? icono(Undo2) : null}
            ¿Seguro?
          </button>
          <button type="button" disabled={guardando} onClick={() => setConfirmando(false)} className={`${DESHACER} text-tenue hover:text-texto`}>
            No
          </button>
        </span>
      ) : sinPreguntar ? (
        <button type="submit" disabled={guardando} className={`${DESHACER} text-tenue hover:text-texto`}>
          {icono(Undo2)}
          Deshacer
        </button>
      ) : (
        <button type="button" onClick={() => setConfirmando(true)} className={`${DESHACER} text-tenue hover:text-texto`}>
          <Undo2 className="size-3.5" aria-hidden />
          Deshacer
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
