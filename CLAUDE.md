@AGENTS.md

# Dashboard FSMTECH

Panel privado de Facundo Sierra Morales en https://dashboard.facundosmtech.com. Lee las notas Markdown de su bóveda de Obsidian, que están en un repo privado de GitHub, y resume clientes, proyectos, objetivos diarios, la semana y las reuniones. También permite apuntar capturas rápidas en el inbox de la bóveda. Se puede instalar en el móvil como app.

## Stack
- Next.js 16 (App Router, `proxy.ts`) + React 19 + TypeScript
- Tailwind CSS 4
- `yaml` para el frontmatter y `react-markdown` + `remark-gfm` para mostrar las notas

## Comandos
- Instalar: `npm ci`
- Desarrollo: `npm run dev` (lee y escribe las notas en `BOVEDA_DIR`, definido en `.env.local`)
- Lint: `npm run lint`
- Build: `npm run build`

## Estructura
- `proxy.ts`: sin sesión, redirige a `/login` todo salvo lo público y sin datos (estáticos, `robots.txt`, manifest e iconos)
- `lib/firma.ts`: token de sesión firmado con HMAC (Web Crypto)
- `lib/sesion.ts`: `verificarSesion()`, la comprobación fuerte
- `lib/boveda/`:
  - Lectura: `fuente.ts` (carpeta local o API de GitHub) y `github.ts` (configuración y cabeceras)
  - Escritura: `escritura.ts`, que solo crea notas nuevas en `inbox/`
  - Análisis: `parser.ts` (frontmatter, secciones, tareas, enlaces y etiquetas)
  - Consultas: `consultas.ts` (`obtenerBoveda()`, hoy, clientes, proyectos, reuniones), `inbox.ts`, `busqueda.ts` y `semana.ts`
  - Formato de las capturas: `captura.ts`
- `app/login/`: formulario y Server Actions de sesión
- `app/(panel)/`: páginas del panel
  - Resúmenes: Hoy (`/`), `/semana`, `/clientes`, `/proyectos`, `/reuniones` e `/inbox`
  - Herramientas: `/buscar`, `/capturar` y el lector `/nota/[...ruta]`
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx` y `app/iconos/[tamano]`: app instalable
- `components/`: Markdown con `[[enlaces]]` de Obsidian, lista de tareas, navegación e icono

Detalle de datos, escritura, caché, PWA y seguridad en `docs/arquitectura.md`.

## Reglas
- Lee `AGENTS.md` antes de programar: esta versión de Next.js tiene cambios incompatibles con versiones anteriores
- Toda lectura de notas pasa por `obtenerBoveda()`, que llama a `verificarSesion()`. Nunca leer `lib/boveda/fuente.ts` directamente desde una página o una ruta
- Cada Server Action que toque notas llama a `verificarSesion()` al empezar. No basta con el proxy: son endpoints POST propios
- El panel solo escribe con `crearNotaInbox()`: notas nuevas en `inbox/`, sin sobrescribir ni borrar nada
- Después de escribir, `updateTag('boveda')`. En Next 16, `revalidateTag` necesita un segundo argumento
- Falla cerrado: sin `DASHBOARD_PASSWORD` y `DASHBOARD_SECRET` no se puede entrar
- El repo de notas no se despliega nunca: el panel lo usa con un token de permisos finos limitado a ese repo
- Si cambian las convenciones de las notas (secciones, propiedades), actualizar `lib/boveda/` y la tabla de `docs/arquitectura.md`
- Hacer push a `main` publica el panel
- Commits en español: `tipo(ámbito): descripción`
- Se trabaja desde Windows: no añadir dependencias ni archivos específicos de macOS
