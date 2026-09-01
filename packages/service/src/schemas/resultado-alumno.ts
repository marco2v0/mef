import { z } from "zod";

/** Alias pseudonimizado. Nunca un alumnoId real, nombre, CURP ni correo. */
export const Alias = z
  .string()
  .regex(/^A-\d{2}$/, "el alias debe tener la forma A-NN");

export const ResultadoAlumno = z
  .object({
    alias: Alias,
    presente: z.boolean(),
    scoreAgregado: z.number().min(0).max(100).optional(),
    flags: z
      .array(
        z.object({
          tipo: z.literal("atencion"),
          nota: z.string().optional(),
        }),
      )
      .optional(),
    adecuacionCurricular: z
      .object({
        criterioAjustado: z.string().min(1),
      })
      .optional(),
  })
  .refine((r) => !r.presente || r.scoreAgregado !== undefined, {
    message: "scoreAgregado es requerido cuando presente es true",
    path: ["scoreAgregado"],
  });

export type ResultadoAlumno = z.infer<typeof ResultadoAlumno>;

/** Cuerpo de POST /v1/retroalimentacion, ya pseudonimizado. */
export const ResultadoActividadInput = z.object({
  planeacionId: z.string().min(1),
  actividadId: z.string().min(1),
  grupoId: z.string().min(1),
  cicloEscolarId: z.string().min(1),
  resultados: z.array(ResultadoAlumno).min(1),
});

export type ResultadoActividadInput = z.infer<typeof ResultadoActividadInput>;
