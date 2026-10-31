@AGENTS.md

# Dashboard FSMTECH

Panel privado de Facundo Sierra Morales en https://dashboard.facundosmtech.com. Lee las notas Markdown de su bóveda de Obsidian, que están en un repo privado de GitHub, y resume clientes, proyectos, objetivos diarios, la semana y las reuniones. Vigila las webs, bases de datos y despliegues de los proyectos, lleva la economía de las cuotas, genera informes mensuales para los clientes y avisa al móvil de las caídas con una acción horaria de GitHub. También escribe en la bóveda, siempre acotado: capturas en el inbox, objetivos de la diaria (marcar, añadir, pasar a «A la espera»), cobros y renovaciones. Y guarda los documentos de los clientes (facturas, contratos) en un almacén privado, con una nota por documento en la bóveda. Se puede instalar en el móvil como app.

Desde REQ-001 tiene además su propia base de datos, `fsmtech` (Supabase), para la consultoría financiera de OVB, que no puede ir en notas porque lleva nombres de clientes (ADR-001). Desde el 2026-10-27 (13:27, `fuente_desde` puesto) la consultoría se lleva aquí, y FSM-Finance conserva su copia en solo lectura hasta que se le quite (`docs/specs/req-001-consultoria-en-el-panel.md`, 6.4). Lo que queda de REQ-001, en la sección 13 de esa spec.

## Stack
- Next.js 16 (App Router, `proxy.ts`) + React 19 + TypeScript
- Tailwind CSS 4
- `yaml` para el frontmatter y `react-markdown` + `remark-gfm` para mostrar las notas
- `lucide-react` para los iconos. Los gráficos son SVG y HTML propios, sin librería
- `@supabase/supabase-js`, **solo en el servidor** y solo para la base de la consultoría (sin `@supabase/ssr`: nadie entra en Supabase Auth)
- Pruebas con `node:test` de Node, sin dependencias: Node quita los tipos de los `.ts` que importan

## Comandos
- Instalar: `npm ci`
- Desarrollo: `npm run dev` (lee y escribe las notas en `BOVEDA_DIR`, definido en `.env.local`)
- Lint: `npm run lint`
- Build: `npm run build`
- Pruebas: `npm test` (`lib/**/*.test.mjs`: las reglas de la consultoría, `textoParaPanel()` del parser y `partesEspera()`, con `node:test`; Node 22.18 o más)
- Consultoría (REQ-001), en este repo. **Sin `--guardar` solo enseñan lo que harían**, y la vista previa funciona aunque falten las variables, la `0001` o la copia (con los valores de serie). **Su salida lleva nombres de clientes**: se lee en la terminal y no se copia a ninguna nota (a las notas, como mucho, la línea de la liquidación, que no los lleva). Leen `SUPABASE_URL` y `SUPABASE_SECRET_KEY` del `.env.local` del panel y no tienen `--consultor`: hay uno solo
  - `npm run consultoria:copiar -- --origen <ruta al .env.local de FSM-Finance> [--guardar] [--exportar <archivo.json>]` — copia la consultoría de FSM-Finance (solo la lee) y compara las dos bases lado a lado, sin nombres. `--guardar` solo **antes** del cambio y en una base vacía: hoy el script se niega, porque `fuente_desde` ya está puesto. `--exportar` escribe las filas de origen en un JSON y se niega dentro de un repo con remoto que no lo ignore. Sale con 1 si algo es distinto, también en vista previa
  - `npm run consultoria:firma -- --cliente … --compania … --producto … --aportacion … --fecha AAAA-MM-DD [--duracion N] [--unidades N] [--unidades-nivel N] [--pago …] [--unica] [--apex [--de-mes AAAA-MM]] [--propio] [--tipo …] [--pct-hucha N] [--estado …] [--referencia …] [--mes-produccion AAAA-MM] [--efecto AAAA-MM-DD] [--cobro AAAA-MM] [--valor-unidad N] [--nota …] [--repetida] [--guardar]` — una firma, con las reglas de la pantalla. Para probar sin base: `--calendario`, `--produccion` y `--unidades-previas`, que con `--guardar` no valen
  - `npm run consultoria:importar -- <carpeta|archivo.json> [--unidades-previas N] [--hucha-inicial N] [--aceptar-diferencias] [--guardar]` — las notas de producción o el histórico `ovb-liquidaciones-v1`; relanzarlo no duplica
  - `npm run consultoria:cierres -- <nota-del-calendario.md> [--guardar]` — los cierres de OVB de un año
  - **Con `--guardar`, `firma`, `importar` y `cierres` paran si `fuente_desde` es nulo** («La consultoría aún se lleva en FSM-Finance»), y también sin variables, sin la `0001` o sin la copia. Desde el 2026-10-27 ya está puesto y guardan con normalidad
  - Todos paran siempre, también en vista previa, si `SUPABASE_URL` no es `https` o apunta a una base con `perfiles` (la de FSM-Finance u otra)

