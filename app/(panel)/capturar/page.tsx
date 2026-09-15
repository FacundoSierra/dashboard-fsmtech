import type { Metadata } from 'next';
import { Encabezado, Tarjeta } from '@/components/ui';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { relacionables } from '@/lib/boveda/inbox';
import { FormularioCaptura } from './formulario';

export const metadata: Metadata = { title: 'Apuntar' };

export default async function PaginaCapturar({ searchParams }: PageProps<'/capturar'>) {
  const boveda = await obtenerBoveda();
  const { titulo, texto, url } = await searchParams;

  // Lo que llega al compartir desde otra app del móvil (`share_target` del manifest)
  const compartido = [titulo, texto, url]
    .filter((valor): valor is string => typeof valor === 'string' && valor.trim() !== '')
    .join('\n');
  const { proyectos, clientes } = relacionables(boveda);

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado titulo="Apuntar" subtitulo="Se guarda como nota en el inbox de la bóveda" />
      <Tarjeta>
        <FormularioCaptura textoInicial={compartido} proyectos={proyectos} clientes={clientes} />
      </Tarjeta>
    </div>
  );
}
