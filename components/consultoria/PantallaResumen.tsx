import Link from 'next/link';
import BarrasMensuales from '@/components/consultoria/BarrasMensuales';
import Bloque from '@/components/consultoria/Bloque';
import { CUADRO_VIGENTE } from '@/lib/consultoria/cuadro';
import { primerDiaDelMes, textoDelRecuento } from '@/lib/consultoria/reglas';
import type { MesLiquidacion, ResumenConsultoria } from '@/lib/consultoria/tipos';
import { nombreDelDia } from '@/lib/consultoria/calendario';
import { diaYMes, euros, fechaCorta, mesCorto } from '@/lib/consultoria/formato';
import { IconoEstado } from '@/components/ui';
import Aviso from './Aviso';
import DesgloseLiquidacion, { conSigno } from './DesgloseLiquidacion';
import { NOMBRE_CALENDARIO, enlaceAlMes, euroPorUnidad, mesConMayuscula, soloElMes, unidades } from './formato';

const ENLACE = 'inline-flex min-h-11 items-center text-sm font-medium text-acento underline-offset-4 hover:underline';

/**
 * El Resumen de la consultoría: lo que se cobra este mes y el siguiente (como importe a pagar,
 * con la cuenta de comisiones ya dentro), la hucha, el nivel, los próximos cierres y las barras de
 * lo pagado y lo previsto. Los datos se los da la página.
 */
export default function PantallaResumen({ resumen, hoy, pctIrpf }: { resumen: ResumenConsultoria; hoy: string; pctIrpf: number }) {
  const mesActual = primerDiaDelMes(hoy);
  const { barras } = resumen;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <TarjetaMes
          titulo="Este mes"
          mes={resumen.esteMes}
          pctIrpf={pctIrpf}
          vacio={`En ${soloElMes(mesActual)} no se cobra nada.`}
          periodo={mesConMayuscula(mesActual)}
        />
        <TarjetaMes
          titulo="Siguiente cobro"
          mes={resumen.siguiente}
          pctIrpf={pctIrpf}
          vacio={`No hay nada previsto después de ${soloElMes(mesActual)}.`}
          periodo={resumen.siguiente ? mesConMayuscula(resumen.siguiente.mes) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <BloqueHucha resumen={resumen} />
        <BloqueNivel nivel={resumen.nivel} />
        <BloqueCierres resumen={resumen} />
      </div>

      {barras.length > 0 && (
        <Bloque titulo="Lo cobrado y lo previsto" periodo={`${mesCorto(barras[0].mes)} – ${mesCorto(barras[barras.length - 1].mes)}`}>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-tenue">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 rounded-sm bg-serie" />
              Pagado
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 rounded-sm bg-serie/35" />
              Previsto: lo que aún no ha llegado
            </span>
          </p>
          <BarrasMensuales serie={barras} etiqueta="Pagado" color="var(--serie)" />
        </Bloque>
      )}
    </div>
  );
}

function TarjetaMes({
  titulo,
  mes,
  periodo,
  vacio,
  pctIrpf,
}: {
  titulo: string;
  mes: MesLiquidacion | null;
  periodo?: string;
  vacio: string;
  pctIrpf: number;
}) {
  if (!mes) {
    return (
      <Bloque titulo={titulo} periodo={periodo}>
        <p className="mt-4 text-sm text-tenue">{vacio}</p>
      </Bloque>
    );
  }

  const llegado = mes.liquidacionId !== null;
  const importe = llegado ? (mes.importeRecibido ?? mes.aPagar) : mes.aPagar;

  return (
    <Bloque titulo={titulo} periodo={periodo}>
      <p className="mt-4 text-sm text-apagado">{llegado ? 'Importe pagado' : 'Importe a pagar previsto'}</p>
      <p className="cifras mt-1 text-3xl leading-none font-semibold text-texto md:text-4xl">{euros(importe)}</p>
      <p className="mt-2 text-sm text-tenue">
        {/* «5 herramientas y 1 APEX · 2 previstas»: una APEX va con su herramienta */}
        {textoDelRecuento(mes)}
        {llegado && mes.fecha && ` · pagado el ${fechaCorta(mes.fecha)}`}
      </p>
      {mes.aPagar === 0 && (
        <Aviso caja className="mt-3">
          Sin transferencia: no llega a {euros(CUADRO_VIGENTE.minimoTransferencia)}.{' '}
          {mes.saldoDespues !== 0 && `Pasan ${conSigno(mes.saldoDespues)} a la siguiente liquidación.`}
        </Aviso>
      )}
      {llegado && mes.importeRecibido !== null && mes.importeRecibido !== mes.aPagar && (
        <Aviso className="mt-3">
          OVB calculaba {euros(mes.aPagar)}: hay {conSigno(Math.round((mes.importeRecibido - mes.aPagar) * 100) / 100)} de diferencia.
        </Aviso>
      )}
      <div className="mt-4 rounded-lg bg-fondo/70 p-4">
        <DesgloseLiquidacion mes={mes} pctIrpf={pctIrpf} compacto />
      </div>
      <Link href={enlaceAlMes(mes.mes)} className={`${ENLACE} mt-2`}>
        Ver la liquidación de {soloElMes(mes.mes)}
      </Link>
    </Bloque>
  );
}

