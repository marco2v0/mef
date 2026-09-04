import { beforeEach, describe, expect, it, vi } from "vitest";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`);
    }
  }
  class Anthropic {
    messages = { parse };
    static APIError = APIError;
  }
  return { default: Anthropic, APIError };
});

const { generarBrechas } = await import("../src/claude/brechas.js");
const { generarAjuste } = await import("../src/claude/ajuste.js");
const { costoUsd, setUsageSink } = await import("../src/claude/client.js");
const { PLANEACION_MOCK } = await import("../src/db/seed.js");
const { SqliteRepository } = await import("../src/db/sqlite.js");
const { AnalisisBrechas } = await import("../src/schemas/analisis-brechas.js");
const { AjustePlaneacion } =
  await import("../src/schemas/ajuste-planeacion.js");
const { EntradaRetroalimentacion } =
  await import("../src/schemas/retroalimentacion.js");

type Entrada =
  import("../src/schemas/retroalimentacion.js").EntradaRetroalimentacion;

const usage = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_read_input_tokens: 2000,
  cache_creation_input_tokens: 400,
};

const SALIDA_BRECHAS = {
  parsed_output: {
    pdaNoLogrados: [
      {
        pda: "F3.LEN.02.1",
        porcentaje: 36.4,
        patron: "Confunden un detalle con la idea central",
      },
    ],
    fortalezas: ["Localizan información explícita"],
    recomendacionGeneral: "Trabajar la idea principal con textos cortos.",
  },
  usage,
};

const SALIDA_AJUSTE = {
  parsed_output: {
    cambiosSecuencia: [
      {
        tipo: "agregar",
        descripcion: "Remedial de lectura guiada",
        pdaRelacionado: "F3.LEN.02.1",
      },
    ],
    actividadRemedial: {
      descripcion: "Lectura guiada en parejas",
      duracionMin: 20,
      pdaObjetivo: "F3.LEN.02.1",
    },
  },
  usage,
};

function generada(alias: string): Entrada {
  return EntradaRetroalimentacion.parse({
    alias,
    estado: "generado",
    pdaReferidos: ["F3.LEN.02.1"],
    logros: "Identificaste la idea principal en dos textos.",
    brecha: "Todavía confundís un detalle con la idea central.",
    siguientePaso: "Subrayá de qué trata cada oración.",
    texto: "Reconociste la idea principal en dos de los tres textos.",
    requiereRevision: false,
  });
}

/** n entradas generadas más un ausente, que nunca debe contar. */
function entradas(n: number): Entrada[] {
  const generadas = Array.from({ length: n }, (_, i) =>
    generada(`A-${String(i + 1).padStart(2, "0")}`),
  );
  return [...generadas, { alias: "A-99", estado: "sinDatos" }];
}

beforeEach(() => {
  parse.mockReset();
  setUsageSink(null);
});

describe("generarBrechas", () => {
  it("usa Sonnet con effort medium y excluye a los sinDatos del n", async () => {
    parse.mockResolvedValue(SALIDA_BRECHAS);

    const brechas = await generarBrechas(PLANEACION_MOCK, entradas(11));

    expect(AnalisisBrechas.safeParse(brechas).success).toBe(true);
    expect(brechas.n).toBe(11);
    expect(brechas.nTotalGrupo).toBe(PLANEACION_MOCK.nTotalGrupo);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("claude-sonnet-5");
    expect(req.output_config.effort).toBe("medium");
    expect(req.messages[0].content).not.toContain("A-99");
  });

  it("con n ≥ 8 la confianza es alta y los datos alcanzan", async () => {
    parse.mockResolvedValue(SALIDA_BRECHAS);

    const brechas = await generarBrechas(PLANEACION_MOCK, entradas(8));

    expect(brechas.confianza).toBe("alta");
    expect(brechas.datosInsuficientes).toBe(false);
    expect(brechas.umbralMinimoNParaCerteza).toBe(8);
  });

  it("con n < 8 marca confianza baja y datos insuficientes", async () => {
    parse.mockResolvedValue(SALIDA_BRECHAS);

    const brechas = await generarBrechas(PLANEACION_MOCK, entradas(7));

    expect(brechas.confianza).toBe("baja");
    expect(brechas.datosInsuficientes).toBe(true);
  });

  it("descarta un PDA que no está en la planeación", async () => {
    parse.mockResolvedValue({
      ...SALIDA_BRECHAS,
      parsed_output: {
        ...SALIDA_BRECHAS.parsed_output,
        pdaNoLogrados: [
          ...SALIDA_BRECHAS.parsed_output.pdaNoLogrados,
          { pda: "F3.MAT.99.9", porcentaje: 50, patron: "Inventado" },
        ],
      },
    });

    const brechas = await generarBrechas(PLANEACION_MOCK, entradas(11));

    expect(brechas.pdaNoLogrados.map((b) => b.pda)).toEqual(["F3.LEN.02.1"]);
  });
});

describe("generarAjuste", () => {
  async function brechasBase() {
    parse.mockResolvedValue(SALIDA_BRECHAS);
    const brechas = await generarBrechas(PLANEACION_MOCK, entradas(11));
    parse.mockReset();
    return brechas;
  }

  it("usa Sonnet con effort high y nace en borrador sin MED", async () => {
    const brechas = await brechasBase();
    parse.mockResolvedValue(SALIDA_AJUSTE);

    const ajuste = await generarAjuste(PLANEACION_MOCK, brechas);

    expect(AjustePlaneacion.safeParse(ajuste).success).toBe(true);
    expect(ajuste.estado).toBe("borrador");
    expect(ajuste.medSugeridos).toEqual([]);
    expect(ajuste.actividadRemedial.duracionMin).toBe(20);
    expect(ajuste.auditoria.editadoRespectoOriginal).toBe(false);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("claude-sonnet-5");
    expect(req.output_config.effort).toBe("high");
  });

  it("le pasa al modelo la confianza del análisis", async () => {
    parse.mockResolvedValue(SALIDA_BRECHAS);
    const pocos = await generarBrechas(PLANEACION_MOCK, entradas(3));
    parse.mockReset();
    parse.mockResolvedValue(SALIDA_AJUSTE);

    await generarAjuste(PLANEACION_MOCK, pocos);

    expect(parse.mock.calls[0]![0].messages[0].content).toContain(
      'confianza="baja"',
    );
  });
});

describe("registro de usage", () => {
  it("guarda en llm_usage una fila por llamada, con su costo", async () => {
    const repo = new SqliteRepository();
    setUsageSink((u) => repo.logUsage(u));
    parse.mockResolvedValue(SALIDA_BRECHAS);

    await generarBrechas(PLANEACION_MOCK, entradas(11));

    const filas = await repo.getUsage();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      modelo: "claude-sonnet-5",
      input: 1000,
      output: 500,
      cacheRead: 2000,
      cacheWrite: 400,
    });
    // (1000·2 + 2000·0.2 + 400·2.5 + 500·10) / 1e6
    expect(filas[0]!.costoUsd).toBeCloseTo(0.0084, 8);
    repo.close();
  });

  it("cobra Haiku más barato que Sonnet con el mismo usage", () => {
    // El SDK trae más campos de usage; para el costo solo cuentan estos cuatro.
    const usoParcial = usage as unknown as Parameters<typeof costoUsd>[1];
    expect(costoUsd("claude-haiku-4-5-20251001", usoParcial)).toBeCloseTo(
      0.0042,
      8,
    );
    expect(costoUsd("modelo-desconocido", usoParcial)).toBe(0);
  });

  it("un fallo al guardar el usage no tumba la generación", async () => {
    setUsageSink(() => Promise.reject(new Error("disco lleno")));
    parse.mockResolvedValue(SALIDA_BRECHAS);

    await expect(
      generarBrechas(PLANEACION_MOCK, entradas(11)),
    ).resolves.toMatchObject({ n: 11 });
  });
});
