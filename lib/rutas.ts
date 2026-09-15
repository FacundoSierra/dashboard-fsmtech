/** `proyectos/cjfit-app/cjfit-app.md` → `/nota/proyectos/cjfit-app/cjfit-app` */
export function hrefNota(ruta: string): string {
  return `/nota/${ruta.replace(/\.md$/i, '').split('/').map(encodeURIComponent).join('/')}`;
}
