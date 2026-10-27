# ADR-002: El panel entra en su base con una clave secreta que solo vive en el servidor, detrás de `verificarSesion()`

- Fecha: 2026-10-27
- Estado: aceptada
- Requerimiento: REQ-001

## Contexto
El panel tiene su propio acceso (contraseña o passkey, cookie firmada con HMAC) y **un solo usuario**. Nada del panel habla con una base desde el navegador: todo lo pinta el servidor. La base nueva (ADR-001) solo tiene datos del negocio de Facundo, y todos los datos que guarda son los que el panel enseña.

En la fase 6 del roadmap se rechazó meter en el panel «una clave que se salta todos los permisos». Era la clave de la base de FSM-Finance, que tiene las finanzas de los clientes de la aplicación: el panel habría podido leer datos que no son suyos. Aquí la situación es otra: la clave solo abre lo que el panel ya enseña entero.

Lo que hay en Supabase (supabase.com/docs/guides/api/api-keys, consultado el 2026-10-27):
- la **clave publicable** (`sb_publishable_…`) entra como `anon`, o como `authenticated` si lleva la sesión de un usuario de Supabase Auth;
- la **clave secreta** (`sb_secret_…`) entra como `service_role`, que se salta el RLS; **no funciona desde un navegador** (Supabase responde 401 por el `User-Agent`); se pueden crear varias y **borrar cada una por separado**.

## Decisión
- **Una clave secreta, solo en el servidor.** Un único archivo, `lib/base/cliente.ts` (`import 'server-only'`), lee `SUPABASE_URL` y `SUPABASE_SECRET_KEY` y exporta `baseDeDatos()`, que **llama a `verificarSesion()` antes de devolver el cliente**, igual que `obtenerBoveda()` con las notas. Ninguna página, acción ni ruta crea otro cliente ni lee la variable
- **Una clave por sitio**, para poder quitar una sin tocar la otra: `panel-vercel` en Vercel (solo Production) y `pc` en el `.env.local` del panel (el `npm run dev` y los scripts). Nunca en GitHub, ni en los secretos de Actions
- **La base, cerrada a todo lo demás**: RLS activo en todas las tablas **sin ninguna política**, ningún permiso para `anon` ni `authenticated`, las funciones solo para `service_role`, y los permisos por defecto de lo que se cree después, quitados. Si se filtra la clave publicable, no lee nada. El registro de usuarios, desactivado en Supabase Auth
- **Las funciones no usan `auth.uid()`** (con la clave secreta es nulo): «Ha llegado» y «Deshacer» reciben el consultor (`p_consultor`) y comprueban que existe. Los disparadores no cambian: ya valían para la clave de servicio de los scripts
- **`/api/vigilancia` no importa nunca `lib/base/`**: es la única ruta sin sesión del panel que lee datos

## Alternativas consideradas
- **Un usuario de Supabase Auth y RLS** (`consultor_id = auth.uid()`) — el RLS valdría de verdad, pero el panel tendría que guardar el correo y la contraseña de ese usuario en Vercel (con la passkey no hay contraseña que reenviar), entrar en Supabase en cada arranque y renovar el token en funciones que se duermen. Si se filtran las variables, se filtra lo mismo que con la clave: todos los datos de Facundo. Es más código y dos sesiones que se pueden desacompasar, para la misma protección. Vale la pena el día que el panel tenga más de un usuario o un navegador hable con la base
- **Un rol de Postgres limitado con conexión directa** (`pg` contra el pooler) — permisos más finos que `service_role`, pero una dependencia nueva, conexiones desde funciones que se duermen y reescribir en SQL todas las consultas de `supabase-js` el día que hay prisa
- **Firmar los JWT en el panel** — la llave que los firma serviría también para firmar uno de `service_role`: es peor que la clave secreta
- **Usar la clave de FSM-Finance** — es lo que se rechazó en la fase 6, y lo descarta ADR-001

## Consecuencias
- **La seguridad de la base es la del acceso al panel** más `verificarSesion()` en cada lectura y escritura: el RLS no para un fallo del código del panel. Por eso solo hay una puerta (`baseDeDatos()`), y la revisión de cada página o acción nueva mira que pase por ella
- Las Server Actions llaman a `verificarSesion()` **fuera de su `try`** (o con `unstable_rethrow`): su `redirect('/login')` se lanza como error, y un `catch` que lo tragara devolvería «no se ha podido guardar» en vez de llevar a la entrada
- Rotar es fácil: se crea una clave nueva, se cambia la variable, se redespliega y se borra la vieja (borrarla no se puede deshacer)
- Si algún día otra persona entra en el panel, este ADR se sustituye por el de Supabase Auth y RLS: las tablas ya llevan `consultor_id`
