// Blocking SWR demo forces revalidation before serving a stale response via worker route logic
export async function GET() {
  const issuedAt = new Date();
  
  return Response.json({
    feature: "blocking",
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
    }
  });
}