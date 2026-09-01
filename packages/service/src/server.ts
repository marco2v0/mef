import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { SqliteRepository } from "./db/sqlite.js";

const puerto = Number(process.env["PORT"] ?? 3000);
const repo = new SqliteRepository(process.env["MEF_DB"] ?? ":memory:");

// Los datos mock solo entran si se piden explícitamente. Nunca por default:
// una DB de producción vacía no debe recibir una planeación inventada.
if (process.env["MEF_SEED"] === "1") {
  repo.seedParaDesarrollo();
  console.warn("MEF_SEED=1: base sembrada con datos mock de desarrollo.");
}

serve({ fetch: createApp(repo).fetch, port: puerto });
console.log(`MEF escuchando en http://localhost:${puerto}`);
