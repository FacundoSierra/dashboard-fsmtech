import Link from 'next/link';
import { Estado, IconoEstado } from '@/components/ui';
import { NOMBRE_DE_CADA_MESES, cobroDeLaCuota, nombreDelPeriodo } from '@/lib/consultoria/reglas';
import type { CuotaVista, HerramientaConAportaciones, SerieVista } from '@/lib/consultoria/tipos';
import { euros, fechaCorta } from '@/lib/consultoria/formato';
import { nombreDelMes } from '@/lib/consultoria/calendario';
import Aviso from './Aviso';
import EstadoHerramienta from './EstadoHerramienta';
import { BOTON_TEXTO } from './estilos';
import { enlaceAlMes, pct, periodoSinAnio, soloElMes, unidades } from './formato';
import ProgramarCuotas from './ProgramarCuotas';

/**
 * La sección «Cuotas» de la página de una serie (REQ-002, spec 7): lo que cobra cada cuota y una fila
 * por cuota, de la primera a las que se cobran hasta doce meses después de hoy. Las guardadas llevan a
 * su página, y las cobradas, además, a su liquidación; las que aún no están guardadas van con el borde
 * discontinuo de las previstas. Debajo, los avisos de la serie y «Programar las que faltan»
 */
export default function CuotasDeLaSerie({ herramienta: h, serie }: { herramienta: HerramientaConAportaciones; serie: SerieVista }) {
  const anulada = h.estado === 'anulada';
  const { periodo } = NOMBRE_DE_CADA_MESES[serie.cadaMeses];
  const primera = serie.cuotas[0];
  // Las que se cobrarían en un mes ya liquidado: no se programan solas
  const noSeProgramaran = new Set(serie.sinProgramar.map((c) => c.periodo));

  return (
    <section className="mt-5" aria-labelledby="sus-cuotas">
      <h3 id="sus-cuotas" className="text-sm font-semibold text-texto">
        Cuotas
      </h3>
      <p className="mt-1 text-sm text-tenue">
        Cobra cada {periodo}: <span className="cifras">{unidades(serie.unidadesCuota)}</span> (
        <span className="cifras">{euros(serie.brutoCuota)}</span>) por cuota,{' '}
        {serie.pctHucha === 0 ? 'sin hucha' : `con el ${pct(serie.pctHucha)} a la hucha`}.
        {primera?.esLaFirma && ` La primera, la de ${periodoSinAnio(primera.periodo, serie.cadaMeses)}, es esta firma.`}
      </p>

      {anulada && h.anuladaEl && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-superficie-2 px-3 py-2.5 text-sm text-texto">
          <IconoEstado nivel="grave" className="mt-0.5 size-4" />
          <span>Anulada el {fechaCorta(h.anuladaEl)}: no se programan más cuotas.</span>
        </p>
      )}

      {serie.cuotas.length > 0 && (
        <ul aria-label={`Cuotas de ${h.producto}`} className="mt-3 flex flex-col gap-1.5">
          {serie.cuotas.map((cuota) => (
            <FilaDeCuota key={cuota.periodo} cuota={cuota} serie={serie} noSeProgramara={noSeProgramaran.has(cuota.periodo)} />
          ))}
        </ul>
      )}

      {serie.avisos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {serie.avisos.map((aviso) => (
            <Aviso key={aviso.codigo + aviso.texto} como="li" caja>
              {aviso.texto}
            </Aviso>
          ))}
        </ul>
      )}

      {!anulada && <ProgramarCuotas herramientaId={h.id} faltan={serie.faltanPorProgramar} />}
    </section>
  );
}

function FilaDeCuota({ cuota, serie, noSeProgramara }: { cuota: CuotaVista; serie: SerieVista; noSeProgramara: boolean }) {
  const guardada = cuota.estado !== 'sin_programar';
  const cobrada = cuota.liquidacionId !== null;
  // «No ha entrado» la movió: el mes de la regla y el de ahora
  const retrasada = cuota.retrasada && !cobrada && cuota.estado !== 'anulada';
  // Lo que aún no es seguro (sin guardar o prevista), blanco y con el borde discontinuo, como `PREVISTA`
  const prevista = !guardada || cuota.estado === 'prevista';

  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${cuota.estado === 'anulada' ? 'text-apagado line-through' : 'text-texto'}`}>
          {nombreDelPeriodo(cuota.periodo, serie.cadaMeses)}
        </span>
        <span className="block text-sm text-apagado">
          {cobrada ? 'Cobrada en' : 'Cobro en'} {nombreDelMes(cuota.fechaCobro)} · <span className="cifras">{euros(cuota.bruto)}</span>
          {cuota.esLaFirma && ' · esta firma'}
        </span>
        {retrasada && (
          <Aviso como="span" className="mt-1">
            No entró en {soloElMes(cobroDeLaCuota(cuota.periodo, serie.cadaMeses))}: se espera en {soloElMes(cuota.fechaCobro)}.
          </Aviso>
        )}
      </span>
      {cuota.estado === 'sin_programar' ? (
        <span className="shrink-0">
          {noSeProgramara ? <Estado nivel="aviso">Sin programar</Estado> : <Estado nivel="sin-datos">Se programará</Estado>}
        </span>
      ) : (
        <EstadoHerramienta estado={cuota.estado} />
      )}
    </>
  );
  const fila = 'flex min-h-11 items-start justify-between gap-3 rounded-lg px-3 py-2.5';

  return (
    <li className={`rounded-lg ${prevista ? 'border border-dashed border-borde-control bg-superficie' : 'bg-superficie-2'}`}>
      {/* La de la propia firma es esta página; las que no están guardadas aún no tienen página */}
      {guardada && !cuota.esLaFirma && cuota.herramientaId ? (
        <Link
          href={`/consultoria/produccion/${cuota.herramientaId}`}
          className={`${fila} transition-colors focus-visible:outline-2 focus-visible:outline-acento ${prevista ? 'hover:bg-superficie-2' : 'hover:bg-borde'}`}
        >
          {contenido}
        </Link>
      ) : (
        <div className={fila}>{contenido}</div>
      )}
      {cobrada && (
        <Link href={enlaceAlMes(cuota.fechaCobro)} className={`${BOTON_TEXTO} -mt-2 px-3`}>
          Ver la liquidación de {soloElMes(cuota.fechaCobro)}
        </Link>
      )}
    </li>
  );
}
