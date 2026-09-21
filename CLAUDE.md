@AGENTS.md

# Dashboard FSMTECH

Panel privado de Facundo Sierra Morales en https://dashboard.facundosmtech.com. Lee las notas Markdown de su bóveda de Obsidian, que están en un repo privado de GitHub, y resume clientes, proyectos, objetivos diarios, la semana y las reuniones. Vigila las webs, bases de datos y despliegues de los proyectos, lleva la economía de las cuotas, genera informes mensuales para los clientes y avisa al móvil de las caídas con una acción horaria de GitHub. También permite apuntar capturas rápidas en el inbox de la bóveda. Se puede instalar en el móvil como app.

## Stack
- Next.js 16 (App Router, `proxy.ts`) + React 19 + TypeScript
- Tailwind CSS 4
- `yaml` para el frontmatter y `react-markdown` + `remark-gfm` para mostrar las notas
- `lucide-react` para los iconos. Los gráficos son SVG y HTML propios, sin librería

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
- `lib/vigilancia/`: estado técnico de los proyectos activos
  - `webs.ts` (respuesta y certificado SSL), `supabase.ts` (base viva sin clave), `dominios.ts` (caducidad por RDAP), `github.ts` (commits, despliegues, pruebas, PR, alertas e incidencias)
  - `estado.ts`: `estadoGeneral()`, una vez por petición; `disponibilidad.ts`: franja de 30 días y porcentaje
  - `red.ts`: filtra las URLs antes de llamar a nada; `acceso.ts`: secreto de `/api/vigilancia`
  - `repos-locales.ts`: lee `dashboards/repos-locales.md`, que escribe la sincronización de la bóveda
- `lib/avisos.ts`: todo lo anterior convertido en avisos ordenados por gravedad
- `lib/economia.ts`: cuotas netas de las fichas de cliente, ingresos, evolución y renovaciones
- `lib/informes.ts`: informe mensual de un cliente
- `app/api/vigilancia/`: lo que consulta la vigilancia horaria (`.github/workflows/vigilancia.yml` + `scripts/sincronizar-avisos.mjs`)
- `app/login/`: formulario y Server Actions de sesión
- `app/(panel)/`: páginas del panel
  - Resúmenes: Hoy (`/`), `/semana`, `/clientes`, `/proyectos`, `/reuniones` e `/inbox`
  - Negocio: `/estado`, `/economia`, `/informes` e `/informes/[cliente]`
  - Herramientas: `/buscar`, `/capturar` y el lector `/nota/[...ruta]`
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx` y `app/iconos/[tamano]`: app instalable
- `components/`: sistema de diseño (`ui.tsx`), navegación (menú lateral y barra inferior), gráficos, avisos, Markdown con `[[enlaces]]` de Obsidian, lista de tareas e icono

Detalle de datos, escritura, caché, PWA y seguridad en `docs/arquitectura.md`. Vigilancia, avisos e informes en `docs/vigilancia.md`; economía en `docs/economia.md`.

## Reglas
- Lee `AGENTS.md` antes de programar: esta versión de Next.js tiene cambios incompatibles con versiones anteriores
- Toda lectura de notas pasa por `obtenerBoveda()`, que llama a `verificarSesion()`. Nunca leer `lib/boveda/fuente.ts` directamente desde una página o una ruta
- La única excepción es `/api/vigilancia`, que no tiene sesión: usa `obtenerBovedaParaVigilancia()`, que exige la autorización de `autorizarVigilancia()`. No usarla en ningún otro sitio
- Los estados (bien, aviso, grave, crítico) llevan siempre icono y texto, nunca solo color: el verde y el rojo no se distinguen con deuteranopía. Usar `<Estado>` e `<IconoEstado>` de `components/ui.tsx`
- Nada de `Date.now()` al pintar (la regla de pureza de React lo marca): usar `estado.comprobado` como «ahora»
- Las URLs que salen de las notas pasan por `urlVigilable()` antes de llamarlas
- Cada Server Action que toque notas llama a `verificarSesion()` al empezar. No basta con el proxy: son endpoints POST propios
- El panel solo escribe con `crearNotaInbox()`: notas nuevas en `inbox/`, sin sobrescribir ni borrar nada
- Después de escribir, `updateTag('boveda')`. En Next 16, `revalidateTag` necesita un segundo argumento
- Falla cerrado: sin `DASHBOARD_PASSWORD` y `DASHBOARD_SECRET` no se puede entrar
- El repo de notas no se despliega nunca: el panel lo usa con un token de permisos finos limitado a ese repo
- Si cambian las convenciones de las notas (secciones, propiedades), actualizar `lib/boveda/` y la tabla de `docs/arquitectura.md`
- Hacer push a `main` publica el panel
- Commits en español: `tipo(ámbito): descripción`
- Se trabaja desde Windows: no añadir dependencias ni archivos específicos de macOS
