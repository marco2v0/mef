import { z } from "zod";
import { Alias } from "./resultado-alumno.js";

const MAX_PALABRAS = 120;

/** Salida estructurada de Claude para un alumno. */
export const Retroalimentacion = z.object({
  alias: Alias,
  /** Ids de PDA citados; se validan contra planeacion.pdas en código. */
  pdaReferidos: z.array(z.string().min(1)).min(1),
  logros: z.string().min(1),
  brecha: z.string().min(1),
  siguientePaso: z.string().min(1),
  texto: z
    .string()
    .min(1)
    .refine((t) => t.trim().split(/\s+/).length <= MAX_PALABRAS, {
      message: `el texto no puede exceder ${MAX_PALABRAS} palabras`,
    }),
});

export type Retroalimentacion = z.infer<typeof Retroalimentacion>;

/** Lo que guarda el worker: la salida más el veredicto de la validación local. */
export const RetroalimentacionGenerada = Retroalimentacion.extend({
  estado: z.literal("generado"),
  requiereRevision: z.boolean(),
});

export type RetroalimentacionGenerada = z.infer<
  typeof RetroalimentacionGenerada
>;

/**
 * Alumno ausente. Aparece en el job para que el docente lo vea, pero sin
 * texto: no se llama a Claude ni se inventa evidencia que no existe.
 */
/** strict: un sinDatos con texto o PDA sería justamente lo que se prohíbe. */
export const RetroalimentacionSinDatos = z.strictObject({
  alias: Alias,
  estado: z.literal("sinDatos"),
});

export const EntradaRetroalimentacion = z.discriminatedUnion("estado", [
  RetroalimentacionGenerada,
  RetroalimentacionSinDatos,
]);

export type EntradaRetroalimentacion = z.infer<typeof EntradaRetroalimentacion>;
