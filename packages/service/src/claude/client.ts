import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";

export class SalidaInvalidaError extends Error {
  constructor(readonly detalle: unknown) {
    super("El modelo devolvió una salida que no cumple el schema");
    this.name = "SalidaInvalidaError";
  }
}

export interface RunStructuredParams<S extends z.ZodType> {
  model: string;
  /** Instrucciones de la tarea; va después de cachedContext, con su propio breakpoint. */
  system: string;
  /** Contexto voluminoso compartido entre tareas (NEM/PDA, rúbricas). Sin PII. Va primero. */
  cachedContext?: string;
  /** Mensaje variable de esta llamada. */
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

const REINTENTOS = 3;

export async function runStructured<S extends z.ZodType>({
  model,
  system,
  cachedContext,
  user,
  schema,
  effort = "high",
}: RunStructuredParams<S>): Promise<{
  data: z.infer<S>;
  usage: Anthropic.Usage;
}> {
  const client = new Anthropic();
  // cachedContext (NEM/PDA, rúbricas) va primero porque se repite entre
  // retroalimentación, brechas y ajuste: su prefijo se reusa aunque cambie el
  // system de cada tarea.
  const bloques: Anthropic.TextBlockParam[] = [
    ...(cachedContext
      ? [
          {
            type: "text" as const,
            text: cachedContext,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : []),
    {
      type: "text" as const,
      text: system,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  for (let intento = 0; ; intento++) {
    try {
      const res = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: bloques,
        thinking: { type: "adaptive" },
        output_config: { effort, format: zodOutputFormat(schema) },
        messages: [{ role: "user", content: user }],
      });

      const parsed = schema.safeParse(res.parsed_output);
      if (!parsed.success) throw new SalidaInvalidaError(parsed.error.issues);
      return { data: parsed.data, usage: res.usage };
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      if ((status !== 429 && status !== 529) || intento >= REINTENTOS - 1)
        throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** intento));
    }
  }
}
