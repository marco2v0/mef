import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
const content = input.tool_input?.content ?? input.tool_input?.new_string ?? "";
const curp = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/;
const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
// Heurística mínima: solo detecta nombres cuando vienen etiquetados como clave
// JSON/objeto con valor no vacío. TECHO CONOCIDO: un nombre suelto en prosa
// ("Juan reprobó la actividad") NO es detectable de forma confiable con regex
// ni heurísticas simples y pasa este hook. Ver docs/decisiones.md.
const nombreClave = /"(nombre|apellidos?|nombre_completo)"\s*:\s*"[^"]+"/i;
if (curp.test(content) || email.test(content) || nombreClave.test(content)) {
  console.error(
    "Bloqueado: posible dato personal (CURP/correo/nombre etiquetado) en el contenido. Usá alias A-NN.",
  );
  process.exit(2);
}