## Estructura
- `proxy.ts`: sin sesión, redirige a `/login` todo salvo lo público y sin datos (estáticos, `robots.txt`, manifest e iconos)
- `lib/firma.ts`: token de sesión firmado con HMAC (Web Crypto)
- `lib/passkeys/` y `app/api/passkeys/`: entrar con huella o cara (WebAuthn). `config.ts` lee los dispositivos de la variable `PASSKEYS` y saca el dominio de la petición; `reto.ts` guarda el reto en una cookie de cinco minutos
- `lib/sesion.ts`: `verificarSesion()`, la comprobación fuerte
- `lib/boveda/`:
  - Lectura: `fuente.ts` (carpeta local o API de GitHub) y `github.ts` (configuración y cabeceras)
  - Escritura: `escritura.ts` (todas las escrituras, cada una acotada), `lineas.ts` (secciones y líneas del texto crudo), `plantillas.ts` (notas nuevas con las plantillas de `templates/` de la bóveda), `diaria.ts` (monta la diaria igual que el script del PC) y `sincronizacion.ts` (cuándo subió el PC por última vez)
  - Análisis: `parser.ts` (frontmatter, secciones, tareas, enlaces y etiquetas; `textoParaPanel()` quita al pintar el emoji inicial, el de una sección citada («✅ Completado» → «Completado») y `#prioridad/*`) y `espera.ts` (`partesEspera()`: una tarea de «A la espera» partida en qué, quién y desde cuándo; sin importaciones, con su prueba `espera.test.mjs`)
  - Consultas: `consultas.ts` (`obtenerBoveda()`, hoy, clientes, proyectos, reuniones), `inbox.ts`, `busqueda.ts` y `semana.ts`
  - Formato de las capturas: `captura.ts`
- `lib/vigilancia/`: estado técnico de los proyectos activos
  - `webs.ts` (respuesta y certificado SSL), `supabase.ts` (base viva sin clave), `dominios.ts` (caducidad por RDAP), `github.ts` (commits, despliegues, pruebas, PR, alertas e incidencias)
  - `estado.ts`: `estadoGeneral()`, una vez por petición; `disponibilidad.ts`: franja de 30 días y porcentaje
  - `red.ts`: filtra las URLs antes de llamar a nada; `acceso.ts`: secreto de `/api/vigilancia`
  - `repos-locales.ts`: lee `dashboards/repos-locales.md`, que escribe la sincronización de la bóveda
