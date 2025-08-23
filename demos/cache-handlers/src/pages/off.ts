// SWR off demo: cache handler configured per-route to treat stale as miss
export async function GET() {
  const issuedAt = new Date();
  
  return Response.json({
    feature: "off",
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
    }
  });
}