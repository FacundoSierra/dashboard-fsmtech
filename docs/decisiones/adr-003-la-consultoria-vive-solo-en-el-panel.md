# ADR-003: La consultoría vive solo en el panel: un cambio con fecha, y FSM-Finance congelada hasta quitarla

- Fecha: 2026-10-27
- Estado: aceptada
- Requerimiento: REQ-001

## Contexto
La consultoría está hoy en FSM-Finance, con datos reales y sin base de pruebas: las reglas de cobro (`reglas.ts`), el cuadro de comisiones (`cuadro.ts`), sus pruebas, las pantallas, los scripts y diez tablas. Se muda al panel (ADR-001), con un plazo: la liquidación de octubre de OVB (n.º 6) llega hacia el 2026-10-28, y Facundo quiere marcarla ya en el panel. Si no da tiempo, la marca en FSM-Finance y la copia la lleva después.

El riesgo de una mudanza así es acabar con **dos verdades**: firmas apuntadas en los dos sitios, o unas reglas que cambian en un repo y no en el otro.

## Decisión
- **El código se mueve, no se comparte.** `reglas.ts`, `cuadro.ts` y sus pruebas pasan a `lib/consultoria/` del panel y desde el cambio solo se tocan allí. FSM-Finance no recibe ningún cambio de la consultoría (ni las tareas de las unidades) y la pierde entera al final. Un paquete compartido entre los dos repos se descarta: la consultoría deja de existir en FSM-Finance
- **Los datos se copian con un script que se puede repetir desde cero** (`consultoria:copiar`): conserva los `id`, respeta el orden que piden los disparadores y compara las cifras de las dos bases, antes y después. Mientras la base nueva no sea la fuente, se vacía y se vuelve a copiar cuantas veces haga falta
- **El cambio es un momento explícito, en las dos bases**:
  - en FSM-Finance, la migración `0017_consultoria_solo_lectura.sql` quita los permisos de escritura de las tablas `consultoria_*` y de «Ha llegado» y «Deshacer». Se deshace con un `grant`: no borra nada;
  - en la base nueva, `consultoria_consultores.fuente_desde` pasa de nulo a la hora del cambio. **Mientras sea nulo, el panel enseña la consultoría pero no escribe**, y la copia puede repetirse; **desde que tiene fecha, la copia se niega a escribir** y el bloque de vaciar también.

  Lo hace Facundo: son dos sentencias, una en cada base
- **Borrar las tablas de FSM-Finance va al final y aparte**, cuando Facundo lo haya comprobado en el panel: primero el código sin consultoría, después una migración que las borra (irreversible), con una exportación hecha justo antes

## Alternativas consideradas
- Que el panel lea la base de FSM-Finance hasta tener la suya — es la opción A, que Facundo descartó
- Un paquete con las reglas que importen los dos repos — dos repos que se publican por separado acabarían con versiones distintas; y FSM-Finance deja de usarlas
- Copiar una vez y confiar en no apuntar nada en FSM-Finance — sin un cambio explícito, una firma apuntada por costumbre en el sitio viejo se pierde sin que nadie lo vea
- Sincronizar las dos bases durante unos días — mucho código para una semana, y vuelve a haber dos verdades

## Consecuencias
- Hasta el cambio, todo se sigue apuntando en FSM-Finance como hoy; desde el cambio, solo en el panel. La regla de la bóveda (`consultoria:firma`) cambia de repo ese mismo día
- Si el panel falla después del cambio, el plan B es volver: `grant` en FSM-Finance y apuntar a mano allí lo que se hubiera hecho en el panel (pocas filas). No hay vuelta automática
- FSM-Finance pasa unos días con la sección Consultoría en solo lectura: si se intenta guardar algo, la base lo rechaza (`42501`) y la pantalla dice «Esto solo lo puede hacer el consultor». Se acepta hasta quitarla
- Las especificaciones y los ADR de la consultoría en FSM-Finance no se borran: se marcan como «se mudó al panel» y siguen siendo la historia del diseño
