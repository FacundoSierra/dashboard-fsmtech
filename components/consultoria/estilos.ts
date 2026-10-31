/**
 * Las clases de la consultoría: las del panel (`components/estilos.ts`), con los nombres que traían
 * las pantallas de FSM-Finance. Botones y campos en píldora, tarjetas blancas de 20 px sin borde ni
 * sombra, y lo que se pulsa, de 44 px como mínimo (`min-h-11`).
 */
import { BOTON_PRINCIPAL as PRINCIPAL, BOTON_SECUNDARIO as SECUNDARIO, CAMPO as CAMPO_PANEL } from '@/components/estilos';

/** La de `Tarjeta` de `components/ui.tsx`: blanca, de 20 px, sin borde ni sombra */
export const TARJETA = 'imprimir-plano rounded-xl bg-superficie p-5 sm:p-6';

export const CAMPO = CAMPO_PANEL;

export const ETIQUETA = 'text-[13px] font-medium text-tenue';

export const BOTON_PRINCIPAL = PRINCIPAL;

export const BOTON_SECUNDARIO = SECUNDARIO;

/** Un enlace o un botón de texto, con su zona de 44 px */
export const BOTON_TEXTO =
  'inline-flex min-h-11 items-center text-sm font-semibold text-acento underline-offset-4 hover:underline disabled:opacity-60';

/**
 * La caja de un aviso, dentro de una tarjeta: el paso siguiente del gris (`superficie-2`), con el
 * radio de lo que va dentro. Con icono, mejor `<Aviso caja>`: un aviso no va solo por color
 */
export const AVISO = 'rounded-lg bg-superficie-2 px-4 py-3 text-sm text-texto';

export const ERROR = 'text-sm font-medium text-critico-texto';

/** «Volver a Producción», «Todos los clientes»: los enlaces para moverse por la sección, en tinta suave */
export const ENLACE_VOLVER = 'inline-flex min-h-11 items-center text-sm font-medium text-tenue underline-offset-4 hover:text-texto hover:underline';

/** Lo que va dentro de una tarjeta y se aparta del resto (un desglose, una herramienta de la lista) */
export const CAJA = 'rounded-lg bg-superficie-2';

/**
 * Una herramienta prevista (aún sin firmar): blanca y con el borde discontinuo, como el círculo de
 * «sin datos», en vez del gris de las firmadas. Antes iba teñida del ámbar de aviso, que es un
 * estado y aquí no avisa de nada. El texto «Prevista», con su icono, va siempre al lado
 */
export const PREVISTA = 'border border-dashed border-borde-control bg-superficie hover:bg-superficie-2';
