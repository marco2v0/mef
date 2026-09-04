import { z } from "zod";

/**
 * Anti-alucinación: un MED solo puede venir del resultado real de buscar_med
 * en la misma sesión. No hay otra fuente posible.
 */
export const MedSugerido = z.object({
  medId: z.string().min(1),
  titulo: z.string().min(1),
  fuente: z.literal("mcp-buscar_med"),
  url: z.url().optional(),
});

export const CambioSecuencia = z.object({
  tipo: z.enum(["agregar", "modificar", "mantener"]),
  descripcion: z.string().min(1),
  pdaRelacionado: z.string().optional(),
});

export const ActividadRemedial = z.object({
  descripcion: z.string().min(1),
  duracionMin: z.number().int().positive(),
  pdaObjetivo: z.string().min(1),
});

/** Lo que produce el modelo. Los MED no: se agregan con buscar_med. */
export const AjusteModelo = z.object({
  cambiosSecuencia: z.array(CambioSecuencia).min(1),
  actividadRemedial: ActividadRemedial,
});

export type AjusteModelo = z.infer<typeof AjusteModelo>;

/** Cuerpo opcional de POST /planeacion-ajuste/{id}/aprobar: ediciones del docente. */
export const AprobarBody = z.object({
  cambiosSecuencia: z.array(CambioSecuencia).optional(),
  medSugeridos: z.array(MedSugerido).optional(),
});

export const AjustePlaneacion = z.object({
  id: z.string().min(1),
  planeacionId: z.string().min(1),
  actividadId: z.string().min(1),
  estado: z.enum(["borrador", "revisado", "aprobado", "descartado"]),
  cambiosSecuencia: z.array(CambioSecuencia),
  actividadRemedial: ActividadRemedial,
  medSugeridos: z.array(MedSugerido),
  auditoria: z.object({
    creadoEn: z.string(),
    aprobadoPor: z.string().optional(),
    aprobadoEn: z.string().optional(),
    editadoRespectoOriginal: z.boolean(),
  }),
});

export type AjustePlaneacion = z.infer<typeof AjustePlaneacion>;
