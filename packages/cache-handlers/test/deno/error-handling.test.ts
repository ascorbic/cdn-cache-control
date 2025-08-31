import {
	assert,
	assertEquals,
	assertExists,
	assertRejects,
	assertThrows,
} from "jsr:@std/assert";
import { readFromCache } from "../../src/read.ts";
import { writeToCache } from "../../src/write.ts";
import { defaultGetCacheKey, isCacheValid } from "../../src/utils.ts";
import {
	getCacheStats,
	invalidateByPath,
	invalidateByTag,
} from "../../src/invalidation.ts";
import { parseCacheControl, parseCacheTags, parseResponseHeaders } from "../../src/utils.ts";

import { FailingCache } from "./test_utils.ts";

Deno.test("Error Handling - ReadHandler with cache match failure", async () => {
	const failingCache = new FailingCache("match");
	const request = new Request("https://example.com/api/users");
	await assertRejects(
		() => readFromCache(request, { cache: failingCache }),
		Error,
		"Cache match failed",
	);
	await caches.delete("test");
});

Deno.test("Error Handling - WriteHandler with cache put failure", async () => {
	const failingCache = new FailingCache("put");

	const response = new Response("test data", {
		headers: {
			"cache-control": "max-age=3600, public",
			"cache-tag": "user:123",
		},
	});
	Object.defineProperty(response, "url", {
		value: "https://example.com/api/users",
		writable: false,
	});

	// Should handle cache put failure gracefully and return processed response
	const request = new Request("https://example.com/api/users");
	const result = await writeToCache(request, response, { cache: failingCache });
	
	// Should return the response with headers processed despite cache failure
	assertExists(result);
	assertEquals(await result.text(), "test data");
});

Deno.test(
	"Error Handling - WriteHandler with missing response URL",
	async () => {
		const config = { cacheName: "test" } as const;

		const response = new Response("test data", {
			headers: {
				"cache-control": "max-age=3600, public",
				"cache-tag": "user:123",
			},
		});
		// Don't set URL property, leaving it empty

		const request = new Request("https://example.com/api/users");
		const result = await writeToCache(request, response, config);

		// Should handle missing response URL gracefully and return processed response
		assertExists(result);
		assert(result.headers.has("cache-tag"));
		assertEquals(await result.text(), "test data");

		// Note: Caching may fail silently due to metadata operation errors,
		// but the function should still return the processed response
		await caches.delete("test");
	},
);

Deno.test(
	"Error Handling - InvalidateByTag with cache operations failure",
	async () => {
		const failingCache = new FailingCache("match");

		// Should throw when cache.match fails during metadata retrieval
		await assertRejects(
			() => invalidateByTag("user", { cache: failingCache }),
			Error,
			"Cache match failed",
		);
	},
);

Deno.test("Error Handling - InvalidateByTag with delete failure", async () => {
	const cache = await caches.open("test");

	// Add a valid cached response
	await cache.put(
		new Request("http://example.com/api/users"),
		new Response("users data", {
			headers: {
				"cache-tag": "user",
				expires: new Date(Date.now() + 3600000).toUTCString(),
			},
		}),
	);

	// Create a cache that fails on delete
	const failingDeleteCache = new FailingCache("delete");
	// Override keys to return the cached entry
	failingDeleteCache.matchAll = () =>
		Promise.resolve([
			new Response("users data", {
				headers: {
					"cache-tag": "user",
					expires: new Date(Date.now() + 3600000).toUTCString(),
				},
			}),
		] as Response[]);
	failingDeleteCache.match = () =>
		Promise.resolve(
			new Response("users data", {
				headers: {
					"cache-tag": "user",
					expires: new Date(Date.now() + 3600000).toUTCString(),
				},
			}),
		);

	// Should handle delete failures gracefully and return count of successful deletes
	const deletedCount = await invalidateByTag("user", {
		cache: failingDeleteCache,
	});
	assertEquals(deletedCount, 0); // No successful deletes
	await caches.delete("test");
});

