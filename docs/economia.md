# Economía

La página `/economia` y las cuotas de las tarjetas de cliente salen de las fichas de
cliente de la bóveda (`clientes/<cliente>/<cliente>.md`). La lógica está en `lib/economia.ts`.

## Qué se apunta

Las cuotas son **netas**: lo que cobra Facundo cada mes después de lo que el cliente paga
por su cuenta (dominio, alojamiento, planes de terceros).

### Una cuota que no ha cambiado

En las propiedades de la ficha:

```yaml
cuota_mensual: 60        # euros netos al mes
cuota_desde: 2026-03-01  # desde cuándo se cobra
cuota_hasta: 2026-12-31  # opcional: si deja de cobrarse
```

En Obsidian se rellenan desde el panel de propiedades de la nota: `cuota_mensual` como
número y `cuota_desde` como fecha.

### Una cuota que ha cambiado

En vez de las anteriores, una lista con cada tramo:

```yaml
cuotas:
  - importe: 40
    desde: 2025-11-01
  - importe: 60
    desde: 2026-04-01
```

Si dos tramos se solapan en el mes del cambio, cuenta el más reciente.

### Renovaciones

Lo que hay que renovar y el panel no averigua solo va en la sección «Renovaciones» de la
ficha, una línea por renovación con la fecha delante:

```markdown
## Renovaciones
- 2027-03-14 — Dominio vm-propiedades.es
- 2027-01-01 — Plan anual de Supabase Pro
```

Los dominios `.com` y `.net` no hace falta apuntarlos: su caducidad se consulta sola por
RDAP. Los `.es` sí, porque su registro no la publica.

## Qué calcula

| | Cómo |
|---|---|
| **Ingresos al mes** | Suma de las cuotas vigentes este mes |
| **Al año, a este ritmo** | Ingresos al mes × 12 |
| **Facturado este año** | Suma, mes a mes, de las cuotas de enero a hoy |
| **Clientes que pagan** | Con cuota mayor que 0 este mes |
| **Peso de cada cliente** | Su cuota entre el total. Si uno pasa del 50 %, se avisa: depender de un solo cliente es un riesgo |
| **Evolución** | Ingresos de cada mes desde la primera cuota, hasta 24 meses |
| **Acumulado por cliente** | Suma de sus cuotas desde el primer mes |

Todo es **facturado según las cuotas, no cobrado**: el panel no sabe si un cliente ha pagado.
Si hiciera falta controlar impagos, sería otra fase.

## Gráficos

Siguen la guía de visualización de datos del proyecto:

- **Evolución**: una sola serie, así que sin leyenda (la dice el título). Línea de 2 px,
  relleno al 10 %, el último valor rotulado y el resto consultable con el puntero o las
  flechas del teclado. Debajo, «Ver como tabla».
- **Reparto**: barras horizontales del mismo color (colorearlas por tamaño repetiría lo que
  dice la longitud), finas, con el valor en la punta.
- **Estados**: el verde y el rojo de estado no se distinguen con deuteranopía (ΔE 4,1 medido
  con el validador), así que un estado nunca va solo por color: siempre icono y texto, y en
  la franja de disponibilidad los días con incidencia son además más altos.
