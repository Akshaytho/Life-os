import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseSessionVerifier,
  SupabaseSessionVerificationUnavailableError,
} from "./supabase-session-verifier";

function fakeFetch(handler: () => Promise<Response>): typeof fetch {
  return handler as unknown as typeof fetch;
}

function verifierForId(id: unknown) {
  return createSupabaseSessionVerifier(
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "sb_publishable_example" },
    {
      fetchImpl: fakeFetch(async () => new Response(JSON.stringify({ id }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    },
  );
}

const invalidIds = [
  ...Array.from({ length: 30 }, (_, index) => `user-${index}`),
  ...Array.from({ length: 20 }, (_, index) => `${String(index).padStart(8, "0")}-0000-0000-0000-000000000000`),
  ...Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-7000-${String(index).padStart(12, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `00000000-0000-0000-8000-${String(index).padStart(12, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `00000000-0000-9000-8000-${String(index).padStart(12, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-c000-${String(index).padStart(12, "0")}`),
  " 93aa1c21-7c84-426b-8671-11cd3d9c644f",
  "93aa1c21-7c84-426b-8671-11cd3d9c644f ",
  "93AA1C21-7C84-426B-8671-11CD3D9C644F",
  "93aa1c217c84426b867111cd3d9c644f",
  "{93aa1c21-7c84-426b-8671-11cd3d9c644f}",
  "93aa1c21-7c84-426b-8671-11cd3d9c644",
  "93aa1c21-7c84-426b-8671-11cd3d9c644ff",
  "93aa1c21-7c84-426b-8671-11cd3d9c64zz",
  "",
  "   ",
];

test("Supabase verifier rejects 100+ malformed HTTP-200 upstream identities instead of binding them into RLS", async (t) => {
  assert.ok(invalidIds.length >= 100);
  for (const [index, id] of invalidIds.entries()) {
    await t.test(`malformed upstream identity ${index}`, async () => {
      const verifier = verifierForId(id);
      await assert.rejects(
        () => verifier.verify("apparently-valid-access-token"),
        (error: unknown) => error instanceof SupabaseSessionVerificationUnavailableError,
      );
    });
  }
});

test("Supabase verifier accepts canonical UUID variants used by Auth", async (t) => {
  const valid = [
    "93aa1c21-7c84-126b-8671-11cd3d9c644f",
    "93aa1c21-7c84-226b-9671-11cd3d9c644f",
    "93aa1c21-7c84-326b-a671-11cd3d9c644f",
    "93aa1c21-7c84-426b-b671-11cd3d9c644f",
    "93aa1c21-7c84-526b-8671-11cd3d9c644f",
    "93aa1c21-7c84-626b-9671-11cd3d9c644f",
    "93aa1c21-7c84-726b-a671-11cd3d9c644f",
    "93aa1c21-7c84-826b-b671-11cd3d9c644f",
  ];
  for (const id of valid) {
    await t.test(`canonical UUID ${id.slice(14, 15)}`, async () => {
      assert.deepEqual(await verifierForId(id).verify("valid-token"), { userId: id });
    });
  }
});

test("oversized access credentials fail before any provider request", async () => {
  let calls = 0;
  const verifier = createSupabaseSessionVerifier(
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "sb_publishable_example" },
    { fetchImpl: fakeFetch(async () => { calls += 1; return new Response(null, { status: 500 }); }) },
  );

  assert.equal(await verifier.verify("x".repeat(4097)), undefined);
  assert.equal(calls, 0);
});