Deno.test(
	"Error Handling - GetCacheStats with corrupted metadata",
	async () => {
		await caches.delete("test"); // Clean start
		const cache = await caches.open("test");

		// Put corrupted metadata directly in the metadata store
		await cache.put(
			new Request("https://cache-internal/cache-tag-metadata"),
			new Response('{"valid":["https://example.com/api/valid"],"corru', {
				headers: { "Content-Type": "application/json" },
			}),
		);

		const stats = await getCacheStats({ cacheName: "test" });

		// Should return empty stats when metadata is corrupted
		assertEquals(stats.totalEntries, 0);
		assertEquals(Object.keys(stats.entriesByTag).length, 0);
		await caches.delete("test");
	},
);

Deno.test("Error Handling - Cache control parsing handles malformed input", () => {
	// Test that cache control parsing doesn't break with invalid input
	const response = new Response("test", {
		headers: {
			"cache-control": "max-age=invalid, private",
		},
	});

	const result = parseResponseHeaders(response);
	assertEquals(typeof result, "object");
	// Should have parsed what it could
	assert(result.isPrivate === true);
});

Deno.test("Error Handling - Cache tag parsing filters empty values", () => {
	// Test that empty tags are filtered out properly
	const response = new Response("test", {
		headers: {
			"cache-tag": "valid, , another-valid",
		},
	});

	const result = parseResponseHeaders(response);
	assert(Array.isArray(result.tags));
	assertEquals(result.tags.length, 2);
	assert(result.tags.includes("valid"));
	assert(result.tags.includes("another-valid"));
});





Deno.test(
	"Error Handling - InvalidateByPath with malformed cache keys",
	async () => {
		const config = { cacheName: "test" } as const;
		await caches.delete("test"); // Clean start

		// Create one valid entry with proper metadata
		const response = new Response("data", {
			headers: {
				"cache-control": "s-maxage=3600, public",
				"cache-tag": "test",
			},
		});
		const request = new Request("https://example.com/valid/path");
		await writeToCache(request, response, config);

		// Put malformed metadata in the metadata store
		const cache = await caches.open("test");
		await cache.put(
			new Request("https://cache-internal/cache-primitives-metadata"),
			Response.json({
				test: [
					"https://example.com/valid/path", // Valid URL
					"invalid-malformed-url", // Malformed URL
					"not://valid/protocol", // Invalid protocol
				],
			}, {
				headers: { "Content-Type": "application/json" },
			}),
		);

		// Should handle malformed keys gracefully and only delete valid ones  
		const deletedCount = await invalidateByPath("/valid", {
			cacheName: "test",
		});
		assertEquals(deletedCount, 1); // Only the valid one should match
		await caches.delete("test");
	},
);

Deno.test("Error Handling - Response body reading errors", async () => {
	await caches.open("test");
	const config = { cacheName: "test" } as const;

	// Create a response with a body that will error when read
	const response = new Response(
		new ReadableStream({
			start(controller) {
				controller.error(new Error("Stream error"));
			},
		}),
		{
			headers: {
				"cache-control": "max-age=3600, public",
				"cache-tag": "user:123",
			},
		},
	);
	Object.defineProperty(response, "url", {
		value: "https://example.com/api/users",
		writable: false,
	});

	// Should handle stream errors gracefully and return processed response
	const request = new Request("https://example.com/api/users");
	const result = await writeToCache(request, response, config);
	
	// Should return the response with headers processed despite stream failure
	assertExists(result);
	assert(result instanceof Response);
	await caches.delete("test");
});

Deno.test("Error Handling - Response body already consumed", async () => {
	const config = { cacheName: "test" } as const;

	// Test handling of consumed response
	const response = new Response("test data", {
		headers: {
			"cache-control": "max-age=3600, public",
		},
	});
	Object.defineProperty(response, "url", {
		value: "https://example.com/api/test",
		writable: false,
	});

	// Consume the response body
	await response.text();

	// Should handle consumed response gracefully
	const request = new Request("https://example.com/api/test");
	try {
		const result = await writeToCache(request, response, config);
		// If no error, verify result exists
		if (result) {
			assert(result instanceof Response);
		}
	} catch (error) {
		// Expected error for consumed response
		assert(
			error instanceof Error && 
			(error.message.includes("disturbed") || error.message.includes("unusable")),
			`Unexpected error: ${(error as Error).message}`
		);
	}
	await caches.delete("test");
});
