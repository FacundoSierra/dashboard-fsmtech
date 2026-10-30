import Link from 'next/link';
import { cache } from 'react';
import { ListaAvisos } from '@/components/avisos';
import { ZONA_TOQUE } from '@/components/estilos';
import { ListaTareas } from '@/components/tareas';
import { EnlaceAccion, Estado, Kpi, Tarjeta, type NivelEstado } from '@/components/ui';
import { NIVEL_ESTADO, calcularAvisos, type NivelAviso } from '@/lib/avisos';
import type { ResumenProyecto } from '@/lib/boveda/consultas';
import type { Boveda, Tarea } from '@/lib/boveda/tipos';
import { economia } from '@/lib/economia';
import { hrefNota } from '@/lib/rutas';
import { estadoGeneral } from '@/lib/vigilancia/estado';
import { reposLocales } from '@/lib/vigilancia/repos-locales';
import { Plegable } from './plegable';

const IMPORTANTES_VISIBLES = 4;
const ORDEN: NivelAviso[] = ['critico', 'grave', 'aviso', 'info'];

export interface Urgente {
  tarea: Tarea;
  proyecto: ResumenProyecto;
}

/**
 * Los avisos de Hoy, una vez por petición (los piden las dos cifras de arriba y la tarjeta). En
 * Hoy solo se enseñan los importantes (críticos y graves); los demás se cuentan y se ven en Estado
 */
const avisosDeHoy = cache(async (boveda: Boveda, hoy: string) => {
  const estado = await estadoGeneral(boveda);
  const avisos = calcularAvisos({ estado, economia: economia(boveda, hoy), repos: reposLocales(boveda), hoy });
  const conWeb = estado.proyectos.filter((p) => p.web);
  return {
    importantes: avisos.filter((a) => a.nivel === 'critico' || a.nivel === 'grave'),
    menores: avisos.filter((a) => a.nivel === 'aviso' || a.nivel === 'info'),
    webs: { total: conWeb.length, enLinea: conWeb.filter((p) => p.web?.responde).length },
  };
});

function avisosMenores(cuantos: number): string {
  return `${cuantos} ${cuantos === 1 ? 'aviso menor' : 'avisos menores'}`;
}

/** «12 de 15»: la segunda parte, más pequeña y en gris, como un denominador */
function DeTotal({ valor, total }: { valor: number; total: number }) {
  return (
    <>
      {valor}
      <span className="ml-1.5 text-[0.5em] font-medium tracking-normal text-tenue">de {total}</span>
    </>
  );
}

