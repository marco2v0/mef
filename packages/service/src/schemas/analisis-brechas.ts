import { z } from "zod";
import { Alias } from "./resultado-alumno.js";

export const AnalisisBrechas = z.object({
  grupoId: z.string().min(1),
  actividadId: z.string().min(1),
  /** Alumnos con datos (presente = true). Excluye ausentes. */
  n: z.number().int().min(0),
  nTotalGrupo: z.number().int().min(0),
  datosInsuficientes: z.boolean(),
  umbralMinimoNParaCerteza: z.number().int().positive(),
  brechas: z.array(
    z.object({
      pda: z.string().min(1),
      porcentajeNoLogrado: z.number().min(0).max(100),
      confianza: z.enum(["alta", "baja"]),
    }),
  ),
  flagsSospecha: z
    .array(
      z.object({
        alumnos: z.array(Alias).min(1),
        alcance: z.enum(["individual", "grupoCompleto"]),
        nota: z.string().min(1),
      }),
    )
    .optional(),
});

export type AnalisisBrechas = z.infer<typeof AnalisisBrechas>;
