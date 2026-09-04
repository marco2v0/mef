import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

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

const { APIError } = await import("@anthropic-ai/sdk");
const { runStructured, SalidaInvalidaError } =
  await import("../src/claude/client.js");

const Schema = z.object({ alias: z.string(), nota: z.number() });
const usage = { input_tokens: 10, output_tokens: 5 };

// Cuerpo con llaves: mockReset devuelve el mock y vitest tomaría esa función
// como teardown, invocando parse() al terminar cada test.
beforeEach(() => {
  parse.mockReset();
});

describe("runStructured", () => {
  it("manda cachedContext primero y system después, ambos cacheados", async () => {
    parse.mockResolvedValue({
      parsed_output: { alias: "A-01", nota: 8 },
      usage,
    });

    const { data } = await runStructured({
      model: "claude-haiku-4-5",
      system: "SISTEMA",
      cachedContext: "CONTEXTO",
      user: "pregunta",
      schema: Schema,
    });

    expect(data).toEqual({ alias: "A-01", nota: 8 });
    const req = parse.mock.calls[0]![0];
    expect(req.system).toEqual([
      {
        type: "text",
        text: "CONTEXTO",
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: "SISTEMA", cache_control: { type: "ephemeral" } },
    ]);
    expect(req.messages[0]).toEqual({ role: "user", content: "pregunta" });
  });

  it("sin cachedContext manda solo el bloque de system", async () => {
    parse.mockResolvedValue({
      parsed_output: { alias: "A-01", nota: 8 },
      usage,
    });

    await runStructured({
      model: "claude-haiku-4-5",
      system: "SISTEMA",
      user: "pregunta",
      schema: Schema,
    });

    expect(parse.mock.calls[0]![0].system).toEqual([
      { type: "text", text: "SISTEMA", cache_control: { type: "ephemeral" } },
    ]);
  });

  it.each([429, 529])(
    "reintenta ante %i y devuelve el resultado",
    async (status) => {
      parse
        .mockRejectedValueOnce(
          new APIError(status, undefined, "límite", undefined),
        )
        .mockRejectedValueOnce(
          new APIError(status, undefined, "límite", undefined),
        )
        .mockResolvedValue({
          parsed_output: { alias: "A-01", nota: 8 },
          usage,
        });

      vi.useFakeTimers();
      const promesa = runStructured({
        model: "claude-haiku-4-5",
        system: "SISTEMA",
        user: "pregunta",
        schema: Schema,
      });
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await expect(promesa).resolves.toMatchObject({
        data: { alias: "A-01", nota: 8 },
      });
      expect(parse).toHaveBeenCalledTimes(3);
    },
  );

  it("agota los 3 intentos y propaga el error", async () => {
    parse.mockRejectedValue(new APIError(429, undefined, "límite", undefined));

    vi.useFakeTimers();
    const resultado = runStructured({
      model: "claude-haiku-4-5",
      system: "SISTEMA",
      user: "pregunta",
      schema: Schema,
    }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(await resultado).toBeInstanceOf(APIError);
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it("lanza SalidaInvalidaError si la salida no cumple el schema", async () => {
    parse.mockResolvedValue({ parsed_output: { alias: "A-01" }, usage });

    await expect(
      runStructured({
        model: "claude-haiku-4-5",
        system: "SISTEMA",
        user: "pregunta",
        schema: Schema,
      }),
    ).rejects.toBeInstanceOf(SalidaInvalidaError);
  });
});