function BloqueHucha({ resumen }: { resumen: ResumenConsultoria }) {
  const { hucha, cuenta } = resumen;
  const negativa = hucha.saldo < 0;
  return (
    <Bloque titulo="Hucha" periodo="La reserva de cancelación">
      <p className="cifras mt-4 text-3xl leading-none font-semibold text-texto">{euros(hucha.saldo)}</p>
      {/* En negativo, el estado crítico con su icono y su texto; la cifra, en tinta normal */}
      {negativa && (
        <p className="mt-2 flex items-start gap-2 text-sm text-texto">
          <IconoEstado nivel="critico" className="mt-0.5 size-4" />
          <span>En negativo: un extorno se ha llevado más de lo que había.</span>
        </p>
      )}
      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-tenue">Retenido este año</dt>
          <dd className="cifras font-semibold text-texto">{euros(hucha.retenidaEsteAnio)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-tenue">Entrará con lo que falta por cobrar</dt>
          <dd className="cifras font-semibold text-texto">{euros(hucha.porEntrar)}</dd>
        </div>
        {cuenta.saldo !== 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-tenue">Saldo de la cuenta de comisiones</dt>
            <dd className="cifras font-semibold text-texto">{conSigno(cuenta.saldo)}</dd>
          </div>
        )}
        {cuenta.cargosSinAplicar !== 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-tenue">Cargos y abonos sin aplicar</dt>
            <dd className="cifras font-semibold text-texto">{conSigno(cuenta.cargosSinAplicar)}</dd>
          </div>
        )}
      </dl>
      <Link href="/consultoria/hucha" className={`${ENLACE} mt-2`}>
        Ver la hucha
      </Link>
    </Bloque>
  );
}

function BloqueNivel({ nivel }: { nivel: ResumenConsultoria['nivel'] }) {
  return (
    <Bloque titulo="Nivel" periodo="Unidades hasta este mes, sin las previstas">
      <p className="cifras mt-4 text-3xl leading-none font-semibold text-texto">{unidades(nivel.unidades)}</p>
      {nivel.nombre ? (
        <p className="mt-2 text-sm font-semibold text-texto">
          {nivel.nombre} · {euroPorUnidad(nivel.valorUnidad)}
        </p>
      ) : (
        <Aviso className="mt-2">No hay ningún nivel que aplicar: revisa los niveles en Ajustes.</Aviso>
      )}
      <div className="mt-3 flex flex-col gap-1.5 text-sm text-tenue">
        {nivel.cambiaEl && (
          <p>
            Desde la producción de {soloElMes(nivel.cambiaEl.mes)}. Este mes aún va a {euroPorUnidad(nivel.esteMes.valorUnidad)} (
            {nivel.esteMes.nombre}).
          </p>
        )}
        {nivel.unidadesPrevistas > 0 && <p>Y {unidades(nivel.unidadesPrevistas)} en herramientas previstas.</p>}
        {nivel.siguiente &&
          (nivel.siguiente.faltan === null ? (
            <p>
              El siguiente, {nivel.siguiente.nombre} ({euroPorUnidad(nivel.siguiente.valorUnidad)}), requiere equipo.
            </p>
          ) : (
            <p>
              Faltan {unidades(nivel.siguiente.faltan)} para {nivel.siguiente.nombre} ({euroPorUnidad(nivel.siguiente.valorUnidad)}).
            </p>
          ))}
        {nivel.avisos.map((aviso) => (
          <Aviso key={aviso.codigo + aviso.texto}>{aviso.texto}</Aviso>
        ))}
      </div>
    </Bloque>
  );
}

function BloqueCierres({ resumen }: { resumen: ResumenConsultoria }) {
  const { proximosCierres, faltanCierresDe } = resumen;
  return (
    <Bloque titulo="Próximos cierres" periodo="Hasta las 23:59 del día">
      {proximosCierres.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {proximosCierres.map((cierre) => (
            <li key={`${cierre.calendario}-${cierre.mes}`} className="rounded-lg bg-fondo/70 px-4 py-3">
              <p className="text-sm font-medium text-texto">
                {NOMBRE_CALENDARIO[cierre.calendario]} cierra el {nombreDelDia(cierre.confirmarHasta)}
              </p>
              {cierre.incidenciasHasta && (
                <p className="text-sm text-tenue">Incidencias hasta el {diaYMes(cierre.incidenciasHasta)}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-tenue">No hay cierres cargados por delante.</p>
      )}
      {faltanCierresDe !== null && (
        <Aviso caja className="mt-3">
          Faltan los cierres de {faltanCierresDe}: cárgalos con <code>npm run consultoria:cierres</code>. Sin ellos, las fechas
          se calculan como si todo entrara a tiempo.
        </Aviso>
      )}
    </Bloque>
  );
}
