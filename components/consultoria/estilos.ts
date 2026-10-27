/**
 * Las clases de la consultoría, con los colores y las medidas del panel. Lo que se pulsa, de 44 px
 * como mínimo (`min-h-11`), como en FSM-Finance.
 */

/** La de `Tarjeta` de `components/ui.tsx`, con un poco más de aire en pantallas anchas */
export const TARJETA = 'rounded-xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5';

export const CAMPO =
  'min-h-11 w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-sm text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento/30 disabled:opacity-60';

export const ETIQUETA = 'text-sm font-medium text-tenue';

export const BOTON_PRINCIPAL =
  'min-h-11 rounded-lg bg-acento-fuerte px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento';

export const BOTON_SECUNDARIO =
  'min-h-11 rounded-lg border border-borde bg-superficie px-4 text-sm font-medium text-texto transition-colors hover:border-borde-fuerte hover:bg-superficie-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento';

/** Un enlace o un botón de texto, con su zona de 44 px */
export const BOTON_TEXTO =
  'inline-flex min-h-11 items-center text-sm font-medium text-acento underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-acento disabled:opacity-60';

/** La caja de un aviso. Con icono, mejor `<Aviso caja>`: un aviso no va solo por color */
export const AVISO = 'rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm text-texto';

export const ERROR = 'text-sm font-medium text-critico-texto';

/** «Volver a Producción», «Todos los clientes»: los enlaces para moverse por la sección, en tinta suave */
export const ENLACE_VOLVER =
  'inline-flex min-h-11 items-center text-sm font-medium text-tenue underline-offset-4 hover:text-texto hover:underline focus-visible:outline-2 focus-visible:outline-acento';
