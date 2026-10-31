'use client';

import { useState, useTransition } from 'react';
import { guardarMovimientoHucha } from '@/lib/consultoria/acciones';
import { irpfDeReclamacion } from '@/lib/consultoria/reglas';
import type { MovimientoDeHucha, MovimientoDeHuchaAGuardar } from '@/lib/consultoria/tipos';
import { fechaONula } from '@/lib/consultoria/validar';
import { euros } from '@/lib/consultoria/formato';
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, BOTON_TEXTO, CAMPO, ERROR, ETIQUETA } from './estilos';
import { aCampo, conDosDecimales, leerNumero, pct } from './formato';
import Opciones from './Opciones';

export type TipoDeMovimiento = MovimientoDeHuchaAGuardar['tipo'];

export const TITULO_DEL_TIPO: Record<TipoDeMovimiento, string> = {
  reclamacion: 'Reclamar a la hucha',
  ajuste: 'Ajuste de la hucha',
  inicial: 'Saldo de partida',
};

/**
 * Lo que se mueve en la hucha a mano: reclamar (con el IRPF propuesto, un supuesto que se puede
 * cambiar), un ajuste que entra o sale, o el saldo de partida. El importe se teclea en positivo:
 * el signo lo pone el tipo.
 */
export default function FormularioMovimientoHucha({
  tipo,
  hoy,
  pctIrpf,
  existente,
  alTerminar,
}: {
  tipo: TipoDeMovimiento;
  hoy: string;
  /** El de Ajustes, para proponer el IRPF de una reclamación */
  pctIrpf: number;
  /** Para cambiar el saldo de partida que ya está */
  existente?: MovimientoDeHucha | null;
  alTerminar: () => void;
}) {
  const [fecha, setFecha] = useState(existente?.fecha ?? hoy);
  const [importe, setImporte] = useState(existente ? aCampo(Math.abs(existente.importe)) : '');
  const [sentido, setSentido] = useState<'entra' | 'sale'>('entra');
  const [irpf, setIrpf] = useState<string | null>(null);
  const [notas, setNotas] = useState(existente?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const cantidad = leerNumero(importe);
  const valida = cantidad !== null && cantidad > 0 ? cantidad : null;
  const irpfPropuesto = valida !== null ? irpfDeReclamacion(valida, pctIrpf) : 0;
  const numIrpf = irpf !== null ? leerNumero(irpf) : irpfPropuesto;
  const neto = valida !== null && numIrpf !== null ? Math.round((valida - numIrpf) * 100) / 100 : null;

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const dia = fechaONula(fecha);
    if (!dia) return setError('Pon la fecha.');
    if (valida === null || !conDosDecimales(valida)) return setError('El importe, mayor que cero y con dos decimales como mucho.');
    if (tipo === 'reclamacion' && (numIrpf === null || numIrpf < 0 || numIrpf > valida || !conDosDecimales(numIrpf)))
      return setError('El IRPF de la reclamación va de 0 a lo reclamado.');
    setError(null);
    empezar(async () => {
      const resultado = await guardarMovimientoHucha({
        id: existente?.movimientoId ?? undefined,
        tipo,
        fecha: dia,
        importe: valida,
        ...(tipo === 'ajuste' ? { sentido } : {}),
        ...(tipo === 'reclamacion' ? { irpf: numIrpf } : {}),
        notas: notas.trim() || null,
      });
      if (resultado.error) setError(resultado.error);
      else alTerminar();
    });
  }

  return (
    <form onSubmit={guardar} className="mt-4 flex flex-col gap-3 rounded-lg bg-superficie-2 p-4">
      <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-texto">{existente ? 'Cambiar el saldo de partida' : TITULO_DEL_TIPO[tipo]}</h3>
      {tipo === 'ajuste' && (
        <fieldset>
          <legend className={ETIQUETA}>El ajuste</legend>
          <Opciones
            nombre="sentido-del-ajuste"
            valor={sentido}
            alCambiar={setSentido}
            opciones={[
              { valor: 'entra', etiqueta: 'Entra en la hucha' },
              { valor: 'sale', etiqueta: 'Sale de la hucha' },
            ]}
          />
        </fieldset>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={ETIQUETA}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CAMPO} mt-1`} />
        </label>
        <label className={ETIQUETA}>
          {tipo === 'reclamacion' ? 'Lo que reclamas' : 'Importe'}
          <span className="relative mt-1 block">
            <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" autoComplete="off" className={`${CAMPO} pr-8`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
          </span>
        </label>
      </div>

      {tipo === 'reclamacion' && (
        <div className="rounded-lg bg-superficie-2 p-4 text-sm">
          <label className={`${ETIQUETA} block sm:max-w-xs`}>
            IRPF retenido <span className="font-normal text-apagado">(supuesto: el {pct(pctIrpf)} de Ajustes)</span>
            <span className="relative mt-1 block">
              <input value={irpf ?? aCampo(irpfPropuesto)} onChange={(e) => setIrpf(e.target.value)} inputMode="decimal" autoComplete="off" className={`${CAMPO} pr-8`} />
              <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-apagado">€</span>
            </span>
          </label>
          {irpf !== null && (
            <button type="button" onClick={() => setIrpf(null)} className={`${BOTON_TEXTO} text-sm`}>
              Volver a lo propuesto ({euros(irpfPropuesto)})
            </button>
          )}
          {neto !== null && (
            <p className="mt-2 text-tenue">
              Te llegarán unos <span className="cifras font-semibold text-texto">{euros(neto)}</span>.
            </p>
          )}
        </div>
      )}

      <label className={ETIQUETA}>
        Notas <span className="font-normal text-apagado">· opcional</span>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className={`${CAMPO} mt-1`} />
      </label>

      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className={BOTON_PRINCIPAL}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
