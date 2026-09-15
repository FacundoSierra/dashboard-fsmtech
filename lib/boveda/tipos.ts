export type Propiedades = Record<string, unknown>;

export interface Tarea {
  texto: string;
  hecha: boolean;
  /** Nivel de sangría: 0 para las tareas de primer nivel */
  nivel: number;
}

export interface Seccion {
  titulo: string;
  /** Nivel del título (1 = `#`); 0 para el texto anterior al primer título */
  nivel: number;
  contenido: string;
}

export interface Nota {
  /** Ruta dentro de la bóveda, con extensión: `proyectos/cjfit-app/cjfit-app.md` */
  ruta: string;
  /** Nombre del archivo sin extensión, que es lo que usan los `[[enlaces]]` */
  nombre: string;
  /** Primera carpeta de la ruta (`proyectos`, `daily-notes`…); vacía en la raíz */
  carpeta: string;
  titulo: string;
  propiedades: Propiedades;
  /** Markdown sin frontmatter ni comentarios `%% %%` */
  cuerpo: string;
  secciones: Seccion[];
  etiquetas: string[];
  /** Nombres de las notas enlazadas, también desde las propiedades */
  enlaces: string[];
}

export interface Boveda {
  notas: Nota[];
  porRuta: Map<string, Nota>;
  /** Nombre de nota → ruta, para convertir `[[enlaces]]` en URLs */
  rutas: Record<string, string>;
  /** Nombre de nota → título */
  titulos: Record<string, string>;
}
