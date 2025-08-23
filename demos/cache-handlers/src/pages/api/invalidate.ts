import { invalidateByTag, invalidateByPath, invalidateAll, getCacheStats } from "cache-handlers";

export async function POST({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const type = formData.get("type") as string;
    const value = formData.get("value") as string;

    let result: { success: boolean; count?: number; error?: string };

    switch (type) {
      case "tag":
        if (!value) {
          return Response.json({ success: false, error: "Tag value is required" }, { status: 400 });
        }
        const tagCount = await invalidateByTag(value);
        result = { success: true, count: tagCount };
        break;

      case "path":
        if (!value) {
          return Response.json({ success: false, error: "Path value is required" }, { status: 400 });
        }
        const pathCount = await invalidateByPath(value);
        result = { success: true, count: pathCount };
        break;

      case "all":
        const allCount = await invalidateAll();
        result = { success: true, count: allCount };
        break;

      default:
        return Response.json({ success: false, error: "Invalid invalidation type" }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    console.error("Invalidation error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const stats = await getCacheStats();
    return Response.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Cache stats error:", error);
    return Response.json(
      { success: false, error: "Failed to get cache stats" },
      { status: 500 }
    );
  }
}