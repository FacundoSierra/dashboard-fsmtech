import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import { ZONA_TOQUE } from '@/components/estilos';
import { Markdown } from '@/components/markdown';
import { ReflexionSemanal } from '@/components/reflexion-semanal';
import { ListaTareas } from '@/components/tareas';
import { Chip, EnlaceAccion, Encabezado, Estado, Kpi, Medidor, Tarjeta } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { resumenSemana, revisionHasta, semanasDesde, type DiaSemana, type RevisionSemanal } from '@/lib/boveda/semana';
import type { Boveda } from '@/lib/boveda/tipos';
import { esFechaValida, fechaCorta, fechaLarga, hoyMadrid, inicioSemana, semanaIso, sumarDias } from '@/lib/fechas';
import { hrefNota } from '@/lib/rutas';

export const metadata: Metadata = { title: 'Semana' };

const BOTON =
  'inline-flex min-h-11 items-center gap-1 rounded-full border border-borde-fuerte bg-superficie px-4 font-semibold hover:border-acento hover:text-acento';

export default async function PaginaSemana({ searchParams }: PageProps<'/semana'>) {
  const boveda = await obtenerBoveda();
  const hoy = hoyMadrid();
  const { fecha } = await searchParams;
  const lunes = inicioSemana(esFechaValida(fecha) ? fecha : hoy);
  const semana = resumenSemana(boveda, lunes, hoy);
  const { totales } = semana;
  const revision = revisionHasta(boveda, semanaIso(lunes));
  // La de esta semana o la de la anterior (la del domingo se responde el lunes) está al día; una más vieja, no
  const antiguedad = revision ? semanasDesde(revision.semana, lunes) : undefined;
  const vigente = revision !== undefined && antiguedad !== undefined && antiguedad <= 1;

  return (
    <>
      <Encabezado titulo="Semana" subtitulo={`Del ${fechaCorta(semana.lunes)} al ${fechaCorta(semana.domingo)}`} />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/semana?fecha=${sumarDias(lunes, -7)}`} className={BOTON}>
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Link>
        {lunes !== inicioSemana(hoy) && (
          <Link href="/semana" className={BOTON}>
            Esta semana
          </Link>
        )}
        <Link href={`/semana?fecha=${sumarDias(lunes, 7)}`} className={BOTON}>
          Siguiente
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        <span className="ml-auto">
          {/* Sin daily ayer ni hoy no hay racha: en verde, con 0, parecía que iba bien */}
          <Estado nivel={semana.racha > 0 ? 'bien' : 'neutro'}>
            Racha de dailies: {semana.racha} {semana.racha === 1 ? 'día' : 'días'}
          </Estado>
        </span>
      </div>

      {/* Cinco cifras en dos columnas dejaban una sola en la última fila: en el móvil, la de objetivos ocupa la fila entera */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <Kpi
            destacada
            etiqueta="Objetivos hechos"
            valor={`${totales.objetivosHechos}/${totales.objetivosTotales}`}
            detalle="Sin repetir lo arrastrado"
          >
            {totales.objetivosTotales > 0 && (
              <Medidor valor={totales.objetivosHechos} max={totales.objetivosTotales} etiqueta="Objetivos hechos de la semana" />
            )}
          </Kpi>
        </div>
        <Kpi etiqueta="Completado en dailies" valor={totales.completado} />
        <Kpi etiqueta="Hecho en proyectos" valor={totales.enNotas} />
        <Kpi etiqueta="Reuniones" valor={totales.reuniones} />
        <Kpi etiqueta="Dailies" valor={`${totales.dailies}/7`} />
      </div>

      {revision &&
        (vigente ? (
          <Revision revision={revision} boveda={boveda} />
        ) : (
          <RevisionAntigua revision={revision} antiguedad={antiguedad} boveda={boveda} />
        ))}

      <div className="space-y-3">
        {semana.dias.map((dia) => (
          <TarjetaDia key={dia.fecha} dia={dia} hoy={hoy} rutas={boveda.rutas} titulos={boveda.titulos} />
        ))}
      </div>
    </>
  );
}

/** Lo que trae una revisión: sus prioridades y las respuestas ya escritas. Con `responder`, el formulario de las que faltan */
function ContenidoRevision({ revision, boveda, responder }: { revision: RevisionSemanal; boveda: Boveda; responder: boolean }) {
  const respondidas = revision.preguntas.filter((p) => p.respuesta);
  const sinResponder = revision.preguntas.filter((p) => !p.respuesta).map((p) => p.pregunta);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {revision.prioridades && (
        <div className="min-w-0 text-sm">
          <p className="mb-2 font-medium">Prioridades de la semana</p>
          <Markdown texto={revision.prioridades} rutas={boveda.rutas} titulos={boveda.titulos} />
        </div>
      )}
      <div className="min-w-0">
        <p className="mb-2 text-sm font-medium">Reflexión</p>
        {respondidas.map((p) => (
          <p key={p.pregunta} className="mb-2 text-sm">
            <span className="font-medium">{p.pregunta}</span> <span className="text-tenue">{p.respuesta}</span>
          </p>
        ))}
        {revision.preguntas.length === 0 ? (
          <p className="text-sm text-tenue">Esta revisión no trae preguntas.</p>
        ) : sinResponder.length > 0 && responder ? (
          <ReflexionSemanal ruta={revision.nota.ruta} preguntas={sinResponder} />
        ) : (
          sinResponder.length > 0 && (
            <p className="text-sm text-tenue">
              {sinResponder.length === 1 ? 'Una pregunta se quedó' : `${sinResponder.length} preguntas se quedaron`} sin responder.
            </p>
          )
        )}
      </div>
    </div>
  );
}

/** La revisión de esta semana o de la anterior: la que toca responder */
function Revision({ revision, boveda }: { revision: RevisionSemanal; boveda: Boveda }) {
  const sinResponder = revision.preguntas.some((p) => !p.respuesta);
  return (
    <Tarjeta
      titulo={`Revisión de la semana ${Number(revision.semana.slice(-2))}${sinResponder ? ' · reflexión sin responder' : ''}`}
      icono={NotebookPen}
      accion={<EnlaceAccion href={hrefNota(revision.nota.ruta)}>Abrir la revisión</EnlaceAccion>}
      className="mb-6"
    >
      <ContenidoRevision revision={revision} boveda={boveda} responder />
    </Tarjeta>
  );
}

/**
 * Una revisión de hace más de una semana ya no es la de esta semana: plegada, y sin el formulario,
 * para no responder a destiempo las preguntas de entonces
 */
function RevisionAntigua({ revision, antiguedad, boveda }: { revision: RevisionSemanal; antiguedad?: number; boveda: Boveda }) {
  return (
    <details className="group mb-6 rounded-xl border border-borde bg-superficie shadow-tarjeta">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <NotebookPen className="size-4 shrink-0 text-apagado" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-medium">
            La última revisión es de hace {antiguedad === undefined ? 'más de dos años' : `${antiguedad} semanas`}
          </span>
          <span className="text-tenue"> · semana {Number(revision.semana.slice(-2))}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-apagado transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-borde p-4">
        <ContenidoRevision revision={revision} boveda={boveda} responder={false} />
        <EnlaceAccion href={hrefNota(revision.nota.ruta)}>Abrir la revisión</EnlaceAccion>
      </div>
    </details>
  );
}

function TarjetaDia({
  dia,
  hoy,
  rutas,
  titulos,
}: {
  dia: DiaSemana;
  hoy: string;
  rutas: Record<string, string>;
  titulos: Record<string, string>;
}) {
  const esHoy = dia.fecha === hoy;
  const futuro = dia.fecha > hoy;
  const completo = dia.objetivosTotales > 0 && dia.objetivosHechos === dia.objetivosTotales;

  return (
    <Tarjeta className={`${esHoy ? 'ring-2 ring-acento/40' : ''} ${futuro ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold first-letter:uppercase">
          {fechaLarga(dia.fecha)}
          {esHoy && <span className="font-normal text-acento"> · hoy</span>}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {dia.daily ? (
            <Link href={hrefNota(dia.daily.ruta)} className={`${ZONA_TOQUE} inline-flex`}>
              <Chip tono="acento">Daily</Chip>
            </Link>
          ) : (
            !futuro && <Chip>Sin daily</Chip>
          )}
          {dia.objetivosTotales > 0 && (
            <Estado nivel={completo ? 'bien' : 'neutro'}>
              <span className="text-xs">
                {dia.objetivosHechos}/{dia.objetivosTotales} objetivos
              </span>
            </Estado>
          )}
        </div>
      </div>

      {(dia.reuniones.length > 0 || dia.completado.length > 0 || dia.enNotas.length > 0) && (
        // Los `summary`, de 44 px (20 de texto y 12 arriba y abajo) y sin hueco entre ellos: así no se pisan
        <div className="mt-2 text-sm">
          {dia.reuniones.length > 0 && (
            <ul className="space-y-1 py-1">
              {dia.reuniones.map((reunion) => (
                <li key={reunion.nota.ruta}>
                  <span className="text-tenue">Reunión{reunion.hora && ` ${reunion.hora}`}: </span>
                  <Link href={hrefNota(reunion.nota.ruta)} className="hover:text-acento">
                    {reunion.nota.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {dia.completado.length > 0 && (
            <details>
              <summary className="cursor-pointer py-3 text-tenue hover:text-texto">Completado en la daily ({dia.completado.length})</summary>
              <div className="pb-2">
                <ListaTareas tareas={dia.completado} rutas={rutas} titulos={titulos} />
              </div>
            </details>
          )}
          {dia.enNotas.length > 0 && (
            <details>
              <summary className="cursor-pointer py-3 text-tenue hover:text-texto">Hecho en proyectos y notas ({dia.enNotas.length})</summary>
              <ul className="space-y-1.5 pb-2">
                {dia.enNotas.map((hecho, i) => (
                  <li key={i}>
                    <Markdown texto={hecho.texto} rutas={rutas} titulos={titulos} enLinea />{' '}
                    <Link href={hrefNota(hecho.nota.ruta)} className="text-tenue hover:text-acento">
                      · {hecho.nota.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
