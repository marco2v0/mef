import type { Database as Db } from "better-sqlite3";
import type { AjustePlaneacion } from "../schemas/ajuste-planeacion.js";
import type { ResultadoAlumno } from "../schemas/resultado-alumno.js";
import type { Planeacion } from "./repository.js";

export const PLANEACION_MOCK: Planeacion = {
  planeacionId: "PLAN-001",
  actividadId: "ACT-001",
  grupoId: "GRP-001",
  cicloEscolarId: "CE-2025-2026",
  campoFormativo: "Lenguajes",
  pda: "F3.LEN.02.1",
  titulo: "Lectura en voz alta y comprensión de textos narrativos",
  nTotalGrupo: 12,
};

/** 12 alumnos: A-07 ausente (sin score), A-11 con adecuación curricular. */
export const RESULTADOS_MOCK: ResultadoAlumno[] = [
  { alias: "A-01", presente: true, scoreAgregado: 85 },
  { alias: "A-02", presente: true, scoreAgregado: 72 },
  {
    alias: "A-03",
    presente: true,
    scoreAgregado: 45,
    flags: [
      { tipo: "atencion", nota: "Se detuvo antes de terminar la actividad" },
    ],
  },
  { alias: "A-04", presente: true, scoreAgregado: 90 },
  { alias: "A-05", presente: true, scoreAgregado: 58 },
  { alias: "A-06", presente: true, scoreAgregado: 66 },
  { alias: "A-07", presente: false },
  { alias: "A-08", presente: true, scoreAgregado: 38 },
  { alias: "A-09", presente: true, scoreAgregado: 78 },
  { alias: "A-10", presente: true, scoreAgregado: 52 },
  {
    alias: "A-11",
    presente: true,
    scoreAgregado: 61,
    adecuacionCurricular: {
      criterioAjustado:
        "Comprensión evaluada de forma oral en lugar de escrita",
    },
  },
  { alias: "A-12", presente: true, scoreAgregado: 58 },
];

export const PROPUESTA_MOCK: AjustePlaneacion = {
  id: "PROP-001",
  planeacionId: PLANEACION_MOCK.planeacionId,
  actividadId: PLANEACION_MOCK.actividadId,
  estado: "borrador",
  diff: [
    {
      tipo: "agregar",
      descripcion:
        "Agregar actividad remedial de 20 min de lectura guiada en parejas",
      pdaRelacionado: PLANEACION_MOCK.pda,
    },
    {
      tipo: "mantener",
      descripcion: "Conservar la lectura en voz alta como cierre de sesión",
      pdaRelacionado: PLANEACION_MOCK.pda,
    },
  ],
  auditoria: {
    creadoEn: "2026-09-01T12:00:00.000Z",
    editadoRespectoOriginal: false,
  },
};

/**
 * Datos mock de desarrollo. NUNCA se ejecuta solo: hay que llamarlo
 * explícitamente (SqliteRepository.seedParaDesarrollo). Una DB de producción
 * con las tablas vacías no debe terminar con una planeación inventada.
 *
 * Todo en una transacción: un fallo a mitad no deja un dataset parcial.
 */
export function seed(db: Db): void {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO planeaciones (planeacion_id, data) VALUES (?, ?)",
    ).run(PLANEACION_MOCK.planeacionId, JSON.stringify(PLANEACION_MOCK));

    const insertResultado = db.prepare(
      "INSERT INTO resultados (planeacion_id, alias, data) VALUES (?, ?, ?)",
    );
    for (const resultado of RESULTADOS_MOCK) {
      insertResultado.run(
        PLANEACION_MOCK.planeacionId,
        resultado.alias,
        JSON.stringify(resultado),
      );
    }

    db.prepare(
      "INSERT INTO propuestas (id, actividad_id, data) VALUES (?, ?, ?)",
    ).run(
      PROPUESTA_MOCK.id,
      PROPUESTA_MOCK.actividadId,
      JSON.stringify(PROPUESTA_MOCK),
    );
  })();
}
