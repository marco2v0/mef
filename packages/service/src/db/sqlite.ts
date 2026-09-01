import Database from "better-sqlite3";
import type { Database as Db } from "better-sqlite3";
import type { AjustePlaneacion } from "../schemas/ajuste-planeacion.js";
import type { JobProgreso } from "../schemas/job.js";
import type {
  ResultadoActividadInput,
  ResultadoAlumno,
} from "../schemas/resultado-alumno.js";
import type { Planeacion, Repository } from "./repository.js";
import { seed } from "./seed.js";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS planeaciones (
  planeacion_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resultados (
  planeacion_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (planeacion_id, alias)
);
CREATE TABLE IF NOT EXISTS propuestas (
  id TEXT PRIMARY KEY,
  -- UNIQUE: una actividad tiene a lo sumo una propuesta. Sin esto,
  -- getPropuesta(actividadId) devuelve una fila arbitraria.
  actividad_id TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  -- Lote completo que el worker tiene que procesar.
  input TEXT NOT NULL,
  data TEXT NOT NULL
);
`;

interface FilaData {
  data: string;
}

export class SqliteRepository implements Repository {
  private readonly db: Db;

  constructor(filename = ":memory:") {
    this.db = new Database(filename);
    this.db.exec(ESQUEMA);
  }

  /** Solo desarrollo y tests. Nunca se llama sola desde el constructor. */
  seedParaDesarrollo(): void {
    seed(this.db);
  }

  close(): void {
    this.db.close();
  }

  async getPlaneacion(planeacionId: string): Promise<Planeacion | null> {
    const fila = this.db
      .prepare("SELECT data FROM planeaciones WHERE planeacion_id = ?")
      .get(planeacionId) as FilaData | undefined;
    return fila ? (JSON.parse(fila.data) as Planeacion) : null;
  }

  async getResultados(planeacionId: string): Promise<ResultadoAlumno[]> {
    const filas = this.db
      .prepare(
        "SELECT data FROM resultados WHERE planeacion_id = ? ORDER BY alias",
      )
      .all(planeacionId) as FilaData[];
    return filas.map((f) => JSON.parse(f.data) as ResultadoAlumno);
  }

  async savePropuesta(propuesta: AjustePlaneacion): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO propuestas (id, actividad_id, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET actividad_id = excluded.actividad_id, data = excluded.data`,
      )
      .run(propuesta.id, propuesta.actividadId, JSON.stringify(propuesta));
  }

  async getPropuesta(ref: string): Promise<AjustePlaneacion | null> {
    const fila = this.db
      .prepare(
        "SELECT data FROM propuestas WHERE id = ? OR actividad_id = ? LIMIT 1",
      )
      .get(ref, ref) as FilaData | undefined;
    return fila ? (JSON.parse(fila.data) as AjustePlaneacion) : null;
  }

  async createJob(input: ResultadoActividadInput): Promise<JobProgreso> {
    const job: JobProgreso = {
      jobId: crypto.randomUUID(),
      estado: "encolado",
      total: input.resultados.filter((r) => r.presente).length,
      completados: 0,
      requierenRevision: [],
    };
    this.db
      .prepare("INSERT INTO jobs (job_id, input, data) VALUES (?, ?, ?)")
      .run(job.jobId, JSON.stringify(input), JSON.stringify(job));
    return job;
  }

  async getJob(jobId: string): Promise<JobProgreso | null> {
    const fila = this.db
      .prepare("SELECT data FROM jobs WHERE job_id = ?")
      .get(jobId) as FilaData | undefined;
    return fila ? (JSON.parse(fila.data) as JobProgreso) : null;
  }

  async updateJob(job: JobProgreso): Promise<void> {
    const { changes } = this.db
      .prepare("UPDATE jobs SET data = ? WHERE job_id = ?")
      .run(JSON.stringify(job), job.jobId);
    if (changes !== 1) {
      throw new Error(`updateJob: no existe el job ${job.jobId}`);
    }
  }
}
