// Background revalidation demo (default SWR policy applied in worker wrapper)
export async function GET() {
  const issuedAt = new Date();
  
  return Response.json({
    feature: "swr",
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
    }
  });
}