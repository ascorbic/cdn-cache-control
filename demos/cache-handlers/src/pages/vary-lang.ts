// Variation demo by Accept-Language
export async function GET({ request }: { request: Request }) {
  const issuedAt = new Date();
  const acceptLanguage = request.headers.get("accept-language") || "none";
  
  return Response.json({
    feature: "vary-lang",
    acceptLanguage,
    issuedAt: issuedAt.toISOString(),
    now: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, max-age=20, stale-while-revalidate=120",
      "Cache-Vary": "accept-language",
    }
  });
}