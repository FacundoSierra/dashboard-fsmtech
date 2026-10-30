import { Suspense } from 'react';
import { TarjetaAvisos, TarjetaAvisosCargando, type Urgente } from '@/components/hoy/avisos';
import { CabeceraHoy } from '@/components/hoy/cabecera';
import { CifrasDeHoy } from '@/components/hoy/cifras';
import { PorCobrar } from '@/components/hoy/cobrar';
import { InboxDeHoy, Paneles } from '@/components/hoy/columna';
import { ALaEspera } from '@/components/hoy/espera';
import { MedidorDelDia } from '@/components/hoy/medidor';
import { Objetivos } from '@/components/hoy/objetivos';
import { Requerimientos } from '@/components/hoy/requerimientos';
import { Recordatorio } from '@/components/hoy/reunion';
import { BarrasSemana } from '@/components/hoy/semana';
import { esPrioritaria, obtenerBoveda, proyectos, resumenHoy, reunionesProximas, type ResumenHoy } from '@/lib/boveda/consultas';
import { capturas } from '@/lib/boveda/inbox';
import { hoyMadrid } from '@/lib/fechas';
import { portales } from '@/lib/portales';

/**
 * La respuesta corta a «¿qué tengo que hacer hoy?», debajo del título. Los mismos números que la
 * cifra de los objetivos y el medidor, contados igual: solo las tareas de primer nivel
 */
function frase({ daily, objetivos }: ResumenHoy): string {
  if (!daily) return 'Todavía no hay diaria de hoy';
  const principales = objetivos.filter((t) => t.nivel === 0);
  const quedan = principales.filter((t) => !t.hecha).length;
  if (principales.length === 0) return 'La diaria de hoy no tiene objetivos';
  if (quedan === 0) return principales.length === 1 ? 'Has hecho el objetivo de hoy' : `Has hecho los ${principales.length} objetivos de hoy`;
  return quedan === 1 ? 'Te queda 1 objetivo' : `Te quedan ${quedan} objetivos`;
}

/**
 * Hoy, con la composición de la referencia que eligió Facundo: las cuatro cifras arriba y, debajo,
 * una rejilla de tarjetas de distintos tamaños sobre doce columnas.
 *
 * En el escritorio (desde 1280 px), las dos primeras filas son las de la referencia: la semana en
 * barras, la reunión y las peticiones abiertas; «A la espera» con sus personas, el medidor del día
 * y la tarjeta oscura de lo que hay por cobrar. Debajo, los objetivos (la tarjeta grande) y, a su
 * lado, lo que se ha roto, el inbox y tus paneles.
 *
 * El HTML va en el orden de lo que más importa, que es el del móvil (y el de quien navega con el
 * teclado o un lector de pantalla): lo roto, los objetivos, la reunión, lo que esperas… En el
 * escritorio, cada tarjeta se coloca en su sitio de la rejilla
 */
export default async function PaginaHoy() {
  const boveda = await obtenerBoveda();
  const { rutas, titulos } = boveda;
  const hoy = hoyMadrid();

  const resumen = resumenHoy(boveda, hoy);
  const urgentes: Urgente[] = proyectos(boveda)
    .filter((p) => p.estado === 'activo')
    .flatMap((proyecto) => proyecto.abiertas.filter(esPrioritaria).map((tarea) => ({ tarea, proyecto })));

  return (
    <>
      <CabeceraHoy hoy={hoy} frase={frase(resumen)} daily={resumen.daily} />

      <CifrasDeHoy resumen={resumen} boveda={boveda} hoy={hoy} />

      {/* grid-cols-1 es minmax(0, 1fr): sin él, en el móvil la columna crece con lo más ancho que tenga dentro.
          Las filas 1 y 2 del escritorio estiran sus tarjetas al mismo alto, como en la referencia */}
      {/* La última fila, flexible: lo que sobra de los objetivos (que ocupan dos) cae en ella y no
          entre los avisos y el inbox */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[auto_auto_auto_1fr]">
        <div id="avisos" className="min-w-0 scroll-mt-24 md:col-span-2 xl:col-span-3 xl:col-start-10 xl:row-start-3">
          <Suspense fallback={<TarjetaAvisosCargando />}>
            <TarjetaAvisos boveda={boveda} hoy={hoy} urgentes={urgentes} />
          </Suspense>
        </div>

        <div className="min-w-0 md:col-span-2 xl:col-span-9 xl:col-start-1 xl:row-span-2 xl:row-start-3">
          <Objetivos resumen={resumen} hoy={hoy} rutas={rutas} titulos={titulos} />
        </div>

        <div className="min-w-0 xl:col-span-3 xl:col-start-7 xl:row-start-1">
          <Recordatorio reuniones={reunionesProximas(boveda, hoy)} hoy={hoy} />
        </div>

        <div className="min-w-0 xl:col-span-5 xl:col-start-1 xl:row-start-2">
          <ALaEspera tareas={resumen.espera} ruta={resumen.daily?.ruta} hoy={hoy} rutas={rutas} titulos={titulos} />
        </div>

        <div className="min-w-0 xl:col-span-4 xl:col-start-6 xl:row-start-2">
          <MedidorDelDia resumen={resumen} />
        </div>

        <div className="min-w-0 xl:col-span-6 xl:col-start-1 xl:row-start-1">
          <BarrasSemana boveda={boveda} hoy={hoy} />
        </div>

        <div className="min-w-0 xl:col-span-3 xl:col-start-10 xl:row-start-1">
          <Requerimientos boveda={boveda} />
        </div>

        <div className="min-w-0 xl:col-span-3 xl:col-start-10 xl:row-start-2">
          <PorCobrar boveda={boveda} hoy={hoy} />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:col-span-2 md:grid-cols-2 xl:col-span-3 xl:col-start-10 xl:row-start-4 xl:grid-cols-1 xl:self-start">
          <InboxDeHoy capturas={capturas(boveda)} />
          <Paneles lista={portales(boveda)} />
        </div>
      </div>
    </>
  );
}
