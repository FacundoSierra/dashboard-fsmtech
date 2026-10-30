/**
 * Las clases que comparte todo el panel para lo que se toca: 44 px de alto como mínimo, como en
 * la consultoría (`components/consultoria/estilos.ts`). El foco del teclado lo pone
 * `globals.css` para todos; los campos lo cambian por su anillo.
 *
 * Botones y campos de una línea, en píldora, como en la referencia que eligió Facundo: el
 * principal, relleno del azul oscuro de la marca; el secundario, blanco con el borde del azul. Los
 * campos, blancos y con el borde a 3:1 sobre la tarjeta y el gris (`borde-control`), para que se
 * vea dónde se escribe.
 */

/**
 * Una zona de toque de 44 × 44 px como mínimo, invisible y centrada en el elemento, sin agrandar
 * lo que se ve: para enlaces de texto, iconos y botones pequeños. Lo que va apilado necesita
 * 44 px entre uno y el siguiente, o las zonas se pisan
 */
export const ZONA_TOQUE =
  "relative after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-full after:min-w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

/** En píldora si es de una línea; un `textarea`, con el radio de lo que va dentro de las tarjetas */
export const CAMPO =
  'min-h-11 w-full min-w-0 rounded-full border border-borde-control bg-superficie px-4 py-2 text-[15px] outline-none placeholder:text-apagado focus:border-acento focus:ring-2 focus:ring-acento/25 disabled:opacity-60 [&:is(textarea)]:rounded-2xl';

export const ETIQUETA = 'mb-1.5 block text-[13px] font-medium text-tenue';

/** Desactivado, en gris y legible (4,5:1): un azul lavado parecía roto y competía con el botón de verdad */
export const BOTON_PRINCIPAL =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-acento-fuerte px-5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-acento-fuerte/90 active:scale-[0.98] disabled:bg-superficie-2 disabled:text-apagado motion-reduce:transition-none';

/** Blanco, con el borde del azul de la marca (3:1 o más en los dos modos) y el texto en tinta */
export const BOTON_SECUNDARIO =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-acento bg-superficie px-5 text-sm font-semibold text-texto transition-colors hover:bg-acento-suave disabled:opacity-60';

/** «Cancelar», «No»: un botón de texto con su zona de 44 px */
export const BOTON_TEXTO = 'inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm text-tenue hover:text-texto disabled:opacity-60';

/**
 * El botón redondo de la esquina de las tarjetas de cifras (la flecha en diagonal de la
 * referencia): un círculo de 36 px con el borde a 3:1, que se toca en 44
 */
export const BOTON_REDONDO =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-borde-control text-texto transition-colors hover:bg-superficie-2';

/** Los botones de icono de la cabecera: círculos blancos de 44 px sobre el gris, como en la referencia */
export const BOTON_ICONO =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie text-tenue transition-colors hover:text-texto';
