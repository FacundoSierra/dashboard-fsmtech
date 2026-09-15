import { fechaHoraMadrid } from '@/lib/fechas';

export const TIPOS_CAPTURA = ['idea', 'tarea', 'nota'] as const;
export type TipoCaptura = (typeof TIPOS_CAPTURA)[number];
export const MAX_CAPTURA = 5000;

export function esTipoCaptura(valor: unknown): valor is TipoCaptura {
  return typeof valor === 'string' && (TIPOS_CAPTURA as readonly string[]).includes(valor);
}

/** `¡Llamar a Pablo mañana!` → `llamar-a-pablo-manana` */
export function slug(texto: string, maximo = 50): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, maximo).replace(/-+$/, '') || 'captura';
}

/**
 * Nota de inbox con las convenciones de la bóveda: nombre con fecha, propiedades,
 * sección "🔗 Relacionado" y etiquetas al final.
 */
export function componerCaptura({
  tipo,
  texto,
  relacionada,
  ahora,
}: {
  tipo: TipoCaptura;
  texto: string;
  relacionada?: string;
  ahora?: Date;
}): { ruta: string; titulo: string; contenido: string } {
  const { fecha, hora } = fechaHoraMadrid(ahora);
  const limpio = texto.replace(/\r\n?/g, '\n').trim();
  const [primeraLinea, ...resto] = limpio.split('\n');
  const primera = primeraLinea.replace(/^[#>*\-+\s]+/, '').trim() || 'Captura';
  const titulo = primera.length > 80 ? `${primera.slice(0, 77).trimEnd()}…` : primera;
  const cuerpo = tipo === 'tarea' ? [`- [ ] ${primera}`, resto.join('\n').trim()].filter(Boolean).join('\n\n') : limpio;
  const enlace = relacionada ? `[[${relacionada}]]` : '';

  const contenido = [
    '---',
    'tipo: captura',
    `categoria: ${tipo}`,
    `fecha: ${fecha}`,
    `hora: "${hora}"`,
    'origen: dashboard',
    ...(enlace ? [`relacionado: "${enlace}"`] : []),
    '---',
    `# ${titulo}`,
    '',
    cuerpo,
    '',
    '## 🔗 Relacionado',
    `- ${enlace}`,
    '',
    tipo === 'idea' ? '#inbox #idea' : '#inbox',
    '',
  ].join('\n');

  return { ruta: `inbox/${fecha}-${hora.replace(':', '')}-${slug(primera)}.md`, titulo, contenido };
}
