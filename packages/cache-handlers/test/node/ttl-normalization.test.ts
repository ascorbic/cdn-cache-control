import { beforeEach, describe, expect, test, vi } from "vitest";
import { caches } from "undici";
import { createCacheHandler } from "../../src/index.ts";

describe("TTL Normalization", () => {
	beforeEach(async () => {
		await caches.delete("ttl-test");
	});

	test("cache-control with s-maxage works for caching", async () => {
		const handle = createCacheHandler({ cacheName: "ttl-test" });
		const request = new Request("http://example.com/api/s-maxage");
		const handler = vi.fn(() =>
			new Response("s-maxage data", {
				headers: {
					"cache-control": "s-maxage=3600, public",
					"cache-tag": "test",
				},
			})
		);

		const response = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(await response.text()).toBe("s-maxage data");
		expect(response.headers.has("cache-tag")).toBe(true);

		// Second request should be cached
		const cachedResponse = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1); // No additional calls
		expect(await cachedResponse.text()).toBe("s-maxage data");
	});

	test("cache-control with max-age does NOT work for caching", async () => {
		const handle = createCacheHandler({ cacheName: "ttl-test" });
		const request = new Request("http://example.com/api/max-age");
		const handler = vi.fn(() =>
			new Response("max-age data", {
				headers: {
					"cache-control": "max-age=3600, public",
					"cache-tag": "test",
				},
			})
		);

		const response = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(await response.text()).toBe("max-age data");

		// Second request should NOT be cached (handler called again)
		const uncachedResponse = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(2); // Called again
		expect(await uncachedResponse.text()).toBe("max-age data");
	});

	test("cdn-cache-control with max-age works for caching", async () => {
		const handle = createCacheHandler({ cacheName: "ttl-test" });
		const request = new Request("http://example.com/api/cdn-max-age");
		const handler = vi.fn(() =>
			new Response("cdn-max-age data", {
				headers: {
					"cdn-cache-control": "max-age=3600, public",
					"cache-tag": "test",
				},
			})
		);

		const response = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(await response.text()).toBe("cdn-max-age data");
		expect(response.headers.has("cache-tag")).toBe(true);
		expect(response.headers.has("cdn-cache-control")).toBe(false); // Should be removed

		// Second request should be cached
		const cachedResponse = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1); // No additional calls
		expect(await cachedResponse.text()).toBe("cdn-max-age data");
	});

	test("cdn-cache-control takes precedence over cache-control", async () => {
		const handle = createCacheHandler({ cacheName: "ttl-test" });
		const request = new Request("http://example.com/api/precedence");
		const handler = vi.fn(() =>
			new Response("precedence data", {
				headers: {
					"cache-control": "max-age=7200, public", // Should be ignored
					"cdn-cache-control": "max-age=3600, private", // Should be used
					"cache-tag": "test",
				},
			})
		);

		const response = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(1);

		// Should not be cached because cdn-cache-control has private
		const uncachedResponse = await handle(request, { handler });
		expect(handler).toHaveBeenCalledTimes(2); // Called again due to private
	});

	test("cache-control directives are filtered correctly", async () => {
		const handle = createCacheHandler({ cacheName: "ttl-test" });
		const request = new Request("http://example.com/api/filter");
		const handler = vi.fn(() =>
			new Response("filter data", {
				headers: {
					"cache-control": "s-maxage=3600, stale-while-revalidate=60, max-age=7200, public",
					"cache-tag": "test",
				},
			})
		);

		const response = await handle(request, { handler });
		
		// Check that used directives are removed but others remain
		const cacheControl = response.headers.get("cache-control");
		expect(cacheControl).not.toContain("s-maxage"); // Should be removed
		expect(cacheControl).not.toContain("stale-while-revalidate"); // Should be removed
		expect(cacheControl).toContain("max-age=7200"); // Should remain (for browsers)
		expect(cacheControl).toContain("public"); // Should remain
	});
});