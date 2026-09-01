import { z } from "zod";
import { Alias } from "./resultado-alumno.js";

export const JobProgreso = z
  .object({
    jobId: z.string().min(1),
    estado: z.enum(["encolado", "procesando", "completado", "error"]),
    /** Alumnos a procesar: presentes únicamente. */
    total: z.number().int().min(0),
    completados: z.number().int().min(0),
    requierenRevision: z.array(Alias),
  })
  .refine((j) => j.completados <= j.total, {
    message: "completados no puede exceder total",
    path: ["completados"],
  });

export type JobProgreso = z.infer<typeof JobProgreso>;
