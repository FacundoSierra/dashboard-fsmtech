import { ImageResponse } from 'next/og';
import { IconoApp } from '@/components/icono-app';

/** Iconos del manifest (192 y 512 px); públicos, como el manifest */
const TAMANOS = ['192', '512'];

export const dynamicParams = false;

export function generateStaticParams() {
  return TAMANOS.map((tamano) => ({ tamano }));
}

export async function GET(_peticion: Request, { params }: RouteContext<'/iconos/[tamano]'>) {
  const { tamano } = await params;
  if (!TAMANOS.includes(tamano)) return new Response('No encontrado', { status: 404 });

  const lado = Number(tamano);
  return new ImageResponse(<IconoApp tamano={lado} />, { width: lado, height: lado });
}
