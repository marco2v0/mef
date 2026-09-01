import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ErrorResponse {
  error: {
    code: string;
    /** Texto seguro para mostrar al docente: sin PII ni detalle interno. */
    message: string;
    requestId: string;
  };
}

export function fail<E extends { Variables: { requestId: string } }>(
  c: Context<E>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  const cuerpo: ErrorResponse = {
    error: { code, message, requestId: c.get("requestId") },
  };
  return c.json(cuerpo, status);
}
