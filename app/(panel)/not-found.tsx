import Link from 'next/link';
import { BuscarLoQueFalta } from '@/components/buscar-lo-que-falta';

/**
 * Lo que se ve cuando una página del panel llama a `notFound()`: casi siempre, un enlace a una nota
 * que se ha renombrado o movido en Obsidian. Propone buscarla por el último tramo de la ruta.
 *
 * Responde 200 y no 404: la pantalla de carga (`loading.tsx`) empieza a enviar la página antes de
 * saber si la nota existe, y con eso el código ya está mandado. Next añade `noindex`, y el panel
 * tampoco se indexa en lo demás
 */
export default function NoEncontrada() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-borde bg-superficie p-6 text-center shadow-tarjeta">
      <BuscarLoQueFalta />
      <p className="mt-4 text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center font-medium text-acento hover:underline">
          Volver a Hoy
        </Link>
      </p>
    </div>
  );
}
