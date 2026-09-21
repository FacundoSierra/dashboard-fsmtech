import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION, tokenValido } from '@/lib/firma';

/**
 * Comprobación optimista: sin sesión válida, cualquier ruta lleva a /login.
 * La comprobación fuerte está en `lib/sesion.ts`, junto a la lectura de notas.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const conSesion = await tokenValido(request.cookies.get(COOKIE_SESION)?.value);

  if (pathname === '/login') {
    return conSesion ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (conSesion) return NextResponse.next();

  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('desde', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

// Sin sesión solo pasa lo público y sin datos: estáticos de Next, robots.txt, el manifest y los iconos
// (el navegador pide manifest e iconos sin la cookie de sesión). Y `/api/vigilancia`, que no
// usa la cookie: se autentica con su propio secreto dentro de la ruta y falla cerrado.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icon|apple-icon|api/vigilancia$).*)'],
};
