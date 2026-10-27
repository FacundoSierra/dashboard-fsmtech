import type { HuchaConsultoria, MovimientoDeHucha } from '@/lib/consultoria/tipos';
import { Estado } from '@/components/ui';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import AccionesHucha, { QuitarDeLaHucha } from './AccionesHucha';
import { conSigno } from './DesgloseLiquidacion';
import { TARJETA } from './estilos';

const NOMBRE_DEL_TIPO: Record<MovimientoDeHucha['tipo'], string> = {
  inicial: 'Saldo de partida',
  liquidacion: 'Reserva de una liquidación',
  extorno: 'Extorno',
  reclamacion: 'Reclamación',
  ajuste: 'Ajuste',
};

/**
 * La hucha (la reserva de cancelación): su saldo, lo que entrará con lo que aún no ha llegado y el
 * libro, del más nuevo al más antiguo, con el saldo tras cada movimiento. Si queda en negativo, en
 * rojo y con aviso: se avisa, no se impide.
 */
export default function PantallaHucha({ hucha, hoy, pctIrpf }: { hucha: HuchaConsultoria; hoy: string; pctIrpf: number }) {
  const negativa = hucha.saldo < 0;
  const inicial = hucha.movimientos.find((m) => m.tipo === 'inicial' && m.movimientoId) ?? null;
  const libro = [...hucha.movimientos].reverse();

  return (
    <div className="flex flex-col gap-5">
      <section className={TARJETA} aria-labelledby="hucha-titulo">
        <h2 id="hucha-titulo" className="text-base font-semibold tracking-tight text-texto">
          La hucha
        </h2>
        <p className="mt-0.5 text-sm text-apagado">La reserva de cancelación de cada liquidación cobrada, menos lo que sale de ella</p>
        <p className="cifras mt-5 text-3xl leading-none font-semibold text-texto md:text-4xl">{euros(hucha.saldo)}</p>
        {/* En negativo se avisa, no se impide: el estado crítico, con su icono y su texto */}
        {negativa && (
          <div className="mt-3 rounded-lg border border-critico/40 bg-critico/10 px-3 py-2.5 text-sm">
            <Estado nivel="critico">En negativo</Estado>
            <p className="mt-1 text-texto">
              Un extorno o una reclamación se ha llevado más de lo que había. Lo que entre con las próximas liquidaciones lo irá cubriendo.
            </p>
          </div>
        )}
        <p className="mt-3 text-sm text-tenue">
          Entrarán <span className="cifras font-semibold text-texto">{euros(hucha.porEntrar)}</span> con lo que aún falta por cobrar.
        </p>
        <AccionesHucha hoy={hoy} pctIrpf={pctIrpf} inicial={inicial} />
      </section>

      <section className={TARJETA} aria-labelledby="libro-titulo">
        <h2 id="libro-titulo" className="text-base font-semibold tracking-tight text-texto">
          Movimientos
        </h2>
        <p className="mt-0.5 text-sm text-apagado">Del más nuevo al más antiguo, con el saldo después de cada uno</p>
        {libro.length === 0 ? (
          <p className="mt-4 text-sm text-tenue">Aún no hay ningún movimiento.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1.5">
            {libro.map((m, i) => (
              <li
                key={m.movimientoId ?? m.extornoId ?? m.liquidacionId ?? `${m.fecha}-${i}`}
                className="flex items-start justify-between gap-3 rounded-lg bg-fondo/60 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-texto">
                    {NOMBRE_DEL_TIPO[m.tipo]}
                    {m.cliente && <span className="font-normal text-tenue"> · {m.cliente}</span>}
                  </span>
                  <span className="block text-sm text-tenue">
                    {fechaCorta(m.fecha)}
                    {m.irpf > 0 && ` · IRPF retenido ${euros(m.irpf)}`}
                  </span>
                  {m.notas && <span className="block text-sm break-words text-apagado">{m.notas}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`cifras text-sm font-semibold ${m.importe < 0 ? 'text-critico-texto' : 'text-bien-texto'}`}>{conSigno(m.importe)}</span>
                  <span className={`cifras text-xs ${m.saldo < 0 ? 'font-semibold text-critico-texto' : 'text-apagado'}`}>Saldo {euros(m.saldo)}</span>
                  {m.movimientoId && <QuitarDeLaHucha id={m.movimientoId} descripcion={`${NOMBRE_DEL_TIPO[m.tipo]} del ${fechaCorta(m.fecha)}`} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
