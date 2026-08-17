import assert from "node:assert/strict";
import test from "node:test";
import {
  CaptureInterpreterRuntimeConfigurationError,
  createCaptureInterpreterFromEnv,
} from "./capture-interpreter-runtime";

const input = {
  rawText: "Private thought that must stay on fallback while AI is dormant",
  receivedAt: "2026-08-17T09:00:00.000Z",
};

for (const [label, flag] of [["missing", undefined], ["false", "false"], ["trimmed false", " FALSE "]] as const) {
  test(`AI credentials cannot activate interpreter when flag is ${label}`, async () => {
    let providerCalls = 0;
    const interpreter = createCaptureInterpreterFromEnv(
      {
        LIFE_OS_AI_INTERPRETER_ENABLED: flag,
        OPENAI_API_KEY: "present-but-dormant",
        LIFE_OS_AI_MODEL: "present-but-dormant-model",
      },
      {
        fetchImpl: (async () => {
          providerCalls += 1;
          throw new Error("provider must stay dormant");
        }) as typeof fetch,
      },
    );

    const result = await interpreter.interpret(input);
    assert.equal(providerCalls, 0);
    assert.equal(result.interpreter, "SAFE_FALLBACK");
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].destination, "BRAIN_DUMP");
    assert.equal(result.proposals[0].state, "PROPOSED");
  });
}

test("AI interpreter flag rejects ambiguous activation values", () => {
  assert.throws(
    () => createCaptureInterpreterFromEnv({ LIFE_OS_AI_INTERPRETER_ENABLED: "yes" }),
    (error: unknown) => error instanceof CaptureInterpreterRuntimeConfigurationError
      && /must be true or false/.test(error.message),
  );
});

test("explicit AI activation fails closed when required server credentials are missing", () => {
  assert.throws(
    () => createCaptureInterpreterFromEnv({
      LIFE_OS_AI_INTERPRETER_ENABLED: "true",
      LIFE_OS_AI_MODEL: "reviewed-model",
    }),
    (error: unknown) => error instanceof CaptureInterpreterRuntimeConfigurationError
      && /OPENAI_API_KEY is required/.test(error.message),
  );

  assert.throws(
    () => createCaptureInterpreterFromEnv({
      LIFE_OS_AI_INTERPRETER_ENABLED: "true",
      OPENAI_API_KEY: "server-key",
    }),
    (error: unknown) => error instanceof CaptureInterpreterRuntimeConfigurationError
      && /LIFE_OS_AI_MODEL is required/.test(error.message),
  );
});
