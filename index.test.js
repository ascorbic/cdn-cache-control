// @ts-check
import assert from "node:assert";
import { describe, it } from "node:test";
import { CacheHeaders, ONE_DAY } from "./dist/index.js";

describe("CacheHeaders", () => {
  it("should detect Netlify CDN", () => {
    process.env.NETLIFY = "true";
    const headers = new CacheHeaders();
    assert.strictEqual(
      headers.cdnCacheControlHeaderName,
      "Netlify-CDN-Cache-Control",
    );
    delete process.env.NETLIFY;
  });

  it("should append cache tags", () => {
    const headers = new CacheHeaders({
      "Cache-Tag": "tag1",
    });
    headers.tag("tag2");
    assert.strictEqual(headers.get("Cache-Tag"), "tag1,tag2");
  });

  it("should append cache tags with multiple values", () => {
    const headers = new CacheHeaders({
      "Cache-Tag": "tag1,tag2",
    });
    headers.tag("tag3", "tag4");
    assert.strictEqual(headers.get("Cache-Tag"), "tag1,tag2,tag3,tag4");
  });

  it("should deduplicate cache tags", () => {
    const headers = new CacheHeaders({
      "Cache-Tag": "tag1",
    });
    headers.tag("tag1");
    assert.strictEqual(headers.get("Cache-Tag"), "tag1");
  });

  it("should set swr headers", () => {
    const headers = new CacheHeaders().swr();
    assert.strictEqual(
      headers.get("CDN-Cache-Control"),
      "public,s-maxage=0,stale-while-revalidate=604800",
    );

    assert.strictEqual(
      headers.get("Cache-Control"),
      "public,max-age=0,must-revalidate",
    );
  });

  it("should set immutable headers", () => {
    const headers = new CacheHeaders().immutable();
    assert.strictEqual(
      headers.get("Cache-Control"),
      "public,max-age=31536000,immutable",
    );
    assert.strictEqual(
      headers.get("CDN-Cache-Control"),
      "public,s-maxage=31536000,immutable",
    );
  });

  it("should set revalidatable headers", () => {
    const headers = new CacheHeaders().revalidatable();
    assert.strictEqual(
      headers.get("Cache-Control"),
      "public,max-age=0,must-revalidate",
    );
    assert.strictEqual(
      headers.get("CDN-Cache-Control"),
      "public,s-maxage=31536000,must-revalidate",
    );
  });

  it("sets tiered header on Netlify", () => {
    process.env.NETLIFY = "true";
    const headers = new CacheHeaders().swr();
    assert.strictEqual(
      headers.get("Netlify-CDN-Cache-Control"),
      "public,s-maxage=0,tiered,stale-while-revalidate=604800",
    );
    delete process.env.NETLIFY;
  });

  it("should chain methods", () => {
    const headers = new CacheHeaders([["content-type", "application/json"]])
      .swr(ONE_DAY)
      .tag("tag1")
      .tag("tag2", "tag3");
    assert.strictEqual(
      headers.get("CDN-Cache-Control"),
      "public,s-maxage=0,stale-while-revalidate=86400",
    );
    assert.strictEqual(
      headers.get("Cache-Control"),
      "public,max-age=0,must-revalidate",
    );
    assert.strictEqual(headers.get("Cache-Tag"), "tag1,tag2,tag3");
    assert.strictEqual(headers.get("Content-Type"), "application/json");
  });

  it("can return headers as a plain object", () => {
    const headers = new CacheHeaders([["x-foo", "bar"]])
      .swr()
      .tag("tag1")
      .tag("tag2", "tag3")
      .toObject();
    assert.deepStrictEqual(headers, {
      "x-foo": "bar",
      "cdn-cache-control": "public,s-maxage=0,stale-while-revalidate=604800",
      "cache-control": "public,max-age=0,must-revalidate",
      "cache-tag": "tag1,tag2,tag3",
    });
  });
});
