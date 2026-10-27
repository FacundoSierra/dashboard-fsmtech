import type { Cierre, ProductoDelCuadro, ReglaDeExtorno, ReglaDeUnidades } from '@/lib/consultoria/reglas';
import type { AjustesConsultoria } from '@/lib/consultoria/tipos';
import { nombreDelMes } from '@/lib/consultoria/calendario';
import { euros } from '@/lib/consultoria/formato';
import Aviso from './Aviso';
import { NOMBRE_CALENDARIO, NOMBRE_TIPO_COMISION, pct } from './formato';

const numero = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n);

function textoDeUnidades(regla: ReglaDeUnidades | null): string {
  if (!regla) return 'A mano';
  const base = regla.base === 'prima_anual' ? 'de prima anual' : regla.base === 'primas_programadas' ? 'de primas programadas' : 'aportados';
  if (regla.porDuracion?.length) {
    const tramos = regla.porDuracion
      .map((t) => `${numero(t.factor)} ${t.desde && t.hasta ? `de ${t.desde} a ${t.hasta} años` : t.hasta ? `hasta ${t.hasta} años` : `desde ${t.desde} años`}`)
      .join(', ');
    return `Por cada ${euros(regla.porCada).replace(',00', '')} ${base}: ${tramos}`;
  }
  const anios = regla.aniosFijos ? `, a ${regla.aniosFijos} años` : regla.aniosMaximos ? `, como mucho ${regla.aniosMaximos} años` : '';
  return `${numero(regla.factor ?? 1)} u por cada ${euros(regla.porCada).replace(',00', '')} ${base}${anios}`;
}

function textoDeCobro(p: ProductoDelCuadro): string {
  const efecto = p.efecto === 'fecha' ? 'Efecto el día de la aportación; ' : '';
  if (!p.cobro) return `${efecto}el de su compañía`;
  if ('dia15' in p.cobro) return `${efecto}efecto el 15 o antes, ese mes; si no, el siguiente`;
  const n = p.cobro.meses;
  return `${efecto}${n === 0 ? 'el mes del efecto' : `${n} ${n === 1 ? 'mes' : 'meses'} después del efecto`}`;
}

function textoDeExtorno(e: ReglaDeExtorno | null): string {
  if (!e) return 'El de siempre: el 100 % durante 48 meses';
  if (e.meses === 0) return 'Sin extorno';
  if (e.lineal) return `Lineal durante ${e.meses} meses`;
  const tramos = (e.tramos ?? [])
    .map((t) => `${t.desde === t.hasta ? `mes ${t.desde}` : `meses ${t.desde} a ${t.hasta}`} ${t.bajaPorMes ? `del ${pct(t.pct)}, bajando ${numero(t.bajaPorMes)} al mes` : pct(t.pct)}`)
    .join('; ');
  return `${e.meses} meses: ${tramos}`;
}

/**
 * El cuadro de comisiones de OVB en vigor, de solo lectura (está en el código, `cuadro.ts`): cada
 * producto con su tipo, su RC, sus unidades, su cobro y su extorno, y lo provisional marcado. Y los
 * cierres cargados, por mes.
 */
export default function CuadroVigente({ cuadro, cierres }: { cuadro: AjustesConsultoria['cuadro']; cierres: Cierre[] }) {
  const porMes = new Map<string, Cierre[]>();
  for (const cierre of cierres) porMes.set(cierre.mes, [...(porMes.get(cierre.mes) ?? []), cierre]);

  return (
    <>
      <p className="mt-3 text-sm text-tenue">
        Versión <span className="font-semibold text-texto">{cuadro.version}</span>. Sin transferencia por debajo de{' '}
        {euros(cuadro.minimoTransferencia)}. Reserva del {pct(cuadro.reserva.pct)}, del {pct(cuadro.reserva.propio)} en un contrato propio
        {cuadro.reserva.tramos.map((t) => `, del ${pct(t.pct)} con más de ${numero(t.masDeUnidades)} u`).join('')}.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {cuadro.productos.map((p) => (
          <li key={`${p.compania}-${p.periodicidad}-${p.nombres[0]}`} className="min-w-0 rounded-lg bg-fondo/60 px-4 py-3 text-sm">
            <p className="text-sm font-medium text-texto">
              {p.compania} · {p.nombres.join(', ')}
            </p>
            <p className="text-tenue">
              {p.periodicidad === 'mensual' ? 'Aportación mensual' : 'Aportación única'} · {NOMBRE_TIPO_COMISION[p.tipo]} · {p.reserva ? 'con RC' : 'sin RC'}
            </p>
            <dl className="mt-2 flex flex-col gap-1">
              <div>
                <dt className="inline text-apagado">Unidades: </dt>
                <dd className="inline text-texto">{textoDeUnidades(p.unidades)}</dd>
              </div>
              <div>
                <dt className="inline text-apagado">Cobro: </dt>
                <dd className="inline text-texto">{textoDeCobro(p)}</dd>
              </div>
              <div>
                <dt className="inline text-apagado">Extorno: </dt>
                <dd className="inline text-texto">{textoDeExtorno(p.extorno)}</dd>
              </div>
            </dl>
            {p.provisional && <Aviso className="mt-2">Provisional: {p.provisional}.</Aviso>}
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-base font-semibold tracking-tight text-texto">Cierres cargados</h3>
      {porMes.size === 0 ? (
        <p className="mt-2 text-sm text-tenue">
          No hay ninguno: cárgalos con <code>npm run consultoria:cierres</code>.
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {[...porMes.entries()].map(([mes, delMes]) => (
            <li key={mes} className="rounded-lg bg-fondo/60 px-3 py-2 text-sm">
              <span className="font-medium text-texto first-letter:uppercase">{nombreDelMes(mes)}</span>
              <span className="block text-tenue">
                {delMes.map((c) => `${NOMBRE_CALENDARIO[c.calendario]} el ${Number(c.confirmarHasta.slice(8))}`).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
