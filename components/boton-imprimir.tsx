'use client';

import { Printer } from 'lucide-react';
import { BOTON_PRINCIPAL } from './estilos';

/** El navegador ofrece «Guardar como PDF» en el mismo diálogo */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={BOTON_PRINCIPAL}
    >
      <Printer className="size-4" aria-hidden />
      Imprimir o guardar en PDF
    </button>
  );
}
