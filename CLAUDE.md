@AGENTS.md

# Dashboard FSMTECH

Panel privado de Facundo Sierra Morales en https://dashboard.facundosmtech.com. Lee las notas Markdown de su bóveda de Obsidian, que están en un repo privado de GitHub, y resume clientes, proyectos, objetivos diarios, la semana y las reuniones. Vigila las webs, bases de datos y despliegues de los proyectos, lleva la economía de las cuotas, genera informes mensuales para los clientes y avisa al móvil de las caídas con una acción horaria de GitHub. También escribe en la bóveda, siempre acotado: capturas en el inbox, objetivos de la diaria (marcar, añadir, pasar a «A la espera»), cobros y renovaciones. Y guarda los documentos de los clientes (facturas, contratos) en un almacén privado, con una nota por documento en la bóveda. Se puede instalar en el móvil como app.

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
- `lib/passkeys/` y `app/api/passkeys/`: entrar con huella o cara (WebAuthn). `config.ts` lee los dispositivos de la variable `PASSKEYS` y saca el dominio de la petición; `reto.ts` guarda el reto en una cookie de cinco minutos
- `lib/sesion.ts`: `verificarSesion()`, la comprobación fuerte
- `lib/boveda/`:
  - Lectura: `fuente.ts` (carpeta local o API de GitHub) y `github.ts` (configuración y cabeceras)
  - Escritura: `escritura.ts` (todas las escrituras, cada una acotada), `lineas.ts` (secciones y líneas del texto crudo), `plantillas.ts` (notas nuevas con las plantillas de `templates/` de la bóveda), `diaria.ts` (monta la diaria igual que el script del PC) y `sincronizacion.ts` (cuándo subió el PC por última vez)
  - Análisis: `parser.ts` (frontmatter, secciones, tareas, enlaces y etiquetas)
  - Consultas: `consultas.ts` (`obtenerBoveda()`, hoy, clientes, proyectos, reuniones), `inbox.ts`, `busqueda.ts` y `semana.ts`
  - Formato de las capturas: `captura.ts`
- `lib/vigilancia/`: estado técnico de los proyectos activos
  - `webs.ts` (respuesta y certificado SSL), `supabase.ts` (base viva sin clave), `dominios.ts` (caducidad por RDAP), `github.ts` (commits, despliegues, pruebas, PR, alertas e incidencias)
  - `estado.ts`: `estadoGeneral()`, una vez por petición; `disponibilidad.ts`: franja de 30 días y porcentaje
  - `red.ts`: filtra las URLs antes de llamar a nada; `acceso.ts`: secreto de `/api/vigilancia`
  - `repos-locales.ts`: lee `dashboards/repos-locales.md`, que escribe la sincronización de la bóveda
