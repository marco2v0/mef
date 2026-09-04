import { describe, expect, it } from "vitest";
import { FEWSHOT_RETROALIMENTACION } from "../src/claude/fewshot.js";

describe("FEWSHOT_RETROALIMENTACION", () => {
  it("tiene exactamente 5 ejemplos", () => {
    expect(FEWSHOT_RETROALIMENTACION).toHaveLength(5);
  });

  it("no repite situaciones", () => {
    const situaciones = FEWSHOT_RETROALIMENTACION.map((e) => e.situacion);
    expect(new Set(situaciones).size).toBe(situaciones.length);
  });

  it("no repite alias", () => {
    const alias = FEWSHOT_RETROALIMENTACION.map((e) => e.alias);
    expect(new Set(alias).size).toBe(alias.length);
  });
});
