// Variation demo with multiple dimensions (method is always GET here; path implicitly part of key; add Accept & custom header)
export async function GET({ request }: { request: Request }) {
  const issuedAt = new Date();
  const accept = request.headers.get("accept") || "none";
  const variant = request.headers.get("x-demo-variant") || "default";
  
  return Response.json({
    feature: "vary-mixed",
    accept,
    variant,
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=20, stale-while-revalidate=120",
      "Cache-Vary": "accept, x-demo-variant",
    }
  });
}