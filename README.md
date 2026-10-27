# Dashboard FSMTECH

Panel privado que resume clientes, proyectos, objetivos diarios, la semana y las reuniones a partir de las notas de una bóveda de Obsidian. Vigila las webs, bases de datos y despliegues de los clientes, avisa al móvil cuando algo se cae, lleva la economía de las cuotas y genera informes mensuales de mantenimiento. Permite apuntar capturas rápidas en su inbox y se puede instalar en el móvil. Lleva también la consultoría financiera de OVB, con su propia base de datos (Supabase), porque lleva nombres de clientes y no puede ir en las notas.

## En local

```bash
npm ci
cp .env.example .env.local   # rellena DASHBOARD_PASSWORD, DASHBOARD_SECRET y BOVEDA_DIR
npm run dev
npm test                     # las reglas de la consultoría (node:test)
```

Abre http://localhost:3000 e introduce la contraseña. En local, las capturas se escriben directamente en `BOVEDA_DIR/inbox/`.

La sección Consultoría (`/consultoria`) necesita además `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env.local`, con la clave secreta `pc` (la de Vercel es otra). Sin ellas, el resto del panel funciona igual y la sección dice que falta configurar la base. Los scripts de la consultoría (`npm run consultoria:*`) leen las mismas dos variables; están en `CLAUDE.md`.

## Despliegue en Vercel

1. Importa este repo en Vercel (nunca el repo de notas). Framework Preset: Next.js.
2. Variables de entorno de Production:
   - `DASHBOARD_PASSWORD`
   - `DASHBOARD_SECRET` (32 caracteres o más)
   - `GITHUB_TOKEN`: token con permisos finos, solo para el repo de notas, con "Contents: Read and write". La escritura hace falta para la captura rápida.
   - `GITHUB_REPO`: `usuario/repo`
   - `GITHUB_BRANCH` (por defecto `main`)
   - `GITHUB_TOKEN_LECTURA`: token de solo lectura para los repos de código (estado, despliegues, informes)
   - `VIGILANCIA_SECRET`: secreto de la vigilancia horaria
   - `SUPABASE_URL` (`https://<ref>.supabase.co`) y `SUPABASE_SECRET_KEY` (la clave secreta `panel-vercel`, `sb_secret_…`): la base de la consultoría. **Solo en Production**, ni en Preview ni en Development, y sin el prefijo `NEXT_PUBLIC_`. Sin ellas, el panel arranca y la sección Consultoría dice que falta configurar la base
3. Añade el dominio en Settings → Domains y crea en el DNS el registro que indique Vercel.
4. Comprueba que sin sesión todas las rutas redirigen a `/login`, salvo el manifest y los iconos.

## Base de datos

Un proyecto de Supabase propio, `fsmtech` (West EU, Irlanda), cerrado a todo salvo al servidor del panel. Sus migraciones están en `supabase/migraciones/`, empezando por `0001_consultoria.sql`. **Las ejecuta Facundo** en el editor SQL de ese proyecto, después de que las revise el `revisor-migraciones`; nunca se ejecutan desde el código. Qué hay y por qué: [docs/base-de-datos.md](docs/base-de-datos.md).

## Instalar en el móvil
- **Android (Chrome):** menú ⋮ → "Instalar app". Aparece en "Compartir" como destino para enviar textos y enlaces al inbox.
- **iPhone (Safari):** Compartir → "Añadir a pantalla de inicio".

Arquitectura, escritura, caché y seguridad: [docs/arquitectura.md](docs/arquitectura.md).
Vigilancia, avisos e informes, y cómo ponerlos en marcha: [docs/vigilancia.md](docs/vigilancia.md).
Economía y formato de las cuotas: [docs/economia.md](docs/economia.md).
La consultoría en el panel: [docs/specs/req-001-consultoria-en-el-panel.md](docs/specs/req-001-consultoria-en-el-panel.md).
