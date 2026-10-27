import { irpfSobreTotal } from '@/lib/consultoria/reglas';
import type { MesLiquidacion } from '@/lib/consultoria/tipos';
import { euros, eurosConSigno } from '@/lib/consultoria/formato';
import { pct } from './formato';

/** Lo que se resta, con su menos delante; 0 sin signo */
export const menos = (importe: number) => (importe === 0 ? euros(0) : `−${euros(importe)}`);

/** Con su signo, salvo el 0 */
export const conSigno = (importe: number) => (importe === 0 ? euros(0) : eurosConSigno(importe));

export function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t border-borde pt-2 text-texto' : ''}`}>
      <dt className={`min-w-0 ${fuerte ? 'font-semibold' : 'text-tenue'}`}>{etiqueta}</dt>
      <dd className={`cifras shrink-0 text-right ${fuerte ? 'font-semibold' : 'font-medium text-texto'}`}>{valor}</dd>
    </div>
  );
}

/**
 * Un mes como el documento de OVB: comisión, RC, comisión neta, IRPF sobre la neta, cargos y
 * abonos, importe de la liquidación, saldo anterior de la cuenta e importe a pagar. En `compacto`
 * (el Resumen), solo comisión, RC, IRPF y lo que mueve la cuenta, si lo hay.
 *
 * El % del IRPF se dice solo si cuadra con el de Ajustes: un mes puede mezclar porcentajes.
 */
export default function DesgloseLiquidacion({
  mes,
  pctIrpf,
  compacto = false,
}: {
  mes: MesLiquidacion;
  /** El de Ajustes, para escribir «IRPF (15 % de la neta)» si es el que lleva el mes */
  pctIrpf?: number;
  compacto?: boolean;
}) {
  const { liquidacion } = mes;
  const pctCuadra = pctIrpf !== undefined && liquidacion.comisionNeta > 0 && irpfSobreTotal(liquidacion.comisionNeta, pctIrpf) === liquidacion.irpf;
  const etiquetaIrpf = pctCuadra ? `IRPF (${pct(pctIrpf)} de la neta)` : 'IRPF (sobre la neta)';

  if (compacto) {
    return (
      <dl className="flex flex-col gap-1.5 text-sm">
        <Fila etiqueta="Comisión" valor={euros(liquidacion.comision)} />
        <Fila etiqueta="RC (a la hucha)" valor={menos(liquidacion.rc)} />
        <Fila etiqueta={etiquetaIrpf} valor={menos(liquidacion.irpf)} />
        {liquidacion.cargos !== 0 && <Fila etiqueta="Cargos y abonos" valor={conSigno(liquidacion.cargos)} />}
        {mes.saldoAnterior !== 0 && <Fila etiqueta="Saldo anterior de la cuenta" valor={conSigno(mes.saldoAnterior)} />}
      </dl>
    );
  }

  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      <Fila etiqueta="Comisión" valor={euros(liquidacion.comision)} />
      <Fila etiqueta="RC (a la hucha)" valor={menos(liquidacion.rc)} />
      <Fila etiqueta="Comisión neta" valor={euros(liquidacion.comisionNeta)} />
      <Fila etiqueta={etiquetaIrpf} valor={menos(liquidacion.irpf)} />
      <Fila etiqueta="Cargos y abonos" valor={conSigno(liquidacion.cargos)} />
      <Fila etiqueta="Importe de la liquidación" valor={euros(liquidacion.importe)} fuerte />
      <Fila etiqueta="Saldo anterior de la cuenta" valor={conSigno(mes.saldoAnterior)} />
      <Fila etiqueta="Importe a pagar" valor={euros(mes.aPagar)} fuerte />
    </dl>
  );
}
