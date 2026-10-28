import type { MetadataRoute } from 'next';

/** Público a propósito: el navegador pide el manifest sin la cookie de sesión y no contiene datos */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Dashboard FSMTECH',
    short_name: 'FSMTECH',
    description: 'Clientes, proyectos, objetivos y reuniones',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // El azul de la marca también de fondo: el manifest no distingue claro de oscuro, y uno claro
    // destellaba en blanco al abrir la app con el móvil en oscuro. Con la página ya cargada, manda
    // el `themeColor` de `app/layout.tsx`, que sí sigue el modo
    background_color: '#1c5cab',
    theme_color: '#1c5cab',
    icons: [
      { src: '/iconos/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Apuntar', description: 'Guardar una idea, tarea o nota en el inbox', url: '/capturar' },
      { name: 'Buscar', url: '/buscar' },
      { name: 'Semana', url: '/semana' },
    ],
    // "Compartir" desde otra app del móvil abre el formulario con el texto o el enlace
    share_target: {
      action: '/capturar',
      method: 'GET',
      params: { title: 'titulo', text: 'texto', url: 'url' },
    },
  };
}
