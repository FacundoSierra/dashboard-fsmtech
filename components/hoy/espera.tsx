import { Markdown } from '@/components/markdown';
import { TareaEditable } from '@/components/tarea-editable';
import { Chip, Contador, EstadoPildora, Tarjeta, Vacio } from '@/components/ui';
import { partesEspera, type PartesEspera } from '@/lib/boveda/espera';
import type { Tarea } from '@/lib/boveda/tipos';
import { diasEntre, esFechaValida } from '@/lib/fechas';
import { Avatar } from '@/components/piezas';

/** La regla de la bóveda: lo que lleva más de una semana esperando se dice en voz alta */
const DIAS_ESPERANDO_MUCHO = 7;

type Grupo = { tareas: Tarea[]; partes: PartesEspera; dias?: number };

/** Cada tarea de primer nivel con sus hijas, que se mueven y se ordenan con ella */
function agrupar(tareas: Tarea[], hoy: string): Grupo[] {
  const grupos: Grupo[] = [];
  for (const tarea of tareas) {
    const ultimo = grupos.at(-1);
    if (tarea.nivel > 0 && ultimo) {
      ultimo.tareas.push(tarea);
      continue;
    }
    const partes = partesEspera(tarea.texto);
    grupos.push({ tareas: [tarea], partes, dias: esFechaValida(partes.desde) ? diasEntre(partes.desde, hoy) : undefined });
  }
  // Lo que lleva más tiempo esperando, primero; lo que ya se marcó, al final
  return grupos.sort(
    (a, b) => Number(a.tareas[0].hecha) - Number(b.tareas[0].hecha) || (b.dias ?? -1) - (a.dias ?? -1),
  );
}

/** En la fila manda quién lo tiene: lo que se espera, si en la nota va entero en negrita, sin ella */
function sinNegrita(texto: string): string {
  return texto.replace(/^\*\*([^*]+)\*\*$/, '$1');
}

/**
 * Los días esperando, en píldora como las etiquetas de estado de la referencia. Más de una
 * semana, con el icono de grave (la regla de decirlo en voz alta); lo recibido, con el de bien
 */
function Dias({ dias, hecha }: { dias?: number; hecha: boolean }) {
  if (hecha) return <EstadoPildora nivel="bien">Recibido</EstadoPildora>;
  if (dias === undefined) return null;
  const texto = dias === 0 ? 'Desde hoy' : `${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (dias > DIAS_ESPERANDO_MUCHO) return <EstadoPildora nivel="grave">{texto}</EstadoPildora>;
  return <Chip>{texto}</Chip>;
}

/**
 * «⏳ A la espera» de la diaria de hoy, como la lista de personas de la referencia: cada fila con el
 * círculo de quien lo tiene, su nombre, lo que se espera a una línea y, a la derecha, los días que
 * lleva. Al desplegar sale la línea entera de la nota, «Recibido» (la casilla) y «Ya ha
 * contestado», que la devuelve a objetivos. Una línea sin el formato `qué — **quién** — desde
 * AAAA-MM-DD` se ve tal cual, con un círculo neutro. Se marca y se mueve con `tarea.linea`, como
 * siempre: el orden de aquí no toca la nota
 */
export function ALaEspera({
  tareas,
  ruta,
  hoy,
  rutas,
  titulos,
}: {
  tareas: Tarea[];
  /** La diaria de hoy; sin ella, la tarjeta dice que no hay nada esperando */
  ruta?: string;
  hoy: string;
  rutas: Record<string, string>;
  titulos: Record<string, string>;
}) {
  const grupos = agrupar(tareas, hoy);
  const pendientes = grupos.filter((g) => !g.tareas[0].hecha).length;

  return (
    <Tarjeta
      titulo={
        <>
          A la espera
          <Contador>{pendientes}</Contador>
        </>
      }
      estirar
    >
      {!ruta || grupos.length === 0 ? (
        <Vacio>Nadie tiene nada tuyo pendiente.</Vacio>
      ) : (
      <ul className="-my-1.5">
        {grupos.map(({ tareas: [tarea, ...hijas], partes, dias }, g) => (
          <TareaEditable
            key={`${g}-${tarea.linea}`}
            ruta={ruta}
            linea={tarea.linea}
            hecha={tarea.hecha}
            nivel={0}
            mover="objetivos"
            avatar={<Avatar nombre={partes.quien ?? '·'} />}
            insignia={<Dias dias={dias} hecha={tarea.hecha} />}
            cabecera={
              <span className="font-semibold">
                {partes.quien ? <Markdown texto={partes.quien} rutas={rutas} titulos={titulos} enLinea /> : 'Sin nombre'}
              </span>
            }
            // Al desplegar, la línea entera y, debajo, sus puntos, que se marcan como siempre
            entera={
              partes.quien || hijas.length ? (
                <>
                  <Markdown texto={tarea.texto} rutas={rutas} titulos={titulos} enLinea />
                  {hijas.length > 0 && (
                    <ul data-anidada className="mt-2 text-[15px] text-texto">
                      {hijas.map((hija, i) => (
                        <TareaEditable key={`${i}-${hija.linea}`} ruta={ruta} linea={hija.linea} hecha={hija.hecha} nivel={hija.nivel}>
                          <Markdown texto={hija.texto} rutas={rutas} titulos={titulos} enLinea />
                        </TareaEditable>
                      ))}
                    </ul>
                  )}
                </>
              ) : undefined
            }
          >
            <Markdown texto={sinNegrita(partes.que)} rutas={rutas} titulos={titulos} enLinea />
            {hijas.length > 0 && ` · ${hijas.length} ${hijas.length === 1 ? 'punto' : 'puntos'}`}
          </TareaEditable>
        ))}
      </ul>
      )}
    </Tarjeta>
  );
}
