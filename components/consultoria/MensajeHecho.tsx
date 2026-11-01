import { IconoEstado } from '@/components/ui';
import { AVISO } from './estilos';

/**
 * Lo que guardó una acción y algo de después no pudo, o lo que no se programa solo: las acciones lo
 * devuelven dentro de `ok`, porque lo guardado se queda («Liquidación apuntada, pero no se han podido
 * programar las próximas cuotas…», «Ojo: la hucha queda en…»). Eso no lleva el icono de bien
 */
const ES_UN_AVISO = /pero no se ha|no se programan? solas?|apúntal[ao]s? a mano|ojo:/i;

/** El mensaje de una acción que ha ido bien, con el icono de bien o, si avisa de algo, el de aviso */
export default function MensajeHecho({ texto, className = '' }: { texto: string; className?: string }) {
  return (
    <p role="status" className={`flex items-start gap-2 ${AVISO} ${className}`}>
      <IconoEstado nivel={ES_UN_AVISO.test(texto) ? 'aviso' : 'bien'} className="mt-0.5 size-4" />
      <span className="min-w-0">{texto}</span>
    </p>
  );
}
