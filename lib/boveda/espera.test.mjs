// Pruebas de `partesEspera()`: cómo se parte una tarea de «A la espera» para pintarla en Hoy.
// Con `npm test`. Los textos imitan los de las diarias, sin datos de nadie.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { partesEspera } from "./espera.ts";

describe("partesEspera", () => {
  test("la línea que escribe el panel al pasar una tarea a la espera", () => {
    assert.deepEqual(partesEspera("Mandar el presupuesto — **Lucía** — desde 2026-10-20"), {
      que: "Mandar el presupuesto",
      quien: "Lucía",
      desde: "2026-10-20",
    });
  });

  test("lo que se espera en negrita y texto detrás de la fecha", () => {
    assert.deepEqual(
      partesEspera("**Renovar el certificado de [[web-a|la web]]** — **Roberto** — desde 2026-09-21. **Aparcado** hasta la reunión"),
      { que: "**Renovar el certificado de [[web-a|la web]]**", quien: "Roberto", desde: "2026-09-21" },
    );
  });

  test("quién con un enlace y algo más antes de la fecha", () => {
    assert.deepEqual(
      partesEspera("**Todo lo que falta** — **[[ana-cliente|Ana]]**, que lo ve en persona (no por correo) — desde 2026-09-21 lo más antiguo:"),
      { que: "**Todo lo que falta**", quien: "[[ana-cliente|Ana]]", desde: "2026-09-21" },
    );
    assert.deepEqual(
      partesEspera("La documentación — **Proveedor** (gestor comercial; lo pasaron a `datos@ejemplo.com`) — desde 2026-10-06. Contestaron"),
      { que: "La documentación", quien: "Proveedor", desde: "2026-10-06" },
    );
  });

  test("si lo que se espera lleva su propia raya, quién es la negrita de antes de la fecha", () => {
    assert.deepEqual(partesEspera("Cerrar la cuota — **urgente** — de la web — **Pablo** — desde 2026-09-29"), {
      que: "Cerrar la cuota — **urgente** — de la web",
      quien: "Pablo",
      desde: "2026-09-29",
    });
  });

  test("una línea escrita a mano sin el formato vuelve entera, con la fecha si la tiene", () => {
    assert.deepEqual(partesEspera("Que me pasen las fotos"), { que: "Que me pasen las fotos", desde: undefined });
    assert.deepEqual(partesEspera("Las fotos, desde 2026-10-01"), { que: "Las fotos, desde 2026-10-01", desde: "2026-10-01" });
  });
});
