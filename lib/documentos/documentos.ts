import 'server-only';
import { destinoEnlace, lista, texto } from '@/lib/boveda/consultas';
import type { Boveda, Nota } from '@/lib/boveda/tipos';
import { numero } from '@/lib/economia';
import { esFechaValida } from '@/lib/fechas';
import { esCategoria, type Categoria } from './tipos';

/**
 * Un documento de un cliente es una **nota** en la bóveda, con sus datos (cliente, categoría,
 * fecha, importe y el cobro que paga si es una factura), y un **archivo** en el almacén
 * privado. Así Obsidian, Claude y el panel saben qué documentos hay y se puede buscar por
 * ellos, sin que el archivo, con sus datos personales, acabe en Git.
 *
 * `clientes/<cliente>/documentos/<AAAA-MM-DD>-<cliente>-<titulo>.md`, con la plantilla
 * `templates/documento.md` de la bóveda.
 */

export interface Documento {
  nota: Nota;
  /** Nombre de la nota del cliente */
  cliente: string;
  categoria: Categoria;
  fecha?: string;
  importe?: number;
  /** Mes del cobro que paga, `AAAA-MM`, si es una factura */
  cobro?: string;
  /** Ruta del archivo en el almacén privado */
  archivo?: string;
  nombreArchivo?: string;
  tamano?: number;
}

export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function documentos(boveda: Boveda): Documento[] {
  return boveda.notas
    .filter((nota) => nota.propiedades.tipo === 'documento')
    .map((nota): Documento => {
      const p = nota.propiedades;
      const cobro = texto(p.cobro);
      const fecha = texto(p.fecha);
      return {
        nota,
        cliente: lista(p.cliente).map(destinoEnlace)[0] ?? nota.ruta.split('/')[1],
        categoria: esCategoria(p.categoria) ? p.categoria : 'otro',
        fecha: esFechaValida(fecha) ? fecha : undefined,
        importe: numero(p.importe),
        cobro: cobro && RE_MES.test(cobro) ? cobro : undefined,
        archivo: texto(p.archivo),
        nombreArchivo: texto(p.nombre_archivo),
        tamano: numero(p.tamano),
      };
    })
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.nota.titulo.localeCompare(b.nota.titulo, 'es'));
}

/**
 * La factura de un cobro: mismo cliente y mismo mes. Si un mes tiene dos cobros (la cuota y un
 * extra), la factura con importe solo va con el cobro de ese importe; una sin importe, con cualquiera
 */
export function facturaDe(lista: Documento[], cliente: string, mes: string, importe: number): Documento | undefined {
  const delMes = lista.filter((d) => d.categoria === 'factura' && d.cliente === cliente && d.cobro === mes);
  return delMes.find((d) => d.importe === importe) ?? delMes.find((d) => d.importe === undefined);
}

/** `/api/documentos?nota=…`: el único camino para abrir un archivo, siempre con sesión */
export function hrefArchivo(documento: Documento): string {
  return `/api/documentos?nota=${encodeURIComponent(documento.nota.ruta)}`;
}

/** `Factura de septiembre` → `factura-de-septiembre` */
export function slug(valor: string, maximo = 50): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maximo)
    .replace(/^-+|-+$/g, '');
}

export interface DatosDocumento {
  cliente: string;
  categoria: Categoria;
  titulo: string;
  fecha: string;
  importe?: number;
  cobro?: string;
  /** Nota de cobros del año, para enlazarla si es una factura */
  notaCobros?: string;
  archivo: string;
  nombreArchivo: string;
  tamano: number;
}

/** El texto de la nota, con la forma de `templates/documento.md` */
export function notaDocumento(datos: DatosDocumento, urlPanel: string): string {
  const yaml = (valor: string) => JSON.stringify(valor);
  const propiedades = [
    'tipo: documento',
    `categoria: ${datos.categoria}`,
    `cliente: ${yaml(`[[${datos.cliente}]]`)}`,
    `fecha: ${datos.fecha}`,
    ...(datos.importe !== undefined ? [`importe: ${datos.importe}`] : []),
    ...(datos.cobro ? [`cobro: ${yaml(datos.cobro)}`] : []),
    `archivo: ${yaml(datos.archivo)}`,
    `nombre_archivo: ${yaml(datos.nombreArchivo)}`,
    `tamano: ${datos.tamano}`,
    'origen: dashboard',
  ];
  const relacionadas = [datos.cliente, ...(datos.notaCobros ? [datos.notaCobros] : [])];

  return [
    '---',
    ...propiedades,
    '---',
    `# ${datos.titulo}`,
    '',
    `📎 [Abrir el archivo en el panel](${urlPanel})`,
    '',
    'El archivo está en el almacén privado del panel, no en la bóveda: lleva datos personales y no debe acabar en Git.',
    '',
    '## Notas',
    '- ',
    '',
    '## 🔗 Relacionado',
    ...relacionadas.map((nombre) => `- [[${nombre}]]`),
    '',
    '#documento',
    '',
  ].join('\n');
}
