import { Tarjeta } from '@/components/ui';
import type { ResumenHoy } from '@/lib/boveda/consultas';
import { Muestra, PatronRayado } from '@/components/piezas';

const RAYADO = 'rayado-medidor';

// El arco: media circunferencia de radio 96 y 32 de grosor, con el centro abajo
const CX = 120;
const CY = 122;
const R = 96;
const GROSOR = 32;
// El hueco entre los dos tramos, en fracción del arco, sin contar sus puntas
const HUECO = 0.025;
// Lo que ocupa cada punta redonda, en fracción del arco: el radio del trazo sobre la media circunferencia
const PUNTA = GROSOR / 2 / (Math.PI * R);

function punto(t: number): string {
  const angulo = Math.PI * (1 - t);
  return `${(CX + R * Math.cos(angulo)).toFixed(2)} ${(CY - R * Math.sin(angulo)).toFixed(2)}`;
}

/** El tramo del arco entre dos fracciones (0, a la izquierda; 1, a la derecha) */
function tramo(desde: number, hasta: number): string {
  return `M ${punto(desde)} A ${R} ${R} 0 0 1 ${punto(Math.max(hasta, desde + 0.0001))}`;
}

/**
 * Lo hecho de hoy en un medidor de media luna, como «Project Progress» en la referencia: el tramo
 * azul son los objetivos marcados y el rayado, los que quedan; en medio, el porcentaje grande y
 * «3 de 15». Se cuenta igual que la cifra de arriba: solo los objetivos de primer nivel
 *
 * Cada tramo lleva las dos puntas redondas, como en la referencia, y las de dentro crecen hacia
 * fuera de su tramo, no hacia dentro: así un tramo corto se ve como una píldora y no como un trozo
 * cortado a escuadra que parecía menos de lo que era. El hueco entre los dos queda en el porcentaje
 * justo, y con uno solo hecho de muchos, lo azul es un punto: lo que mide, sin inflarlo
 */
export function MedidorDelDia({ resumen }: { resumen: ResumenHoy }) {
  const principales = resumen.objetivos.filter((t) => t.nivel === 0);
  const total = principales.length;
  const hechos = principales.filter((t) => t.hecha).length;
  const p = total ? hechos / total : 0;

  const finHecho = p < 1 ? p - HUECO / 2 - PUNTA : 1;
  const inicioQueda = p > 0 ? Math.min(1, p + HUECO / 2 + PUNTA) : 0;

  return (
    <Tarjeta titulo="Avance de hoy" estirar>
      <PatronRayado id={RAYADO} />
      <div
        role="meter"
        aria-label="Objetivos hechos hoy"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={hechos}
        aria-valuetext={total ? `${hechos} de ${total}` : 'Sin objetivos'}
        className="relative mx-auto mt-2 w-full max-w-[17rem]"
      >
        <svg viewBox="0 0 240 140" aria-hidden className="block w-full">
          {total === 0 ? (
            <path d={tramo(0, 1)} fill="none" strokeWidth={GROSOR} strokeLinecap="round" className="stroke-sin-datos" />
          ) : (
            <>
              {p < 1 && <path d={tramo(inicioQueda, 1)} fill="none" strokeWidth={GROSOR} strokeLinecap="round" stroke={`url(#${RAYADO})`} />}
              {p > 0 && <path d={tramo(0, Math.max(0, finHecho))} fill="none" strokeWidth={GROSOR} strokeLinecap="round" className="stroke-serie" />}
            </>
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-[40px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]">
            {total ? Math.round(p * 100) : 0}
            <span className="text-[0.6em]">{' '}%</span>
          </p>
          <p className="mt-1.5 text-[13px] text-tenue">{total ? `${hechos} de ${total} hechos` : 'Sin objetivos hoy'}</p>
        </div>
      </div>

      <div aria-hidden className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-tenue">
        <span className="inline-flex items-center gap-1.5">
          <Muestra clase="bg-serie" />
          Hechos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Muestra rayado={RAYADO} />
          Quedan
        </span>
      </div>
    </Tarjeta>
  );
}
