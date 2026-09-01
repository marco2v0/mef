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

export const DiffItem = z.object({
  tipo: z.enum(["agregar", "modificar", "mantener"]),
  descripcion: z.string().min(1),
  pdaRelacionado: z.string().optional(),
  medSugerido: MedSugerido.optional(),
});

/** Cuerpo opcional de POST /planeacion-ajuste/{id}/aprobar: ediciones del docente. */
export const AprobarBody = z.object({
  diff: z.array(DiffItem).optional(),
});

export const AjustePlaneacion = z.object({
  id: z.string().min(1),
  planeacionId: z.string().min(1),
  actividadId: z.string().min(1),
  estado: z.enum(["borrador", "revisado", "aprobado", "descartado"]),
  diff: z.array(DiffItem),
  auditoria: z.object({
    creadoEn: z.string(),
    aprobadoPor: z.string().optional(),
    aprobadoEn: z.string().optional(),
    editadoRespectoOriginal: z.boolean(),
  }),
});

export type AjustePlaneacion = z.infer<typeof AjustePlaneacion>;
