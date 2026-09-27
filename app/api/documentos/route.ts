import type { NextRequest } from 'next/server';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { leerArchivo } from '@/lib/documentos/almacen';
import { tipoParaServir } from '@/lib/documentos/archivos';
import { documentos } from '@/lib/documentos/documentos';

/**
 * Abre el archivo de un documento: `/api/documentos?nota=clientes/cni/documentos/….md`.
 *
 * Es el único camino a los archivos del almacén privado. La sesión se comprueba aquí mismo
 * (`obtenerBoveda()` llama a `verificarSesion()`), no solo en el proxy, y solo se sirve el
 * archivo que dice la nota del documento, que tiene que estar en la carpeta de su cliente.
 */
export async function GET(request: NextRequest) {
  const boveda = await obtenerBoveda();
  const ruta = request.nextUrl.searchParams.get('nota') ?? '';
  const documento = documentos(boveda).find((d) => d.nota.ruta === ruta);

  const carpeta = documento ? `clientes/${documento.cliente}/` : '';
  if (!documento?.archivo || !ruta.startsWith(`${carpeta}documentos/`) || !documento.archivo.startsWith(carpeta)) {
    return new Response('No encontrado', { status: 404 });
  }

  const leido = await leerArchivo(documento.archivo);
  if (!leido) return new Response('El archivo no está en el almacén', { status: 404 });

  const { contentType, enLinea } = tipoParaServir(documento.archivo);
  const nombre = documento.nombreArchivo ?? documento.archivo.split('/').at(-1) ?? 'documento';
  const nombreAscii = nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'documento';

  return new Response(leido.contenido, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(leido.tamano),
      'Content-Disposition': `${enLinea ? 'inline' : 'attachment'}; filename="${nombreAscii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      // Llevan datos personales: ni la CDN ni el disco del navegador se quedan copia
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
