# Dashboard FSMTECH

Panel privado que resume clientes, proyectos, objetivos diarios, la semana y las reuniones a partir de las notas de una bóveda de Obsidian. Permite apuntar capturas rápidas en su inbox y se puede instalar en el móvil.

## En local

```bash
npm ci
cp .env.example .env.local   # rellena DASHBOARD_PASSWORD, DASHBOARD_SECRET y BOVEDA_DIR
npm run dev
```

Abre http://localhost:3000 e introduce la contraseña. En local, las capturas se escriben directamente en `BOVEDA_DIR/inbox/`.

## Despliegue en Vercel

1. Importa este repo en Vercel (nunca el repo de notas). Framework Preset: Next.js.
2. Variables de entorno de Production:
   - `DASHBOARD_PASSWORD`
   - `DASHBOARD_SECRET` (32 caracteres o más)
   - `GITHUB_TOKEN`: token con permisos finos, solo para el repo de notas, con "Contents: Read and write". La escritura hace falta para la captura rápida.
   - `GITHUB_REPO`: `usuario/repo`
   - `GITHUB_BRANCH` (por defecto `main`)
3. Añade el dominio en Settings → Domains y crea en el DNS el registro que indique Vercel.
4. Comprueba que sin sesión todas las rutas redirigen a `/login`, salvo el manifest y los iconos.

## Instalar en el móvil
- **Android (Chrome):** menú ⋮ → "Instalar app". Aparece en "Compartir" como destino para enviar textos y enlaces al inbox.
- **iPhone (Safari):** Compartir → "Añadir a pantalla de inicio".

Arquitectura, escritura, caché y seguridad: [docs/arquitectura.md](docs/arquitectura.md).