- `lib/documentos/`: documentos de los clientes. `almacen.ts` (Vercel Blob privado, o `DOCUMENTOS_DIR` en local), `archivos.ts` (el tipo, por el contenido), `documentos.ts` (las notas `tipo: documento`) y `tipos.ts` (categorías y límites, también para el navegador)
- `lib/avisos.ts`: todo lo anterior convertido en avisos ordenados por gravedad
- `lib/economia.ts`: planes y cobros de cada cliente por año (lo acordado, lo que queda y lo cobrado), los gastos del negocio (`negocio/gastos-fsmtech.md`), el balance del año, la evolución y las renovaciones
- `lib/informes.ts`: informe mensual de un cliente
- `lib/base/cliente.ts`: **la única puerta a la base de datos** del panel. `baseDeDatos()` llama a `verificarSesion()` y devuelve el cliente de Supabase con la clave secreta (uno por proceso, sin sesión de Auth, sin caché de `fetch`); `hayBase()` dice si están las variables; `BaseSinConfigurar` si faltan
- `lib/consultoria/`: la consultoría de OVB (REQ-001), mudada de FSM-Finance
  - `reglas.ts` (las reglas de cobro) y `cuadro.ts` (el cuadro de comisiones), con sus pruebas `reglas.test.mjs` y `apex.test.mjs`
  - `consultas.ts` (lo que leen las pantallas), `acciones.ts` (`"use server"`, lo que escriben), `tipos.ts` (solo tipos, también para el navegador) y `validar.ts` (lo que llega del navegador)
  - `sesion.ts`: `exigirConsultoria()`, la puerta de la sección: el consultor y `fuenteDesde`, o qué falta (`configuracion`, `0001` o `copia`)
  - `calendario.ts` y `formato.ts`: las funciones de fechas e importes de FSM-Finance que usa, copiadas tal cual
