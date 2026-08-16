import assert from "node:assert/strict";
import test from "node:test";
import { safeBootstrapErrorClass } from "./bootstrap-error";

test("returns a normal Error subclass name without exposing its message", () => {
  class ApiRuntimeConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiRuntimeConfigurationError";
    }
  }

  const error = new ApiRuntimeConfigurationError("postgresql://user:secret@example.invalid/db");
  assert.equal(safeBootstrapErrorClass(error), "ApiRuntimeConfigurationError");
});

test("refuses arbitrary error names that could carry secret-bearing text", () => {
  const error = new Error("secret-message");
  error.name = "Error secret-token";
  assert.equal(safeBootstrapErrorClass(error), "UnknownBootstrapError");
});

test("uses a fixed class for non-Error thrown values", () => {
  assert.equal(safeBootstrapErrorClass("secret-token"), "UnknownBootstrapError");
  assert.equal(safeBootstrapErrorClass({ password: "secret" }), "UnknownBootstrapError");
});
