import { z } from "zod";
import { AjustePlaneacion } from "./ajuste-planeacion.js";
import { AnalisisBrechas } from "./analisis-brechas.js";
import { Alias } from "./resultado-alumno.js";
import { EntradaRetroalimentacion } from "./retroalimentacion.js";

export const JobProgreso = z
  .object({
    jobId: z.string().min(1),
    estado: z.enum(["encolado", "procesando", "completado", "error"]),
    /** Alumnos a procesar: presentes únicamente. */
    total: z.number().int().min(0),
    completados: z.number().int().min(0),
    requierenRevision: z.array(Alias),
    /** Se llena conforme el worker avanza; el polling la lee parcial. */
    retroalimentaciones: z.array(EntradaRetroalimentacion).optional(),
    /** Se agregan al cerrar el lote, en ese orden. */
    brechas: AnalisisBrechas.optional(),
    ajuste: AjustePlaneacion.optional(),
  })
  .refine((j) => j.completados <= j.total, {
    message: "completados no puede exceder total",
    path: ["completados"],
  });

export type JobProgreso = z.infer<typeof JobProgreso>;