- `components/consultoria/`: las pantallas de la consultoría, con los mismos nombres de archivo que en FSM-Finance
- `scripts/consultoria-*.mjs`: `comun` (lo compartido), `copiar`, `firma`, `importar` y `cierres` (ver Comandos)
- `supabase/migraciones/`: las migraciones de la base, desde `0001_consultoria.sql`. Detalle en `docs/base-de-datos.md`
- `lib/portales.ts`: los paneles propios (FSM-Finance, el de DF…) de `dashboards/portales.md`, abajo a la derecha en Hoy («Tus paneles») y en la barra de órdenes
- `app/api/documentos/`: el único camino a los archivos del almacén privado, con sesión
- `app/api/vigilancia/`: lo que consulta la vigilancia horaria (`.github/workflows/vigilancia.yml` + `scripts/sincronizar-avisos.mjs`)
- `app/login/`: formulario y Server Actions de sesión, con el botón de huella si hay dispositivos registrados
- `app/(panel)/ajustes/`: los dispositivos registrados y el alta de uno nuevo
- `app/(panel)/`: páginas del panel
  - Resúmenes: Hoy (`/`), `/semana`, `/clientes`, `/proyectos`, `/reuniones` e `/inbox`
  - Negocio: `/estado`, `/economia`, `/consultoria` (Resumen, Clientes, Producción, Liquidaciones, Hucha y Ajustes, en `app/(panel)/consultoria/`), `/documentos`, `/informes` e `/informes/[cliente]`
  - Herramientas: `/buscar`, `/capturar`, `/crear` (cliente, reunión y requerimiento) y el lector `/nota/[...ruta]`
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/iconos/[tamano]` (el `any`) y `app/iconos/maskable`: app instalable. El dibujo, en `components/icono-app.tsx`
- `components/barra-ordenes.tsx` y `app/(panel)/ordenes.ts`: la barra de órdenes (`Ctrl+K`, `⌘K` en Mac): ir a una sección o nota, «objetivo …», «cobrado …» y «apuntar [tarea|idea|nota] …» (abre `/capturar?tipo=`). Sus datos se piden al abrirla y lo que escribe pasa por las mismas Server Actions que los botones
- `components/hoy/`: las tarjetas de Hoy, una por archivo: `cabecera`, `cifras` (las cuatro `Kpi` de arriba), `semana` (la semana en barras), `medidor` (el avance del día), `reunion` (la de hoy o la siguiente), `requerimientos` (las peticiones abiertas), `cobrar` (la tarjeta oscura de «Por cobrar»), `espera` (por persona), `objetivos`, `avisos`, `columna` (inbox y «Tus paneles») y `nuevo-objetivo`. La página (`app/(panel)/page.tsx`) las coloca en una rejilla de doce columnas
- `components/piezas.tsx`: lo pequeño que repiten las tarjetas: el rayado (`PatronRayado`, `Rayado`, `Muestra`) y el círculo con la inicial (`Avatar`, con seis tintes). `components/plegable.tsx`: lo que se guarda plegado (`details`)
- `components/`: sistema de diseño (`ui.tsx`: `Tarjeta`, `Kpi`, `FlechaTarjeta`, `EstadoPildora`; los colores y los radios, en `app/globals.css`) y las clases comunes de toque y botones (`estilos.ts`, 44 px como mínimo), `dialogo.ts` (`useDialogo`: foco, Esc y Tab de los diálogos), navegación (menú lateral y barra inferior), buscadores (`buscador-cabecera.tsx`, y `buscar-lo-que-falta.tsx` para las notas que no existen), `filtro-desplegable.tsx`, gráficos, avisos, Markdown con `[[enlaces]]` de Obsidian (con el título de la nota si no llevan alias) y las vistas `.base` de requerimientos, reuniones y proyectos pintadas como listas, lista de tareas e icono
- `app/not-found.tsx` y `app/(panel)/not-found.tsx`: las direcciones que no existen; la del panel ofrece buscar la nota que falta

Detalle de datos, escritura, caché, PWA y seguridad en `docs/arquitectura.md`. Vigilancia, avisos e informes en `docs/vigilancia.md`; economía en `docs/economia.md`; documentos en `docs/documentos.md`; la base de datos en `docs/base-de-datos.md`, y la consultoría en `docs/specs/req-001-consultoria-en-el-panel.md`.

## Reglas
- Lee `AGENTS.md` antes de programar: esta versión de Next.js tiene cambios incompatibles con versiones anteriores
- Toda lectura de notas pasa por `obtenerBoveda()`, que llama a `verificarSesion()`. Nunca leer `lib/boveda/fuente.ts` directamente desde una página o una ruta
- La única excepción es `/api/vigilancia`, que no tiene sesión: usa `obtenerBovedaParaVigilancia()`, que exige la autorización de `autorizarVigilancia()`. No usarla en ningún otro sitio
- Los estados (bien, aviso, grave, crítico) llevan siempre icono y texto, nunca solo color: el verde y el rojo no se distinguen con deuteranopía. Usar `<Estado>`, `<EstadoPildora>` e `<IconoEstado>` de `components/ui.tsx`
- Nada de `Date.now()` al pintar (la regla de pureza de React lo marca): usar `estado.comprobado` como «ahora»
- Las URLs que salen de las notas pasan por `urlVigilable()` antes de llamarlas
- Cada Server Action que toque notas llama a `verificarSesion()` al empezar. No basta con el proxy: son endpoints POST propios
- El panel solo escribe lo que está en la tabla de `lib/boveda/escritura.ts` (y de `docs/arquitectura.md`): cada escritura acotada por ruta, sección y forma de línea, y solo si la línea que toca no ha cambiado. No añadir otras escrituras sin la misma acotación, ni ninguna que borre o reescriba una nota entera
- **La consultoría no escribe en la bóveda**: escribe en su base, con `lib/consultoria/acciones.ts`. La casilla de OVB de los cobros, sin nombres, la sigue escribiendo Claude
- Marcar un objetivo cambia la casilla en su sitio, no mueve la línea a «Completado»: dos líneas añadidas a la vez al final de la misma sección, en el PC y en GitHub, paran la sincronización del PC
- Las notas nuevas se hacen siempre con su plantilla de la bóveda (`leerPlantilla()` + `rellenarPlantilla()`), nunca con un texto escrito en el código: si cambia la plantilla, el panel la sigue
- Si cambia cómo se monta la diaria, cambiarlo en `lib/boveda/diaria.ts` y en `.scripts/nota-diaria.ps1` de la bóveda: tienen que salir iguales
- Después de escribir, `updateTag('boveda')`. En Next 16, `revalidateTag` necesita un segundo argumento
- Falla cerrado: sin `DASHBOARD_PASSWORD` y `DASHBOARD_SECRET` no se puede entrar. Sin `PASSKEYS`, la entrada con huella responde 404 y solo queda la contraseña
- Los archivos de los documentos nunca van a la bóveda ni a Git: al almacén privado. Solo se abren por `/api/documentos`, que comprueba la sesión en la propia ruta. Los tipos se aceptan por su contenido, no por el nombre; no añadir tipos que el navegador pueda interpretar como página (HTML, SVG)
- La contraseña se queda siempre como respaldo de las passkeys: no quitarla
- El repo de notas no se despliega nunca: el panel lo usa con un token de permisos finos limitado a ese repo
- Si cambian las convenciones de las notas (secciones, propiedades), actualizar `lib/boveda/` y la tabla de `docs/arquitectura.md`
- **La base de datos, solo por `baseDeDatos()`** (`lib/base/cliente.ts`), que comprueba la sesión antes de dar el cliente: la clave secreta se salta el RLS, así que esa comprobación es la que protege los datos (ADR-002). Es el único archivo que lee `SUPABASE_SECRET_KEY` (comprobación: `grep -r SUPABASE_SECRET_KEY app components lib`). Nunca lo importan `/api/vigilancia`, `lib/avisos.ts`, `lib/informes.ts` ni `lib/boveda/`. Ninguna variable de la base lleva `NEXT_PUBLIC_`
- **Los nombres de los clientes de la consultoría no salen de la base**: ni a notas, ni a avisos, ni a informes, ni a la barra de órdenes (solo el enlace a la sección). En el log, solo `code` y `message` de Postgres, nunca `details` ni filas. En la consultoría, nada de `'use cache'`, `unstable_cache` ni `fetch` en caché: solo `cache()` de React, por petición
- Las Server Actions de la consultoría llaman a `verificarSesion()` **fuera del `try`** (y el `catch` empieza con `unstable_rethrow`): si no, el `redirect('/login')` se traga y sale «no se ha podido guardar»
- **Con `fuente_desde` nulo no se escribe en la consultoría**: las acciones devuelven «La consultoría aún se lleva en FSM-Finance» y los scripts con `--guardar` paran. Está puesto desde el 2026-10-27, así que hoy se escribe; la comprobación se queda como protección. `fuente_desde` solo lo cambia Facundo, como `postgres`: la clave secreta no puede, y ningún código hace `update` de `consultoria_consultores`
- **Migraciones** en `supabase/migraciones/NNNN_titulo.sql`: las ejecuta Facundo en el editor SQL de `fsmtech`, después del `revisor-migraciones`, nunca un agente. Cada tabla nueva, con RLS activo y `grant` solo a `service_role`; cada función nueva, con su `revoke … from public` (el `alter default privileges` de la `0001` no lo quita) y su `grant` a quien toque. Tablas con el prefijo de su módulo (`consultoria_*`), dinero en `numeric(12,2)` y fechas contables en `date` (ADR-001)
- `lib/consultoria/reglas.ts` y `cuadro.ts`: **sin importaciones en tiempo de ejecución** (los cargan Next y los scripts de Node) y solo sintaxis que se pueda borrar (`erasableSyntaxOnly`). Importes en enteros. **Un porcentaje 0 es un valor**: `??`, nunca `||`. Un cuadro de comisiones nuevo es un cambio de `cuadro.ts` y de sus pruebas
- **Aspecto**: islas grises (`--fondo`) con tarjetas blancas (`--superficie`) de 20 px (`rounded-xl`), sin borde ni sombra; solo flota lo que flota de verdad (menús, diálogos). La tarjeta azul (`.tema-marca`) es la primera cifra de cada pantalla, y la oscura (`.tema-oscuro`), el acento de la pantalla, una como mucho. Botones y campos de una línea, en píldora. Colores y radios, solo desde `app/globals.css`, sin colores fijos. Letra: Plus Jakarta Sans con `next/font` (`--font-jakarta`). Más en «Aspecto» de `docs/arquitectura.md`
- **Datos y estados no se mezclan**: los datos van en la escala de azules (`serie` para lo hecho, `serie-fuerte` para hoy, `rayado` para lo que falta). Los colores de estado, solo para estados y siempre con icono y texto; en las franjas, solo lo que va mal lleva su tono, y además es más alto
- **`Kpi` es una subrejilla de tres filas** (nombre, cifra y detalle): va en una rejilla que las contenga, y lo que comparta rejilla con las cifras necesita `row-span-3`
- Hacer push a `main` publica el panel
- Commits en español: `tipo(ámbito): descripción`
- Se trabaja desde Windows: no añadir dependencias ni archivos específicos de macOS
