import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hrefNota } from '@/lib/rutas';

type Rutas = Record<string, string>;

const RE_INCRUSTACION = /!\[\[([^\]|#]+?)(?:#([^\]|]*))?(?:\\?\|[^\]]*)?\]\]/g;
const RE_ENLACE = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g;
const RE_AVISO = /^(\s*>\s*)\[!(\w+)\][+-]?[ \t]*(.*)$/gm;

function enlaceInterno(destino: string, alias: string | undefined, rutas: Rutas): string {
  const nombre = (destino.trim().replace(/\\$/, '').split('/').pop() ?? '').replace(/\.md$/i, '');
  const visible = (alias?.trim() || nombre).replace(/[[\]]/g, '');
  const ruta = rutas[nombre];
  return ruta ? `[${visible}](<${hrefNota(ruta)}>)` : visible;
}

/** Convierte la sintaxis propia de Obsidian a Markdown estándar */
function adaptarObsidian(texto: string, rutas: Rutas): string {
  return (
    texto
      // Avisos: `> [!note] Título` → `> **Título**`
      .replace(RE_AVISO, (_, prefijo: string, tipo: string, titulo: string) => `${prefijo}**${titulo || tipo}**`)
      // Incrustaciones: vistas `.base`, imágenes, PDF u otras notas
      .replace(RE_INCRUSTACION, (_, destino: string, ancla: string | undefined) => {
        const nombre = destino.trim();
        if (/\.base$/i.test(nombre)) {
          return `*Vista de Obsidian: ${nombre.replace(/\.base$/i, '')}${ancla ? ` › ${ancla}` : ''}*`;
        }
        if (/\.(png|jpe?g|gif|webp|svg|pdf|canvas)$/i.test(nombre)) return `*Archivo: ${nombre}*`;
        return enlaceInterno(nombre, undefined, rutas);
      })
      // Enlaces: `[[nota]]`, `[[nota#sección]]`, `[[nota|texto]]` y `[[nota\|texto]]` en tablas
      .replace(RE_ENLACE, (_, destino: string, alias: string | undefined) => enlaceInterno(destino, alias, rutas))
  );
}

const componentes: Components = {
  a: ({ href = '', children }) =>
    href.startsWith('/') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
};

const componentesEnLinea: Components = {
  ...componentes,
  p: ({ children }) => <>{children}</>,
};

export function Markdown({ texto, rutas, enLinea = false }: { texto: string; rutas: Rutas; enLinea?: boolean }) {
  const contenido = adaptarObsidian(texto, rutas);
  if (enLinea) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentesEnLinea}>
        {contenido}
      </ReactMarkdown>
    );
  }
  return (
    <div className="prosa">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {contenido}
      </ReactMarkdown>
    </div>
  );
}
