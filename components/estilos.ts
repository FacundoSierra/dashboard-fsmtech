/**
 * Las clases que comparte todo el panel para lo que se toca: 44 px de alto como mínimo, como en
 * la consultoría (`components/consultoria/estilos.ts`). El foco del teclado lo pone
 * `globals.css` para todos; los campos lo cambian por su anillo.
 */

/**
 * Una zona de toque de 44 × 44 px como mínimo, invisible y centrada en el elemento, sin agrandar
 * lo que se ve: para enlaces de texto, iconos y botones pequeños. Lo que va apilado necesita
 * 44 px entre uno y el siguiente, o las zonas se pisan
 */
export const ZONA_TOQUE =
  "relative after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-full after:min-w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

export const CAMPO =
  'min-h-11 w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/30 disabled:opacity-60';

export const ETIQUETA = 'mb-1 block text-xs font-medium text-tenue';

export const BOTON_PRINCIPAL =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-acento-fuerte px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60';

export const BOTON_SECUNDARIO =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-borde bg-superficie px-4 text-sm font-medium text-texto hover:border-borde-fuerte disabled:opacity-60';

/** «Cancelar», «No»: un botón de texto con su zona de 44 px */
export const BOTON_TEXTO = 'inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-tenue hover:text-texto disabled:opacity-60';
