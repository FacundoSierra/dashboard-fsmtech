'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import BotonBorrar from '@/components/consultoria/BotonBorrar';
import { borrarCargo } from '@/lib/consultoria/acciones';
import type { MovimientoDeCuenta } from '@/lib/consultoria/tipos';
import { fechaCorta } from '@/lib/consultoria/formato';
import { conSigno } from './DesgloseLiquidacion';
import { BOTON_SECUNDARIO, TARJETA } from './estilos';
import { soloElMes } from './formato';

const FormularioCargo = dynamic(() => import('./FormularioCargo'), {
  loading: () => <p className="mt-4 text-sm text-apagado">Un momento…</p>,
});

/**
 * La cuenta de comisiones de OVB: lo que no es comisión (cursos, participaciones en gastos, restos de
 * extornos), su saldo y «Añadir cargo o abono». Los apuntados a mano que aún no se han aplicado se
 * pueden quitar. Filas de una columna, también en el móvil.
 */
export default function CuentaDeComisiones({
  movimientos,
  saldo,
  cargosSinAplicar,
  hoy,
}: {
  movimientos: MovimientoDeCuenta[];
  saldo: number;
  cargosSinAplicar: number;
  hoy: string;
}) {
  const [anadiendo, setAnadiendo] = useState(false);
  const recientes = [...movimientos].reverse();

  return (
    <section className={TARJETA} aria-labelledby="cuenta-de-comisiones">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="cuenta-de-comisiones" className="text-base font-semibold tracking-tight text-texto">
            Cuenta de comisiones
          </h2>
          <p className="mt-0.5 text-sm text-apagado">Cargos y abonos que no son comisión. No pagan IRPF.</p>
        </div>
        {!anadiendo && (
          <button type="button" onClick={() => setAnadiendo(true)} className={BOTON_SECUNDARIO}>
            Añadir cargo o abono
          </button>
        )}
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-fondo/70 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-apagado">Saldo que pasa a la siguiente liquidación</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{conSigno(saldo)}</dd>
        </div>
        <div>
          <dt className="text-apagado">Sin aplicar todavía</dt>
          <dd className="cifras mt-0.5 text-lg font-semibold text-texto">{conSigno(cargosSinAplicar)}</dd>
        </div>
      </dl>

      {anadiendo && <FormularioCargo hoy={hoy} alTerminar={() => setAnadiendo(false)} />}

      {recientes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {recientes.map((m) => (
            <li key={m.cargoId ?? m.extornoId ?? `${m.fecha}-${m.concepto}`} className="flex items-start justify-between gap-3 rounded-lg bg-fondo/60 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-texto">{m.concepto}</span>
                <span className="block text-sm text-tenue">
                  {fechaCorta(m.fecha)}
                  {m.cliente && ` · ${m.cliente}`}
                  {' · '}
                  {m.aplicado && m.mes
                    ? `aplicado en la liquidación de ${soloElMes(m.mes)}`
                    : m.mesPrevisto
                      ? `previsto para ${soloElMes(m.mesPrevisto)}`
                      : 'sin aplicar: entra en la siguiente que llegue'}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className={`cifras text-sm font-semibold ${m.importe < 0 ? 'text-critico-texto' : 'text-bien-texto'}`}>{conSigno(m.importe)}</span>
                {m.cargoId && !m.aplicado && (
                  <BotonBorrar descripcion={m.concepto} etiqueta="Quitar" enCurso="Quitando…" className="min-h-11" onBorrar={() => borrarCargo(m.cargoId ?? '')} />
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-tenue">Aún no hay ningún cargo ni abono.</p>
      )}
    </section>
  );
}
