import { Hono } from "hono";
import { ZodError } from "zod";
import { setUsageSink } from "./claude/client.js";
import type { Repository } from "./db/repository.js";
import { fail } from "./errors.js";
import { planeacionAjusteRoutes } from "./routes/planeacion-ajuste.js";
import { retroalimentacionRoutes } from "./routes/retroalimentacion.js";

export interface AppEnv {
  Variables: {
    requestId: string;
    repo: Repository;
  };
}

/**
 * PENDIENTE BLOQUEANTE: acá va el middleware de auth (SPEC §7) — validar el
 * JWT de redmagisterial y verificar grupoId ∈ grupoIds. openapi.yaml ya
 * declara `security: bearerAuth` y respuestas 401/403 que este código todavía
 * NO emite: hoy cualquier llamante sin token lee y aprueba propuestas de
 * cualquier docente. Es un pendiente asumido, no un olvido. No desplegar así.
 */
export function createApp(repo: Repository) {
  // Todo lo que gaste tokens en este proceso queda en llm_usage.
  setUsageSink((usage) => repo.logUsage(usage));

  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    c.set("repo", repo);
    await next();
  });

  app.get("/v1/health", (c) => c.json({ estado: "ok" }));
  app.route("/v1/retroalimentacion", retroalimentacionRoutes);
  app.route("/v1/planeacion-ajuste", planeacionAjusteRoutes);

  app.notFound((c) => fail(c, 404, "NO_ENCONTRADO", "Recurso no encontrado."));

  // Captura global: nunca deja escapar stack trace ni mensaje nativo al cliente.
  app.onError((err, c) => {
    const requestId = c.get("requestId");
    // SyntaxError = JSON malformado o body vacío: culpa del cliente, no del
    // servidor. Sin esta rama caía en el 500 genérico.
    if (err instanceof ZodError || err instanceof SyntaxError) {
      const issues = err instanceof ZodError ? err.issues : undefined;
      console.error({ requestId, code: "INPUT_INVALIDO", issues });
      return fail(
        c,
        400,
        "INPUT_INVALIDO",
        "Los datos enviados no son válidos.",
      );
    }
    console.error({ requestId, code: "ERROR_INTERNO", err });
    return fail(
      c,
      500,
      "ERROR_INTERNO",
      "Ocurrió un error inesperado. Reporte este identificador a soporte.",
    );
  });

  return app;
}
