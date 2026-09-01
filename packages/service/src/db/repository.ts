import type { AjustePlaneacion } from "../schemas/ajuste-planeacion.js";
import type { JobProgreso } from "../schemas/job.js";
import type {
  ResultadoActividadInput,
  ResultadoAlumno,
} from "../schemas/resultado-alumno.js";

/**
 * Planeación tal como la referencia MEF. MEF no es fuente de verdad: la
 * planeación real vive en el backend de MentorIA y acá solo se referencia.
 */
export interface Planeacion {
  planeacionId: string;
  actividadId: string;
  grupoId: string;
  cicloEscolarId: string;
  campoFormativo: string;
  pda: string;
  titulo: string;
  nTotalGrupo: number;
}

/**
 * Única costura entre el servicio y cualquier almacenamiento. El servicio no
 * accede a la base de datos de Red Magisterial: todo entra por acá.
 */
export interface Repository {
  getPlaneacion(planeacionId: string): Promise<Planeacion | null>;
  getResultados(planeacionId: string): Promise<ResultadoAlumno[]>;
  savePropuesta(propuesta: AjustePlaneacion): Promise<void>;
  /** `ref` es el id de la propuesta o el actividadId (en v1 son 1:1). */
  getPropuesta(ref: string): Promise<AjustePlaneacion | null>;
  createJob(input: ResultadoActividadInput): Promise<JobProgreso>;
  getJob(jobId: string): Promise<JobProgreso | null>;
  updateJob(job: JobProgreso): Promise<void>;
}
