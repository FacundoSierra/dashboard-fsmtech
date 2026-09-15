# Dashboard FSMTECH

Panel privado que resume clientes, proyectos, objetivos diarios y reuniones a partir de las notas de una bóveda de Obsidian.

## En local

```bash
npm ci
cp .env.example .env.local   # rellena DASHBOARD_PASSWORD, DASHBOARD_SECRET y BOVEDA_DIR
npm run dev
```

Abre http://localhost:3000 e introduce la contraseña.

## Despliegue en Vercel

1. Importa este repo en Vercel (nunca el repo de notas).
2. Variables de entorno de Production:
   - `DASHBOARD_PASSWORD`
   - `DASHBOARD_SECRET` (32 caracteres o más)
   - `GITHUB_TOKEN`: token con permisos finos, solo para el repo de notas, con "Contents" en solo lectura
   - `GITHUB_REPO`: `usuario/repo`
   - `GITHUB_BRANCH` (por defecto `main`)
3. Añade el dominio `dashboard.facundosmtech.com` en Settings → Domains y crea el registro que indique Vercel en el DNS del dominio.
4. Comprueba que sin sesión todas las rutas redirigen a `/login`.

Arquitectura, caché y seguridad: [docs/arquitectura.md](docs/arquitectura.md).