/** Cuántas webs de los proyectos activos responden ahora. La flecha lleva a Estado */
export async function CifraWebs({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const { webs } = await avisosDeHoy(boveda, hoy);
  const caidas = webs.total - webs.enLinea;
  return (
    <Kpi
      etiqueta="Webs en línea"
      valor={webs.total ? <DeTotal valor={webs.enLinea} total={webs.total} /> : '—'}
      href="/estado"
      textoEnlace="Ver el estado de las webs"
      estado={!webs.total ? 'sin-datos' : caidas ? 'critico' : 'bien'}
      detalle={!webs.total ? 'Ningún proyecto con web' : caidas ? `${caidas} ${caidas === 1 ? 'no responde' : 'no responden'}` : 'Todas responden'}
    />
  );
}

/** Los avisos importantes (críticos y graves) y, si no hay, cuántos menores. La flecha lleva a Estado */
export async function CifraAvisos({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const { importantes, menores } = await avisosDeHoy(boveda, hoy);
  const criticos = importantes.filter((a) => a.nivel === 'critico').length;
  const graves = importantes.length - criticos;
  const peorMenor = ORDEN.find((nivel) => menores.some((a) => a.nivel === nivel));
  const nivel: NivelEstado = criticos ? 'critico' : graves ? 'grave' : peorMenor ? NIVEL_ESTADO[peorMenor] : 'bien';
  const detalle = importantes.length
    ? [criticos && `${criticos} ${criticos === 1 ? 'crítico' : 'críticos'}`, graves && `${graves} ${graves === 1 ? 'grave' : 'graves'}`]
        .filter(Boolean)
        .join(' y ')
    : menores.length
      ? `Nada importante · ${avisosMenores(menores.length)}`
      : 'Todo en orden';
  return <Kpi etiqueta="Avisos" valor={importantes.length} href="/estado" textoEnlace="Ver todos los avisos en Estado" estado={nivel} detalle={detalle} />;
}

/** Mientras llega la vigilancia: la tarjeta con su nombre y el sitio de la cifra, del mismo alto */
export function CifraCargando({ etiqueta }: { etiqueta: string }) {
  return (
    <Kpi
      etiqueta={etiqueta}
      valor={<span className="inline-block h-[0.8em] w-16 rounded-full bg-superficie-2 align-middle motion-safe:animate-pulse" />}
      detalle={<span aria-busy="true">Comprobando las webs…</span>}
    />
  );
}

/**
 * La tarjeta de avisos: los importantes, cuántas webs responden y cuántos avisos menores hay en
 * Estado. Debajo, plegado, lo urgente de los proyectos activos: suele ser lo mismo que ya avisa
 * (el certificado que caduca), así que se cuenta y se abre si hace falta
 */
export async function TarjetaAvisos({
  boveda,
  hoy,
  urgentes,
}: {
  boveda: Boveda;
  hoy: string;
  urgentes: Urgente[];
}) {
  const { importantes, menores, webs } = await avisosDeHoy(boveda, hoy);
  const ocultos = Math.max(0, importantes.length - IMPORTANTES_VISIBLES);
  const enEstado = [ocultos > 0 && `${ocultos} ${ocultos === 1 ? 'importante' : 'importantes'} más`, menores.length > 0 && avisosMenores(menores.length)]
    .filter(Boolean)
    .join(' y ');
  const proyectosUrgentes = [...new Set(urgentes.map(({ proyecto }) => proyecto.nota.titulo.split(' — ')[0]))];

  return (
    <Tarjeta titulo="Avisos importantes" sinRelleno accion={<EnlaceAccion href="/estado">Estado</EnlaceAccion>}>
      {importantes.length > 0 ? (
        <ListaAvisos avisos={importantes} limite={IMPORTANTES_VISIBLES} compacta />
      ) : (
        <p className="px-5 pb-4 sm:px-6">
          <Estado nivel="bien">Nada importante</Estado>
        </p>
      )}

      {(webs.total > 0 || enEstado) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-borde px-5 py-3 text-sm sm:px-6">
          {webs.total > 0 && (
            <Estado nivel={webs.enLinea < webs.total ? 'critico' : 'bien'}>
              {webs.enLinea} de {webs.total} webs responden
            </Estado>
          )}
          {enEstado && <EnlaceAccion href="/estado">{enEstado}</EnlaceAccion>}
        </div>
      )}

      {urgentes.length > 0 && (
        <Plegable
          className="border-t border-borde px-5 sm:px-6"
          titulo={
            <>
              Urgente en los proyectos · {urgentes.length}
              <span className="text-apagado"> ({proyectosUrgentes.join(', ')})</span>
            </>
          }
        >
          <ul className="space-y-3">
            {urgentes.slice(0, 5).map(({ tarea, proyecto }, i) => (
              <li key={i}>
                <Link href={hrefNota(proyecto.nota.ruta)} className={`${ZONA_TOQUE} mb-1 inline-block text-[13px] font-semibold text-tenue hover:text-acento`}>
                  {proyecto.nota.titulo.split(' — ')[0]}
                </Link>
                <ListaTareas tareas={[{ ...tarea, nivel: 0 }]} rutas={boveda.rutas} titulos={boveda.titulos} compacta />
              </li>
            ))}
          </ul>
        </Plegable>
      )}
    </Tarjeta>
  );
}

export function TarjetaAvisosCargando() {
  return (
    <Tarjeta titulo="Avisos importantes">
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">Comprobando las webs…</span>
        <div className="h-4 w-4/5 rounded-full bg-superficie-2 motion-safe:animate-pulse" />
        <div className="h-4 w-3/5 rounded-full bg-superficie-2 motion-safe:animate-pulse" />
        <div className="h-4 w-2/5 rounded-full bg-superficie-2 motion-safe:animate-pulse" />
      </div>
    </Tarjeta>
  );
}