- `lib/documentos/`: documentos de los clientes. `almacen.ts` (Vercel Blob privado, o `DOCUMENTOS_DIR` en local), `archivos.ts` (el tipo, por el contenido), `documentos.ts` (las notas `tipo: documento`) y `tipos.ts` (categorías y límites, también para el navegador)
- `lib/avisos.ts`: todo lo anterior convertido en avisos ordenados por gravedad
- `lib/economia.ts`: planes y cobros de cada cliente por año (lo acordado, lo que queda y lo cobrado), evolución y renovaciones
- `lib/informes.ts`: informe mensual de un cliente
- `app/api/documentos/`: el único camino a los archivos del almacén privado, con sesión
- `app/api/vigilancia/`: lo que consulta la vigilancia horaria (`.github/workflows/vigilancia.yml` + `scripts/sincronizar-avisos.mjs`)
- `app/login/`: formulario y Server Actions de sesión, con el botón de huella si hay dispositivos registrados
- `app/(panel)/ajustes/`: los dispositivos registrados y el alta de uno nuevo
- `app/(panel)/`: páginas del panel
  - Resúmenes: Hoy (`/`), `/semana`, `/clientes`, `/proyectos`, `/reuniones` e `/inbox`
  - Negocio: `/estado`, `/economia`, `/documentos`, `/informes` e `/informes/[cliente]`
  - Herramientas: `/buscar`, `/capturar`, `/crear` (cliente, reunión y requerimiento) y el lector `/nota/[...ruta]`
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx` y `app/iconos/[tamano]`: app instalable
- `components/`: sistema de diseño (`ui.tsx`), navegación (menú lateral y barra inferior), gráficos, avisos, Markdown con `[[enlaces]]` de Obsidian, lista de tareas e icono

Detalle de datos, escritura, caché, PWA y seguridad en `docs/arquitectura.md`. Vigilancia, avisos e informes en `docs/vigilancia.md`; economía en `docs/economia.md`; documentos en `docs/documentos.md`.

## Reglas
- Lee `AGENTS.md` antes de programar: esta versión de Next.js tiene cambios incompatibles con versiones anteriores
- Toda lectura de notas pasa por `obtenerBoveda()`, que llama a `verificarSesion()`. Nunca leer `lib/boveda/fuente.ts` directamente desde una página o una ruta
- La única excepción es `/api/vigilancia`, que no tiene sesión: usa `obtenerBovedaParaVigilancia()`, que exige la autorización de `autorizarVigilancia()`. No usarla en ningún otro sitio
- Los estados (bien, aviso, grave, crítico) llevan siempre icono y texto, nunca solo color: el verde y el rojo no se distinguen con deuteranopía. Usar `<Estado>` e `<IconoEstado>` de `components/ui.tsx`
- Nada de `Date.now()` al pintar (la regla de pureza de React lo marca): usar `estado.comprobado` como «ahora»
- Las URLs que salen de las notas pasan por `urlVigilable()` antes de llamarlas
- Cada Server Action que toque notas llama a `verificarSesion()` al empezar. No basta con el proxy: son endpoints POST propios
- El panel solo escribe lo que está en la tabla de `lib/boveda/escritura.ts` (y de `docs/arquitectura.md`): cada escritura acotada por ruta, sección y forma de línea, y solo si la línea que toca no ha cambiado. No añadir otras escrituras sin la misma acotación, ni ninguna que borre o reescriba una nota entera
- Marcar un objetivo cambia la casilla en su sitio, no mueve la línea a «Completado»: dos líneas añadidas a la vez al final de la misma sección, en el PC y en GitHub, paran la sincronización del PC
- Las notas nuevas se hacen siempre con su plantilla de la bóveda (`leerPlantilla()` + `rellenarPlantilla()`), nunca con un texto escrito en el código: si cambia la plantilla, el panel la sigue
- Si cambia cómo se monta la diaria, cambiarlo en `lib/boveda/diaria.ts` y en `.scripts/nota-diaria.ps1` de la bóveda: tienen que salir iguales
- Después de escribir, `updateTag('boveda')`. En Next 16, `revalidateTag` necesita un segundo argumento
- Falla cerrado: sin `DASHBOARD_PASSWORD` y `DASHBOARD_SECRET` no se puede entrar. Sin `PASSKEYS`, la entrada con huella responde 404 y solo queda la contraseña
- Los archivos de los documentos nunca van a la bóveda ni a Git: al almacén privado. Solo se abren por `/api/documentos`, que comprueba la sesión en la propia ruta. Los tipos se aceptan por su contenido, no por el nombre; no añadir tipos que el navegador pueda interpretar como página (HTML, SVG)
- La contraseña se queda siempre como respaldo de las passkeys: no quitarla
- El repo de notas no se despliega nunca: el panel lo usa con un token de permisos finos limitado a ese repo
- Si cambian las convenciones de las notas (secciones, propiedades), actualizar `lib/boveda/` y la tabla de `docs/arquitectura.md`
- Hacer push a `main` publica el panel
- Commits en español: `tipo(ámbito): descripción`
- Se trabaja desde Windows: no añadir dependencias ni archivos específicos de macOS
