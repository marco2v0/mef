import { z } from "zod";
import { Alias } from "./resultado-alumno.js";

/** Debajo de 8 alumnos con datos el porcentaje no sostiene una decisión. */
export const UMBRAL_MINIMO_N = 8;

export const PdaNoLogrado = z.object({
  pda: z.string().min(1),
  porcentaje: z.number().min(0).max(100),
  patron: z.string().min(1),
});

/** Lo que produce el modelo. n, umbral y confianza los calcula el código. */
export const BrechasModelo = z.object({
  pdaNoLogrados: z.array(PdaNoLogrado),
  fortalezas: z.array(z.string().min(1)),
  recomendacionGeneral: z.string().min(1),
});

export type BrechasModelo = z.infer<typeof BrechasModelo>;

export const AnalisisBrechas = z.object({
  grupoId: z.string().min(1),
  actividadId: z.string().min(1),
  /** Alumnos con datos (presente = true). Excluye ausentes. */
  n: z.number().int().min(0),
  nTotalGrupo: z.number().int().min(0),
  datosInsuficientes: z.boolean(),
  umbralMinimoNParaCerteza: z.number().int().positive(),
  /** Depende solo de n contra el umbral, así que vale para todo el análisis. */
  confianza: z.enum(["alta", "baja"]),
  pdaNoLogrados: z.array(PdaNoLogrado),
  fortalezas: z.array(z.string().min(1)),
  recomendacionGeneral: z.string().min(1),
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
