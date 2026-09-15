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
    background_color: '#f6f6f3',
    theme_color: '#2563eb',
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
