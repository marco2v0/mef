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

/** USD por millón de tokens, tarifas de la API de Anthropic. */
const PRECIOS = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
} as const;

/** Lectura de caché ~0.1x el input; escritura ~1.25x. */
export function costoUsd(model: string, usage: Anthropic.Usage): number {
  const precio = PRECIOS[model as keyof typeof PRECIOS];
  if (!precio) {
    console.warn({ msg: "modelo sin tarifa conocida", model });
    return 0;
  }
  const tokens =
    usage.input_tokens * precio.input +
    (usage.cache_read_input_tokens ?? 0) * precio.input * 0.1 +
    (usage.cache_creation_input_tokens ?? 0) * precio.input * 1.25 +
    usage.output_tokens * precio.output;
  return tokens / 1_000_000;
}

export type UsageSink = (registro: {
  modelo: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costoUsd: number;
}) => Promise<void>;

// ponytail: sink de módulo en vez de pasar el repositorio por cada firma
// (generarRetro/Brechas/Ajuste tienen firmas fijas). Si algún día hay más de
// un destino de logging, pasarlo explícito.
let sink: UsageSink | null = null;

/** Lo llama createApp con el repositorio; en tests, cada test con su doble. */
export function setUsageSink(nuevo: UsageSink | null): void {
  sink = nuevo;
}

async function registrarUsage(
  model: string,
  usage: Anthropic.Usage,
): Promise<void> {
  if (!sink) return;
  // El logging de costos no puede tumbar una generación ya pagada.
  await sink({
    modelo: model,
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    costoUsd: costoUsd(model, usage),
  }).catch((err: unknown) => console.error({ msg: "logUsage falló", err }));
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

      // Antes de validar: el usage se pagó igual que si la salida sirviera.
      await registrarUsage(model, res.usage);
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
