// Tag B demo
export async function GET() {
  const issuedAt = new Date();
  
  return Response.json({
    feature: "tag",
    tag: "group:b",
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      "Cache-Tag": "group:b",
    }
  });
}