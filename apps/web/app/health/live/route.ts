export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
