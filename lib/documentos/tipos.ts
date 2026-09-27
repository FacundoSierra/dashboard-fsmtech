/**
 * Lo que se comparte entre el servidor y el formulario de subida: categorías y límites.
 * El resto de `lib/documentos/` es solo de servidor.
 */

export const CATEGORIAS = {
  factura: 'Factura',
  contrato: 'Contrato',
  presupuesto: 'Presupuesto',
  material: 'Material',
  otro: 'Otro',
} as const;

export type Categoria = keyof typeof CATEGORIAS;

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && Object.hasOwn(CATEGORIAS, valor);
}

/**
 * Por debajo del límite de 4,5 MB que Vercel admite en una petición a una función, con
 * margen para lo que añade el formulario. Un contrato o una factura en PDF no llegan ni a 1 MB.
 */
export const TAMANO_MAXIMO = 4 * 1024 * 1024;

/** Lo que acepta el selector de archivos. Se vuelve a comprobar en el servidor, mirando el contenido */
export const ACEPTADOS = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.doc,.xls,.txt,.csv,.zip';
