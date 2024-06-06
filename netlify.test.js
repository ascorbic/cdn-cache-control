import assert from "node:assert";
import { before, describe, it } from "node:test";
import { CacheHeaders } from "./dist/index.js";

describe("Netlify", () => {
  before(() => {
    process.env.NETLIFY = "true";
  });
  it("sets tiered header on Netlify", () => {
    const headers = new CacheHeaders().swr();
    assert.strictEqual(
      headers.get("Netlify-CDN-Cache-Control"),
      "public,s-maxage=0,tiered,stale-while-revalidate=604800",
    );
  });

  it("should detect Netlify CDN", () => {
    const headers = new CacheHeaders().immutable();
    assert(headers.has("Netlify-CDN-Cache-Control"));
  });
});
