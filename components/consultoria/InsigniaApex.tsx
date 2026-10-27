import type { Herramienta } from '@/lib/consultoria/tipos';

/**
 * La insignia de una aportación extraordinaria enlazada a su herramienta: «APEX de TopPlan». Neutra,
 * como el `Chip` del panel, para que no se confunda con el estado. Si no se sabe de cuál (no debería
 * pasar), «APEX».
 */
export default function InsigniaApex({ de }: Pick<Herramienta, 'de'>) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md border border-borde bg-superficie-2 px-1.5 py-0.5 text-xs font-medium text-tenue">
      <span className="truncate">{de ? `APEX de ${de.producto}` : 'APEX'}</span>
    </span>
  );
}
