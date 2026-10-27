import Link from 'next/link';
import { textoDelRecuento } from '@/lib/consultoria/reglas';
import type { CuentaConsultoria, DetalleDelMes, LiquidacionesDelAnio, MesLiquidacion } from '@/lib/consultoria/tipos';
import { Estado } from '@/components/ui';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import Aviso from './Aviso';
import CuentaDeComisiones from './CuentaDeComisiones';
import DesgloseLiquidacion, { conSigno } from './DesgloseLiquidacion';
import DetalleLiquidacion from './DetalleLiquidacion';
import { TARJETA } from './estilos';
import { enlaceAlMes, mesConMayuscula, soloElMes } from './formato';

/**
 * Las liquidaciones de un año, cada mes como el documento de OVB, con los totales arriba y la
 * cuenta de comisiones debajo. El mes de `?mes=` se abre con sus líneas y sus cargos, y con «Ha
 * llegado» o «Deshacer».
 */
export default function PantallaLiquidaciones({
  datos,
  anio,
  abierto,
  detalle,
  cuenta,
  pctIrpf,
  minimoTransferencia,
  saldoHucha,
  hoy,
}: {
  datos: LiquidacionesDelAnio;
  anio: number;
  /** El día 1 del mes abierto */
  abierto: string | null;
  detalle: DetalleDelMes | null;
  cuenta: CuentaConsultoria;
  pctIrpf: number;
  minimoTransferencia: number;
  saldoHucha: number;
  hoy: string;
}) {
  const { meses, anio: totales, anios } = datos;
  const abiertoFueraDelAnio = abierto && detalle?.mes && !meses.some((m) => m.mes === abierto) ? detalle.mes : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <nav aria-label="Años" className="flex flex-wrap gap-2">
          {(anios.length ? anios : [anio]).map((a) => (
            <Link
              key={a}
              href={`/consultoria/liquidaciones?anio=${a}`}
              aria-current={a === anio ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-acento ${
                a === anio ? 'border-acento bg-acento-suave font-medium text-acento' : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
              }`}
            >
              {a}
            </Link>
          ))}
        </nav>
        <Link href="/consultoria/hucha" className="inline-flex min-h-11 items-center text-sm font-medium text-acento underline-offset-4 hover:underline">
          Ver la hucha
        </Link>
      </div>

      <section className={TARJETA} aria-labelledby="totales-del-anio">
        <h2 id="totales-del-anio" className="text-base font-semibold tracking-tight text-texto">
          {anio}
        </h2>
        <p className="mt-0.5 text-sm text-apagado">Lo que ha llegado este año, lo que falta y lo sacado de la hucha</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Total etiqueta="Comisión" valor={euros(totales.comision)} />
          <Total etiqueta="RC (a la hucha)" valor={euros(totales.rc)} />
          <Total etiqueta="IRPF" valor={euros(totales.irpf)} />
          <Total etiqueta="Cargos y abonos" valor={conSigno(totales.cargos)} />
          <Total etiqueta="Pagado" valor={euros(totales.pagado)} fuerte />
          <Total etiqueta="Previsto" valor={euros(totales.previsto)} fuerte />
          <Total etiqueta="Reclamado de la hucha" valor={euros(totales.huchaReclamada.importe)} />
          {totales.huchaReclamada.importe > 0 && <Total etiqueta="IRPF de lo reclamado" valor={euros(totales.huchaReclamada.irpf)} />}
          {totales.irpfDeExtornos !== 0 && <Total etiqueta="IRPF de extornos (supuesto)" valor={euros(totales.irpfDeExtornos)} />}
        </dl>
      </section>

      {abiertoFueraDelAnio && detalle && (
        <TarjetaDelMes
          mes={abiertoFueraDelAnio}
          abierto
          detalle={detalle}
          pctIrpf={pctIrpf}
          minimoTransferencia={minimoTransferencia}
          saldoHucha={saldoHucha}
          hoy={hoy}
        />
      )}

      {meses.length === 0 ? (
        <section className={TARJETA}>
          <p className="text-sm text-tenue">En {anio} no hay nada cobrado ni previsto.</p>
        </section>
      ) : (
        meses.map((mes) => (
          <TarjetaDelMes
            key={mes.mes}
            mes={mes}
            abierto={mes.mes === abierto}
            detalle={mes.mes === abierto ? detalle : null}
            pctIrpf={pctIrpf}
            minimoTransferencia={minimoTransferencia}
            saldoHucha={saldoHucha}
            hoy={hoy}
          />
        ))
      )}

      <CuentaDeComisiones movimientos={cuenta.movimientos} saldo={cuenta.saldo} cargosSinAplicar={cuenta.cargosSinAplicar} hoy={hoy} />
    </div>
  );
}

function Total({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-apagado">{etiqueta}</dt>
      <dd className={`cifras mt-0.5 text-texto ${fuerte ? 'text-xl font-semibold' : 'text-lg font-medium'}`}>{valor}</dd>
    </div>
  );
}

function TarjetaDelMes({
  mes,
  abierto,
  detalle,
  pctIrpf,
  minimoTransferencia,
  saldoHucha,
  hoy,
}: {
  mes: MesLiquidacion;
  abierto: boolean;
  detalle: DetalleDelMes | null;
  pctIrpf: number;
  minimoTransferencia: number;
  saldoHucha: number;
  hoy: string;
}) {
  const llegado = mes.liquidacionId !== null;
  const clave = mes.mes.slice(0, 7);
  const diferencia = mes.importeRecibido !== null ? Math.round((mes.importeRecibido - mes.aPagar) * 100) / 100 : 0;

  return (
    // La cabecera del panel es fija: el ancla deja sitio para que no tape el título del mes
    <article id={`mes-${clave}`} className={`${TARJETA} scroll-mt-20`} aria-labelledby={`titulo-${clave}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`titulo-${clave}`} className="text-base font-semibold tracking-tight text-texto">
            {mesConMayuscula(mes.mes)}
          </h3>
          <p className="mt-0.5 text-sm text-apagado">
            {llegado
              ? [mes.numero ? `N.º ${mes.numero}` : null, mes.fecha ? `del ${fechaCorta(mes.fecha)}` : null].filter(Boolean).join(' ') || 'Ha llegado'
              : 'Aún no ha llegado'}
            {' · '}
            {textoDelRecuento(mes)}
          </p>
        </div>
        <span className="shrink-0">
          <Estado nivel={llegado ? 'bien' : 'neutro'}>{llegado ? 'Ha llegado' : 'Por llegar'}</Estado>
        </span>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-lg bg-fondo/70 p-4">
          <DesgloseLiquidacion mes={mes} pctIrpf={pctIrpf} />
        </div>
        <div className="flex flex-col gap-2 text-sm">
          {mes.aPagar === 0 && (
            <Aviso caja>
              Sin transferencia: no llega a {euros(minimoTransferencia)}.
              {mes.saldoDespues !== 0 && ` Pasan ${conSigno(mes.saldoDespues)} a la siguiente.`}
            </Aviso>
          )}
          {llegado && mes.importeRecibido !== null && (
            <p className="text-tenue">
              Recibido en el banco: <span className="cifras font-semibold text-texto">{euros(mes.importeRecibido)}</span>
              {diferencia !== 0 && (
                <Aviso como="span" className="mt-1">
                  No cuadra con el importe a pagar: {conSigno(diferencia)} de diferencia.
                </Aviso>
              )}
            </p>
          )}
          {mes.pendiente && (
            <p className="text-tenue">
              Se quedó en este mes sin cobrar: <span className="cifras font-semibold text-texto">{euros(mes.pendiente.importe)}</span> (no cuenta en lo
              pagado).
            </p>
          )}
          {!llegado && mes.previstas > 0 && (
            <p className="text-tenue">
              De lo previsto sin firmar, unos <span className="cifras font-semibold text-texto">{euros(mes.netoPrevisto)}</span> netos (aprox.).
            </p>
          )}
          <Link
            href={abierto ? `/consultoria/liquidaciones?anio=${mes.mes.slice(0, 4)}#mes-${clave}` : enlaceAlMes(mes.mes)}
            className="inline-flex min-h-11 items-center self-start text-sm font-medium text-acento underline-offset-4 hover:underline"
          >
            {abierto ? 'Cerrar el detalle' : `Ver las líneas de ${soloElMes(mes.mes)}`}
          </Link>
        </div>
      </div>

      {abierto && detalle && (
        <DetalleLiquidacion mes={mes} detalle={detalle} minimoTransferencia={minimoTransferencia} saldoHucha={saldoHucha} hoy={hoy} />
      )}
    </article>
  );
}
