import type { Metadata } from 'next';
import Link from 'next/link';
import { BOTON_PRINCIPAL } from '@/components/estilos';

export const metadata: Metadata = { title: 'No existe' };

/**
 * Una dirección que no es de ninguna página. Va fuera del panel (sin menú) y no lee nada: sin
 * sesión, el proxy ya ha mandado a `/login` antes de llegar aquí. Las notas que no existen tienen
 * la suya, con buscador: `app/(panel)/not-found.tsx`
 */
export default function NoExiste() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      {/* Como la entrada: la marca del menú, el título y un botón en píldora que lleva a Hoy */}
      <div className="w-full max-w-sm rounded-xl bg-superficie p-7 text-center sm:p-8">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-acento-fuerte text-[15px] font-bold tracking-tight text-white" aria-hidden>
          FS
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Esta página no existe</h1>
        <p className="mt-2 text-sm text-tenue">Puede que el enlace esté mal escrito o que la página se haya quitado del panel.</p>
        <Link href="/" className={`${BOTON_PRINCIPAL} mt-6 w-full`}>
          Ir a Hoy
        </Link>
      </div>
    </main>
  );
}
