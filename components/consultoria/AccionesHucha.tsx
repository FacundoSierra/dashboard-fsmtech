'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import BotonBorrar from '@/components/consultoria/BotonBorrar';
import { borrarMovimientoHucha } from '@/lib/consultoria/acciones';
import type { MovimientoDeHucha } from '@/lib/consultoria/tipos';
import { BOTON_SECUNDARIO } from './estilos';
import type { TipoDeMovimiento } from './FormularioMovimientoHucha';

const FormularioMovimientoHucha = dynamic(() => import('./FormularioMovimientoHucha'), {
  loading: () => <p className="mt-4 text-sm text-apagado">Un momento…</p>,
});

/** «Reclamar», «Ajuste» y «Saldo de partida» (o cambiarlo, si ya está), y el formulario que abren */
export default function AccionesHucha({ hoy, pctIrpf, inicial }: { hoy: string; pctIrpf: number; inicial: MovimientoDeHucha | null }) {
  const [abierto, setAbierto] = useState<TipoDeMovimiento | null>(null);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAbierto('reclamacion')} aria-pressed={abierto === 'reclamacion'} className={BOTON_SECUNDARIO}>
          Reclamar
        </button>
        <button type="button" onClick={() => setAbierto('ajuste')} aria-pressed={abierto === 'ajuste'} className={BOTON_SECUNDARIO}>
          Ajuste
        </button>
        <button type="button" onClick={() => setAbierto('inicial')} aria-pressed={abierto === 'inicial'} className={BOTON_SECUNDARIO}>
          {inicial ? 'Cambiar el saldo de partida' : 'Saldo de partida'}
        </button>
      </div>
      {abierto && (
        <FormularioMovimientoHucha
          key={abierto}
          tipo={abierto}
          hoy={hoy}
          pctIrpf={pctIrpf}
          existente={abierto === 'inicial' ? inicial : null}
          alTerminar={() => setAbierto(null)}
        />
      )}
    </div>
  );
}

/** Quitar un movimiento apuntado a mano (los de las liquidaciones y los extornos salen de ellos) */
export function QuitarDeLaHucha({ id, descripcion }: { id: string; descripcion: string }) {
  return <BotonBorrar descripcion={descripcion} etiqueta="Quitar" enCurso="Quitando…" className="min-h-11" onBorrar={() => borrarMovimientoHucha(id)} />;
}
