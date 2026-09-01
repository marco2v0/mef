import { z } from "zod";
import { Alias } from "./resultado-alumno.js";

export const NivelPda = z.enum(["logrado", "enProceso", "noLogrado"]);

export const Retroalimentacion = z.object({
  alias: Alias,
  estado: z.enum(["generado", "sinDatos", "requiereRevision"]),
  /** Ausente para sinDatos: nunca se inventa texto para un alumno sin resultado. */
  retroalimentacion: z.string().optional(),
  pdaInferidos: z
    .array(
      z.object({
        pda: z.string().min(1),
        nivel: NivelPda,
      }),
    )
    .optional(),
  adecuacionAplicada: z.boolean(),
  intentos: z.number().int().min(0),
});

export type Retroalimentacion = z.infer<typeof Retroalimentacion>;
