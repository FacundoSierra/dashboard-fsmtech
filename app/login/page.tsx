import type { Metadata } from 'next';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Acceso' };

export default async function PaginaLogin({ searchParams }: PageProps<'/login'>) {
  const { desde } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard FSMTECH</h1>
        <p className="mb-6 mt-1 text-sm text-tenue">Panel privado. Introduce la contraseña.</p>
        <FormularioLogin desde={typeof desde === 'string' ? desde : '/'} />
      </div>
    </main>
  );
}
