import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
const content = input.tool_input?.content ?? input.tool_input?.new_string ?? "";
const curp = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/;
const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
if (curp.test(content) || email.test(content)) {
  console.error("Bloqueado: posible dato personal (CURP/correo) en el contenido.");
  process.exit(2);
}