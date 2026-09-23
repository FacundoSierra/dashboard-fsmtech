/** Solo rutas internas: evita que `?desde=//otra.com` mande a otra web al entrar */
export function destinoSeguro(valor: string | null | undefined): string {
  const destino = typeof valor === 'string' ? valor : '';
  if (!destino.startsWith('/') || destino.startsWith('//')) return '/';
  return destino.includes('\\') ? '/' : destino;
}
