@AGENTS.md

# Dashboard FSMTECH

Panel privado de Facundo Sierra Morales en https://dashboard.facundosmtech.com. Resume clientes, proyectos, objetivos diarios y reuniones leyendo las notas Markdown de su bóveda de Obsidian, que están en un repo privado de GitHub.

## Stack
- Next.js 16 (App Router, `proxy.ts`) + React 19 + TypeScript
- Tailwind CSS 4
- `yaml` para el frontmatter y `react-markdown` + `remark-gfm` para mostrar las notas

## Comandos
- Instalar: `npm ci`
- Desarrollo: `npm run dev` (lee las notas de `BOVEDA_DIR`, definido en `.env.local`)
- Lint: `npm run lint`
- Build: `npm run build`

## Estructura
- `proxy.ts`: sin sesión, cualquier ruta redirige a `/login`
- `lib/firma.ts`: token de sesión firmado con HMAC (Web Crypto)
- `lib/sesion.ts`: `verificarSesion()`, la comprobación fuerte
- `lib/boveda/`:
  - `fuente.ts`: carpeta local o API de GitHub;
  - `parser.ts`: frontmatter, secciones, tareas, enlaces y etiquetas;
  - `consultas.ts`: `obtenerBoveda()` y los resúmenes de hoy, clientes, proyectos y reuniones
- `app/login/`: formulario y Server Actions de sesión
- `app/(panel)/`: Hoy (`/`), `/clientes`, `/proyectos`, `/reuniones` y el lector `/nota/[...ruta]`
- `components/`: Markdown con `[[enlaces]]` de Obsidian, lista de tareas y piezas de UI

Detalle de datos, caché y seguridad en `docs/arquitectura.md`.

## Reglas
- Lee `AGENTS.md` antes de programar: esta versión de Next.js tiene cambios incompatibles con versiones anteriores
- Toda lectura de notas pasa por `obtenerBoveda()`, que llama a `verificarSesion()`. Nunca leer `lib/boveda/fuente.ts` directamente desde una página o una ruta
- Falla cerrado: sin `DASHBOARD_PASSWORD` y `DASHBOARD_SECRET` no se puede entrar
- El repo de notas no se despliega nunca: el panel lo lee con un token de solo lectura
- Si cambian las convenciones de las notas (secciones, propiedades), actualizar `lib/boveda/consultas.ts` y la tabla de `docs/arquitectura.md`
- Hacer push a `main` publica el panel
- Commits en español: `tipo(ámbito): descripción`
- Se trabaja desde Windows: no añadir dependencias ni archivos específicos de macOS
