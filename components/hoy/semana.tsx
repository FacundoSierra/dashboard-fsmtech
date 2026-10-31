import { EnlaceAccion, Tarjeta } from '@/components/ui';
import type { Boveda } from '@/lib/boveda/tipos';
import { resumenSemana } from '@/lib/boveda/semana';
import { fechaLarga, inicioSemana } from '@/lib/fechas';
import { Muestra, PatronRayado, Rayado } from '@/components/piezas';

const RAYADO = 'rayado-semana';
const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Columna {
  fecha: string;
  inicial: string;
  hecho: number;
  /** Solo hoy: los objetivos que quedan por marcar */
  falta: number;
  tipo: 'pasado' | 'hoy' | 'futuro';
  conDiaria: boolean;
}

function descripcion(columna: Columna): string {
  const dia = fechaLarga(columna.fecha);
  if (columna.tipo === 'futuro') return `${dia}: aún no ha llegado`;
  if (!columna.conDiaria) return `${dia}: sin diaria`;
  const hechas = `${columna.hecho} ${columna.hecho === 1 ? 'cosa hecha' : 'cosas hechas'}`;
  if (columna.tipo === 'hoy') return `${dia}, hoy: ${hechas} y ${columna.falta} ${columna.falta === 1 ? 'objetivo' : 'objetivos'} por hacer`;
  return `${dia}: ${hechas}`;
}

/**
 * La semana en barras, como «Project Analytics» en la referencia: una píldora por día, de lunes a
 * domingo, tan alta como lo apuntado en «Completado» de su diaria. Hoy va en el azul más fuerte y
 * encima, rayado, lo que falta (los objetivos sin marcar); los días que no han llegado, rayados
 * enteros. Un día pasado sin nada se queda en un punto. Lo de cada día, también en texto para
 * quien no ve las barras
 */
export function BarrasSemana({ boveda, hoy }: { boveda: Boveda; hoy: string }) {
  const { dias } = resumenSemana(boveda, inicioSemana(hoy), hoy);
  const columnas: Columna[] = dias.map((dia, i) => {
    const tipo = dia.fecha === hoy ? 'hoy' : dia.fecha < hoy ? 'pasado' : 'futuro';
    return {
      fecha: dia.fecha,
      inicial: INICIALES[i],
      hecho: dia.completado.length,
      falta: tipo === 'hoy' ? dia.objetivosTotales - dia.objetivosHechos : 0,
      tipo,
      conDiaria: Boolean(dia.daily),
    };
  });
  const maximo = Math.max(1, ...columnas.map((c) => c.hecho + c.falta));

  return (
    <Tarjeta titulo="Esta semana" accion={<EnlaceAccion href="/semana">Ver la semana</EnlaceAccion>} estirar>
      <PatronRayado id={RAYADO} />
      <p className="-mt-1 text-[13px] text-tenue">Lo apuntado en «Completado» cada día</p>

      <ul className="sr-only">
        {columnas.map((c) => (
          <li key={c.fecha}>{descripcion(c)}</li>
        ))}
      </ul>

      {/* Cada columna: su pista (de alto fijo, para que los porcentajes valgan), su píldora y su día */}
      <div aria-hidden className="mt-6 grid grid-cols-7 gap-2 sm:gap-4">
        {columnas.map((c) => {
          const alto = c.tipo === 'futuro' ? 100 : ((c.hecho + c.falta) / maximo) * 100;
          const vacio = c.tipo !== 'futuro' && c.hecho + c.falta === 0;
          return (
            <div key={c.fecha} className="flex min-w-0 flex-col items-center" title={descripcion(c)}>
              <div className="relative h-40 w-full max-w-14 sm:h-44">
                {c.tipo === 'hoy' && (
                  <span
                    className="cifras absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-borde-fuerte bg-superficie px-2 py-0.5 text-xs font-semibold"
                    style={{ bottom: `calc(max(${alto}%, 2.5rem) + 6px)` }}
                  >
                    {c.hecho}
                  </span>
                )}
                {vacio ? (
                  <span className="absolute inset-x-0 bottom-0 aspect-square rounded-full bg-sin-datos" />
                ) : (
                  <span
                    className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-full"
                    style={{ height: `max(${alto}%, 2.5rem)` }}
                  >
                    {(c.tipo === 'futuro' || c.falta > 0) && (
                      <span className="block min-h-0" style={{ flexGrow: c.tipo === 'futuro' ? 1 : c.falta, flexBasis: 0 }}>
                        <Rayado id={RAYADO} />
                      </span>
                    )}
                    {c.tipo !== 'futuro' && c.hecho > 0 && (
                      <span
                        className={`block min-h-5 ${c.tipo === 'hoy' ? 'bg-serie-fuerte' : 'bg-serie'}`}
                        style={{ flexGrow: c.hecho, flexBasis: 0 }}
                      />
                    )}
                  </span>
                )}
              </div>
              <span className={`mt-2.5 text-[13px] ${c.tipo === 'hoy' ? 'font-bold text-texto' : 'font-medium text-apagado'}`}>{c.inicial}</span>
            </div>
          );
        })}
      </div>

      <div aria-hidden className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tenue">
        <span className="inline-flex items-center gap-1.5">
          <Muestra clase="bg-serie" />
          Hecho
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Muestra clase="bg-serie-fuerte" />
          Hoy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Muestra rayado={RAYADO} />
          Por hacer o por llegar
        </span>
      </div>
    </Tarjeta>
  );
}
