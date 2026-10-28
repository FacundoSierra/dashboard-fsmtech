import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { textoParaPanel } from '@/lib/boveda/parser';
import { hrefNota } from '@/lib/rutas';

type Rutas = Record<string, string>;
type Titulos = Record<string, string>;

const RE_INCRUSTACION = /!\[\[([^\]|#]+?)(?:#([^\]|]*))?(?:\\?\|[^\]]*)?\]\]/g;
const RE_ENLACE = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g;
const RE_AVISO = /^(\s*>\s*)\[!(\w+)\][+-]?[ \t]*(.*)$/gm;

function nombreDe(destino: string): string {
  return (destino.trim().replace(/\\$/, '').split('/').pop() ?? '').replace(/\.md$/i, '');
}

/**
 * Lo que se lee de un `[[enlace]]`: su alias o, si no lo tiene, el título de la nota en vez del
 * nombre del archivo. Del título, lo de antes de « — » («CNI — web y CRM inmobiliario» → «CNI»),
 * que es como se llama a cada proyecto en el resto del panel
 */
function textoEnlace(nombre: string, alias: string | undefined, titulos: Titulos | undefined): string {
  const titulo = titulos?.[nombre]?.split(' — ')[0].trim();
  return (alias?.trim() || titulo || nombre).replace(/[[\]]/g, '');
}

function enlaceInterno(destino: string, alias: string | undefined, rutas: Rutas, titulos: Titulos | undefined): string {
  const nombre = nombreDe(destino);
  const visible = textoEnlace(nombre, alias, titulos);
  const ruta = rutas[nombre];
  return ruta ? `[${visible}](<${hrefNota(ruta)}>)` : visible;
}

/** El texto de una línea sin Markdown de enlaces, para un `title` */
export function textoPlano(texto: string, titulos?: Titulos): string {
  return textoParaPanel(texto).replace(RE_ENLACE, (_, destino: string, alias: string | undefined) =>
    textoEnlace(nombreDe(destino), alias, titulos),
  );
}

/** Convierte la sintaxis propia de Obsidian a Markdown estándar */
function adaptarObsidian(texto: string, rutas: Rutas, titulos: Titulos | undefined): string {
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
        return enlaceInterno(nombre, undefined, rutas, titulos);
      })
      // Enlaces: `[[nota]]`, `[[nota#sección]]`, `[[nota|texto]]` y `[[nota\|texto]]` en tablas
      .replace(RE_ENLACE, (_, destino: string, alias: string | undefined) => enlaceInterno(destino, alias, rutas, titulos))
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

// En línea (tareas, avisos, propiedades) no hay `.prosa` que les dé estilo: lo llevan aquí
const ENLACE_EN_LINEA = 'text-acento underline decoration-acento/40 underline-offset-2 hover:decoration-acento';

const componentesEnLinea: Components = {
  a: ({ href = '', children }) =>
    href.startsWith('/') ? (
      <Link href={href} className={ENLACE_EN_LINEA}>
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className={ENLACE_EN_LINEA}>
        {children}
      </a>
    ),
  p: ({ children }) => <>{children}</>,
};

/** `requerimientos.base` y `Del proyecto` → `requerimientos.base#del proyecto`: cómo se nombra una vista en `vistas` */
export function claveVista(base: string, vista?: string): string {
  return `${base.trim().toLowerCase()}#${(vista ?? '').trim().toLowerCase()}`;
}

// Una vista `.base` incrustada sola en su línea, fuera de listas y avisos: `![[reuniones.base#Relacionadas]]`
const RE_VISTA_SOLA = /^!\[\[([^\]|#]+?\.base)(?:#([^\]|]*))?(?:\\?\|[^\]]*)?\]\][ \t]*$/i;
const RE_VALLA = /^\s*(```|~~~)/;

/** El texto partido por las vistas que el panel sabe pintar; el resto de vistas se quedan en el texto */
function partirPorVistas(texto: string, vistas: Record<string, ReactNode>): (string | { vista: string })[] {
  const partes: (string | { vista: string })[] = [];
  let lineas: string[] = [];
  let enCodigo = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (RE_VALLA.test(linea)) enCodigo = !enCodigo;
    const vista = enCodigo ? null : linea.match(RE_VISTA_SOLA);
    const clave = vista ? claveVista(vista[1], vista[2]) : undefined;
    if (clave && Object.hasOwn(vistas, clave)) {
      partes.push(lineas.join('\n'), { vista: clave });
      lineas = [];
    } else {
      lineas.push(linea);
    }
  }
  partes.push(lineas.join('\n'));
  return partes;
}

/**
 * Una nota o un trozo de nota en Markdown, con los `[[enlaces]]` de Obsidian. `enLinea`, para
 * una tarea o una línea corta: sin párrafos y con el texto limpio (`textoParaPanel`). Con
 * `titulos` (los de la bóveda), los enlaces sin alias enseñan el título de la nota.
 *
 * `vistas`: lo que se pinta en lugar de una vista `.base` de Obsidian incrustada (las listas de
 * requerimientos o reuniones de un proyecto), por su `claveVista`. Las que no estén ahí siguen
 * saliendo como texto («Vista de Obsidian: …»)
 */
export function Markdown({
  texto,
  rutas,
  titulos,
  enLinea = false,
  vistas,
}: {
  texto: string;
  rutas: Rutas;
  titulos?: Titulos;
  enLinea?: boolean;
  vistas?: Record<string, ReactNode>;
}) {
  if (enLinea) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentesEnLinea}>
        {adaptarObsidian(textoParaPanel(texto), rutas, titulos)}
      </ReactMarkdown>
    );
  }
  const prosa = (trozo: string) => (
    <div className="prosa">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {adaptarObsidian(trozo, rutas, titulos)}
      </ReactMarkdown>
    </div>
  );
  if (!vistas) return prosa(texto);

  // Cada vista va fuera de `.prosa`, que daría a sus listas viñetas y sangría de texto
  return (
    <>
      {partirPorVistas(texto, vistas).map((parte, i) =>
        typeof parte === 'string' ? (
          parte.trim() ? <Fragment key={i}>{prosa(parte)}</Fragment> : null
        ) : (
          <div key={i} className="my-3">
            {vistas[parte.vista]}
          </div>
        ),
      )}
    </>
  );
}
