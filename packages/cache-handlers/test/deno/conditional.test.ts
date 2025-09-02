import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import {
	create304Response,
	generateETag,
	validateConditionalRequest,
} from "../../src/conditional.ts";
import { createCacheHandler } from "../../src/handlers.ts";

Deno.test("Conditional Requests - ETag generation", async () => {
	const response = new Response("test content", {
		headers: { "content-type": "text/plain" },
	});

	const etag = await generateETag(response);

	assertExists(etag);
	assertEquals(typeof etag, "string");
	assert(etag.startsWith('"'));
	assert(etag.endsWith('"'));
});


Deno.test("Conditional Requests - validateConditionalRequest with ETag", () => {
	const request = new Request("https://example.com/test", {
		headers: {
			"if-none-match": '"abc123"',
		},
	});

	const cachedResponse = new Response("cached data", {
		headers: {
			etag: '"abc123"',
			"content-type": "text/plain",
		},
	});

	const result = validateConditionalRequest(request, cachedResponse);

	assert(result.matches);
	assert(result.shouldReturn304);
	assertEquals(result.matchedValidator, "etag");
});

Deno.test(
	"Conditional Requests - validateConditionalRequest with Last-Modified",
	() => {
		const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";
		const ifModifiedSince = "Wed, 21 Oct 2015 07:28:00 GMT";

		const request = new Request("https://example.com/test", {
			headers: {
				"if-modified-since": ifModifiedSince,
			},
		});

		const cachedResponse = new Response("cached data", {
			headers: {
				"last-modified": lastModified,
				"content-type": "text/plain",
			},
		});

		const result = validateConditionalRequest(request, cachedResponse);

		assert(result.matches);
		assert(result.shouldReturn304);
		assertEquals(result.matchedValidator, "last-modified");
	},
);

Deno.test("Conditional Requests - 304 response creation", () => {
	const cachedResponse = new Response("cached data", {
		headers: {
			etag: '"abc123"',
			"last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
			"cache-control": "max-age=3600",
			"content-type": "application/json",
			vary: "Accept-Encoding",
			server: "nginx/1.20.0",
			"x-custom": "should-not-be-included",
		},
	});

	const response304 = create304Response(cachedResponse);

	assertEquals(response304.status, 304);
	assertEquals(response304.statusText, "Not Modified");
	// 304 responses should not have a body
	assertEquals(response304.body, null);

	// Should include required/allowed headers
	assertEquals(response304.headers.get("etag"), '"abc123"');
	assertEquals(
		response304.headers.get("last-modified"),
		"Wed, 21 Oct 2015 07:28:00 GMT",
	);
	assertEquals(response304.headers.get("cache-control"), "max-age=3600");
	assertEquals(response304.headers.get("content-type"), "application/json");
	assertEquals(response304.headers.get("vary"), "Accept-Encoding");
	assertEquals(response304.headers.get("server"), "nginx/1.20.0");
	assertExists(response304.headers.get("date"));

	// Should not include non-standard headers
	assertEquals(response304.headers.get("x-custom"), null);
});


Deno.test("Conditional Requests - unified handler returns 304 for matching ETag", async () => {
	await caches.delete("conditional-test");
	const cacheName = "conditional-test";
	const cache = await caches.open(cacheName);
	const handle = createCacheHandler({
		cacheName,
		features: { conditionalRequests: true },
	});
	const cacheKey = "https://example.com/api/conditional";
	await cache.put(
		new URL(cacheKey),
		new Response("cached data", {
			headers: {
				etag: '"test-etag-123"',
				"content-type": "application/json",
				expires: new Date(Date.now() + 3600000).toUTCString(),
			},
		}),
	);
	const result = await handle(
		new Request(cacheKey, { headers: { "if-none-match": '"test-etag-123"' } }),
		{ handler: () => Promise.resolve(new Response("fresh")) },
	);
	assertExists(result);
	assertEquals(result.status, 304);
	assertEquals(result.body, null);
	assertEquals(result.headers.get("etag"), '"test-etag-123"');
	await caches.delete("conditional-test");
});

Deno.test("Conditional Requests - unified handler returns 304 for matching Last-Modified", async () => {
	await caches.delete("conditional-test-date");
	const cacheName = "conditional-test-date";
	const cache = await caches.open(cacheName);
	const handle = createCacheHandler({
		cacheName,
		features: { conditionalRequests: true },
	});
	const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";
	const cacheKey = "https://example.com/api/conditional-date";
	await cache.put(
		new URL(cacheKey),
		new Response("cached data", {
			headers: {
				"last-modified": lastModified,
				"content-type": "application/json",
				expires: new Date(Date.now() + 3600000).toUTCString(),
			},
		}),
	);
	const result = await handle(
		new Request(cacheKey, { headers: { "if-modified-since": lastModified } }),
		{ handler: () => Promise.resolve(new Response("fresh")) },
	);
	assertExists(result);
	assertEquals(result.status, 304);
	assertEquals(result.body, null);
	assertEquals(result.headers.get("last-modified"), lastModified);
	assertEquals(result.headers.get("content-type"), "application/json");
	await caches.delete(cacheName);
});

Deno.test("Conditional Requests - unified handler ETag generation", async () => {
	await caches.delete("conditional-generate-etag");
	const cacheName = "conditional-generate-etag";
	const handle = createCacheHandler({
		cacheName,
		features: { conditionalRequests: { etag: "generate" } },
	});
	const url = "https://example.com/api/generate-etag";
	await handle(new Request(url), {
		handler: () =>
			Promise.resolve(
				new Response("etag-body", {
					headers: {
						"cache-control": "public, s-maxage=3600",
						"content-type": "application/json",
					},
				}),
			),
	});
	const cache = await caches.open(cacheName);
	const cached = await cache.match(url);
	assertExists(cached);
	assertExists(cached!.headers.get("etag"));
	await cached!.clone().text();
	await caches.delete(cacheName);
});


Deno.test("Conditional Requests - disabled returns full response", async () => {
	await caches.delete("conditional-disabled-test");
	const cacheName = "conditional-disabled-test";
	const cache = await caches.open(cacheName);
	const handle = createCacheHandler({
		cacheName,
		features: { conditionalRequests: false },
	});
	const cacheKey = "https://example.com/api/disabled";
	await cache.put(
		new URL(cacheKey),
		new Response("cached data", {
			headers: {
				etag: '"should-be-ignored"',
				expires: new Date(Date.now() + 3600000).toUTCString(),
			},
		}),
	);
	const result = await handle(
		new Request(cacheKey, {
			headers: { "if-none-match": '"should-be-ignored"' },
		}),
		{ handler: () => Promise.resolve(new Response("fresh")) },
	);
	assertEquals(result.status, 200);
	assertEquals(await result.text(), "cached data");
	await caches.delete(cacheName);
});
