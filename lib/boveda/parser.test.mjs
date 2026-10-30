// Pruebas de `textoParaPanel()`: cómo se pinta en el panel el texto de una tarea. Con `npm test`.
// Los textos imitan los de las diarias, sin datos de nadie.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { tareasDe, textoParaPanel } from "./parser.ts";

describe("textoParaPanel", () => {
  test("quita el emoji del principio, también con selector de variación o dentro de una negrita", () => {
    assert.equal(textoParaPanel("🚨 **Renovar el certificado**"), "**Renovar el certificado**");
    assert.equal(textoParaPanel("⚠️ El despliegue no salió"), "El despliegue no salió");
    assert.equal(textoParaPanel("🛰️ [[panel]]: vigilancia"), "[[panel]]: vigilancia");
    assert.equal(textoParaPanel("**🔎 SEO**: revisar la ficha"), "**SEO**: revisar la ficha");
    assert.equal(textoParaPanel("👩🏽‍💻 Programar"), "Programar");
  });

  test("deja los emojis que no van al principio", () => {
    assert.equal(textoParaPanel("Revisar el 🎯 de la semana"), "Revisar el 🎯 de la semana");
  });

  test("quita el emoji de una sección citada entre comillas, como la pinta el panel", () => {
    assert.equal(textoParaPanel("Hecho (abajo, en «✅ Completado»)"), "Hecho (abajo, en «Completado»)");
    assert.equal(textoParaPanel("Si contesta, a «⏳ A la espera» lo que quede"), "Si contesta, a «A la espera» lo que quede");
    assert.equal(textoParaPanel("La frase «sin emoji» se queda"), "La frase «sin emoji» se queda");
  });

  test("quita las etiquetas de prioridad y deja las demás", () => {
    assert.equal(textoParaPanel("Subir los commits #prioridad/alta"), "Subir los commits");
    assert.equal(textoParaPanel("Llamar #prioridad/media al cliente #cliente"), "Llamar  al cliente #cliente");
  });

  test("si no queda nada, devuelve el texto tal cual", () => {
    assert.equal(textoParaPanel("🚨"), "🚨");
    assert.equal(textoParaPanel("#prioridad/alta"), "#prioridad/alta");
  });

  test("no toca la línea de la tarea, que es la que se busca al escribir", () => {
    const [tarea] = tareasDe("- [ ] 🚨 Renovar el certificado #prioridad/alta");
    assert.equal(textoParaPanel(tarea.texto), "Renovar el certificado");
    assert.equal(tarea.linea, "- [ ] 🚨 Renovar el certificado #prioridad/alta");
  });
});
