import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'No existe' };

/**
 * Una dirección que no es de ninguna página. Va fuera del panel (sin menú) y no lee nada: sin
 * sesión, el proxy ya ha mandado a `/login` antes de llegar aquí. Las notas que no existen tienen
 * la suya, con buscador: `app/(panel)/not-found.tsx`
 */
export default function NoExiste() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-borde bg-superficie p-6 text-center shadow-tarjeta">
        <h1 className="text-lg font-semibold">Esta página no existe</h1>
        <p className="mt-2 text-sm text-tenue">Puede que el enlace esté mal escrito o que la página se haya quitado del panel.</p>
        <p className="mt-4 text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center font-medium text-acento hover:underline">
            Ir a Hoy
          </Link>
        </p>
      </div>
    </main>
  );
}
