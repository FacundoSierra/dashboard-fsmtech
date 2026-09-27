# Documentos de los clientes

Facturas, contratos, presupuestos y el material que pasan los clientes. Cada documento son dos cosas:

- **El archivo**, en un almacén privado de Vercel Blob. Nunca en la bóveda: lleva datos personales (nombres, NIF, direcciones), y Git guardaría para siempre cada versión en cada equipo con una copia del repo
- **Una nota en la bóveda** con sus datos, en `clientes/<cliente>/documentos/<AAAA-MM-DD>-<cliente>-<titulo>.md`. Así Obsidian, Claude y el panel saben qué documentos hay y se puede buscar por ellos

```markdown
---
tipo: documento
categoria: factura          # factura | contrato | presupuesto | material | otro
cliente: "[[vm-propiedades]]"
fecha: 2026-09-28
importe: 70                 # facturas y presupuestos, opcional
cobro: "2026-09"            # facturas: el mes del cobro que pagan, opcional
archivo: "clientes/vm-propiedades/2026-09-28-vm-propiedades-factura-septiembre-33c0138f1f43.pdf"
nombre_archivo: "Factura septiembre VM.pdf"
tamano: 193
origen: dashboard
---
# Factura de septiembre

📎 [Abrir el archivo en el panel](https://dashboard.facundosmtech.com/api/documentos?nota=…)
```

Es la forma de `templates/documento.md` de la bóveda. El enlace funciona desde Obsidian, también en el móvil: abre el panel, que pide la sesión.

## Categorías en vez de carpetas

Todos los documentos de un cliente van en la misma carpeta y se distinguen por `categoria`. La página `/documentos` filtra por cliente y por categoría, y no hay que decidir dónde va cada archivo.

## La factura de cada cobro

Una factura con `cobro: "AAAA-MM"` es la de ese mes de ese cliente. En Economía, cada cobro cobrado o pendiente enseña «Factura» (la abre) o «Sin factura» (lleva a subirla con el cliente, la categoría y el mes ya puestos). Si un mes tiene dos cobros, la cuota y un extra, una factura con importe solo va con el cobro de ese importe.

## Subir (`app/(panel)/documentos/acciones.ts`)

1. Comprueba la sesión y que el almacén está conectado
2. El archivo, de 4 MB como mucho: Vercel no admite peticiones de más de 4,5 MB a una función, y la Server Action tiene el límite en 5 MB para dejar sitio al formulario (`next.config.ts`)
3. **El tipo se comprueba por el contenido, no por el nombre** (`lib/documentos/archivos.ts`): PDF, PNG, JPEG, WebP, Word y Excel (nuevos y antiguos), texto, CSV y zip, y solo si sus primeros bytes son los de ese tipo. Un HTML o un SVG renombrados a `.pdf` y servidos desde el dominio del panel podrían ejecutar código con la sesión abierta
4. Guarda el archivo con un sufijo al azar, para que dos documentos con el mismo nombre nunca se pisen
5. Crea la nota con `crearNotaDocumento()`, una de las escrituras acotadas del panel (`docs/arquitectura.md`). **Si la nota no se puede crear, borra el archivo**: nunca queda un archivo que ninguna nota encuentre

## Abrir (`app/api/documentos/route.ts`)

`/api/documentos?nota=<ruta de la nota>` es el único camino a los archivos:

- Comprueba la sesión en la propia ruta, no solo en el proxy
- Solo sirve el archivo que dice la nota del documento, y solo si nota y archivo están en la carpeta de su cliente
- PDF e imágenes se abren en el navegador; el resto se descarga, y lo que no se reconoce va como `application/octet-stream`
- `Cache-Control: private, no-store`: ni la CDN ni el disco del navegador se quedan copia

## Montar el almacén

Una vez, en Vercel, en el proyecto del panel:

1. **Storage → Create Database → Blob**
2. Acceso **Private** (no se puede cambiar después) y región **Dublín (`dub1`)**, junto a las funciones del panel
3. Conectarlo al proyecto, en todos los entornos

Vercel añade `BLOB_STORE_ID` y se autentica con OIDC: no hay claves que copiar ni que se puedan filtrar. Para usarlo en local, `vercel env pull`, o mejor **`DOCUMENTOS_DIR`** con una carpeta del PC, igual que `BOVEDA_DIR` para las notas.

Sin almacén, la página de documentos lo dice y no deja subir nada.

## Lo que ya estaba en la bóveda

Los archivos que había en `clientes/*/documentos/` antes de esto siguen allí y se abren desde Obsidian: no se han movido ni borrado. Los nuevos, fuera de Git desde ya.
