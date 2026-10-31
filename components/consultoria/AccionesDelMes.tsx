'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { deshacerLiquidacion } from '@/lib/consultoria/acciones';
import type { LineaLiquidacion, MesLiquidacion, MovimientoDeCuenta } from '@/lib/consultoria/tipos';
import { euros } from '@/lib/consultoria/formato';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, ERROR } from './estilos';
import { soloElMes } from './formato';

// La hoja solo viaja cuando se abre
const HaLlegado = dynamic(() => import('./HaLlegado'));

/**
 * En un mes sin liquidar, «Ha llegado», que abre su hoja. En uno liquidado, «Deshacer», con su
 * confirmación en línea: sus herramientas vuelven a estar por cobrar y su reserva sale de la hucha.
 */
export default function AccionesDelMes({
  mes,
  lineas,
  cargos,
  minimoTransferencia,
  saldoHucha,
  hoy,
}: {
  mes: MesLiquidacion;
  lineas: LineaLiquidacion[];
  cargos: MovimientoDeCuenta[];
  minimoTransferencia: number;
  /** El de ahora, para avisar si al deshacer queda en negativo */
  saldoHucha: number;
  hoy: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const [trabajando, empezar] = useTransition();

  if (!mes.liquidacionId) {
    return (
      <>
        <button type="button" onClick={() => setAbierta(true)} className={BOTON_PRINCIPAL}>
          Ha llegado la de {soloElMes(mes.mes)}
        </button>
        {abierta && (
          <HaLlegado
            mes={mes}
            lineas={lineas}
            cargos={cargos.filter((c) => !c.aplicado)}
            minimoTransferencia={minimoTransferencia}
            hoy={hoy}
            alCerrar={() => setAbierta(false)}
          />
        )}
      </>
    );
  }

  const liquidacionId = mes.liquidacionId;
  const huchaDespues = Math.round((saldoHucha - mes.liquidacion.rc) * 100) / 100;

  if (!confirmando) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setConfirmando(true)} className={`${BOTON_SECUNDARIO} self-start`}>
          Deshacer esta liquidación
        </button>
        {aviso.ok && <p className="text-sm font-medium text-bien-texto">{aviso.ok}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-superficie-2 p-4 text-sm">
      <p className="text-texto">
        Sus herramientas vuelven a estar por cobrar y su reserva, {euros(mes.liquidacion.rc)}, sale de la hucha
        {huchaDespues < 0 ? `, que quedará en ${euros(huchaDespues)}` : ''}. Lo que pasó a otro mes al marcarla se queda allí.
      </p>
      {aviso.error && (
        <p role="alert" className={ERROR}>
          {aviso.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={trabajando}
          onClick={() =>
            empezar(async () => {
              const resultado = await deshacerLiquidacion(liquidacionId);
              setAviso(resultado);
              if (!resultado.error) setConfirmando(false);
            })
          }
          className={BOTON_PRINCIPAL.replace('bg-acento-fuerte', 'bg-critico')}
        >
          {trabajando ? 'Deshaciendo…' : 'Sí, deshacerla'}
        </button>
        <button type="button" onClick={() => setConfirmando(false)} className={BOTON_SECUNDARIO}>
          No
        </button>
      </div>
    </div>
  );
}
