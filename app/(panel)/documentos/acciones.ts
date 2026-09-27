'use server';

import { headers } from 'next/headers';
import { obtenerBoveda } from '@/lib/boveda/consultas';
import { ErrorEscritura, crearNotaDocumento, guardar, lineaLimpia, type ResultadoEscritura } from '@/lib/boveda/escritura';
import { almacenConfigurado, borrarArchivo, guardarArchivo } from '@/lib/documentos/almacen';
import { tipoDeArchivo } from '@/lib/documentos/archivos';
import { RE_MES, notaDocumento, slug } from '@/lib/documentos/documentos';
import { TAMANO_MAXIMO, esCategoria } from '@/lib/documentos/tipos';
import { economia, numero } from '@/lib/economia';
import { esFechaValida, hoyMadrid } from '@/lib/fechas';
import { verificarSesion } from '@/lib/sesion';

const RE_CLIENTE = /^[a-z0-9][a-z0-9-]*$/;
const campo = (datos: FormData, nombre: string): string => {
  const valor = datos.get(nombre);
  return typeof valor === 'string' ? valor.slice(0, 500) : '';
};

/**
 * Sube un documento de un cliente: el archivo al almacén privado y su nota a la bóveda. Si la
 * nota no se puede crear, el archivo se borra: nunca queda un archivo sin nota que lo encuentre.
 */
export async function subirDocumento(datos: FormData): Promise<ResultadoEscritura> {
  await verificarSesion();
  if (!almacenConfigurado()) return { error: 'Falta conectar el almacén de documentos al panel.' };

  const archivo = datos.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Elige un archivo.' };
  if (archivo.size > TAMANO_MAXIMO) return { error: 'El archivo pasa de 4 MB. Si es un PDF escaneado, bájale la calidad.' };

  const cliente = campo(datos, 'cliente');
  const categoria = campo(datos, 'categoria');
  const fecha = campo(datos, 'fecha');
  const importe = campo(datos, 'importe').trim();
  const cobro = campo(datos, 'cobro').trim();
  if (!RE_CLIENTE.test(cliente) || !esCategoria(categoria)) return { error: 'Datos no válidos.' };
  if (!esFechaValida(fecha)) return { error: 'La fecha no es válida.' };

  return guardar('subir el documento', async () => {
    const boveda = await obtenerBoveda();
    if (!boveda.porRuta.has(`clientes/${cliente}/${cliente}.md`)) throw new ErrorEscritura('Ese cliente no tiene ficha.');

    const cantidad = importe ? numero(importe) : undefined;
    if (importe && !(cantidad !== undefined && cantidad > 0)) throw new ErrorEscritura('El importe tiene que ser un número, como 150 o 49,90.');
    if (cobro && (categoria !== 'factura' || !RE_MES.test(cobro))) throw new ErrorEscritura('El cobro tiene que ser un mes, como 2026-09.');

    const bytes = Buffer.from(await archivo.arrayBuffer());
    const tipo = tipoDeArchivo(archivo.name, bytes.subarray(0, 64));
    if (!tipo) {
      throw new ErrorEscritura(
        'Ese archivo no se acepta, o su contenido no es lo que dice su nombre. Valen PDF, imágenes, Word, Excel, texto y zip.',
      );
    }

    const titulo = lineaLimpia(campo(datos, 'titulo'), 120, 'el título');
    const nombre = `${fecha}-${cliente}-${slug(titulo) || categoria}`;
    const ruta = `clientes/${cliente}/documentos/${nombre}.md`;
    if (boveda.porRuta.has(ruta)) throw new ErrorEscritura('Ya hay un documento con ese título y esa fecha: cámbiale el título.');

    // Si es la factura de un cobro, la nota enlaza la nota de cobros de ese año de trato
    const planes = economia(boveda, hoyMadrid()).clientes.find((c) => c.nota.nombre === cliente)?.planes ?? [];
    const notaCobros = cobro ? planes.find((p) => cobro >= p.desde && cobro <= p.hasta)?.nota.nombre : undefined;

    const cabeceras = await headers();
    const host = cabeceras.get('x-forwarded-host') ?? cabeceras.get('host');
    const protocolo = cabeceras.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
    const url = `${protocolo}://${host}/api/documentos?nota=${encodeURIComponent(ruta)}`;

    const guardado = await guardarArchivo(`clientes/${cliente}/${nombre}.${tipo.extension}`, bytes, tipo.contentType);
    try {
      await crearNotaDocumento(
        ruta,
        notaDocumento(
          {
            cliente,
            categoria,
            titulo,
            fecha,
            importe: cantidad === undefined ? undefined : Math.round(cantidad * 100) / 100,
            cobro: cobro || undefined,
            notaCobros,
            archivo: guardado,
            nombreArchivo: lineaLimpia(archivo.name, 150, 'el nombre del archivo'),
            tamano: archivo.size,
          },
          url,
        ),
      );
    } catch (error) {
      await borrarArchivo(guardado).catch((fallo) => console.error('No se pudo borrar el archivo sin nota', guardado, fallo));
      throw error;
    }
  });
}
