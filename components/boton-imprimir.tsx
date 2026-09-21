'use client';

import { Printer } from 'lucide-react';

/** El navegador ofrece «Guardar como PDF» en el mismo diálogo */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-acento-fuerte px-3 text-sm font-medium text-white hover:opacity-90"
    >
      <Printer className="size-4" aria-hidden />
      Imprimir o guardar en PDF
    </button>
  );
}
