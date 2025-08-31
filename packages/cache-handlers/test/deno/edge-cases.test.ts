import { assert, assertEquals } from "jsr:@std/assert";
import { defaultGetCacheKey } from "../../src/utils.ts";

// Keep only genuinely useful edge cases that test actual user scenarios

Deno.test("Edge Cases - Cache key uniqueness with vary headers", () => {
	// Test that cache keys are unique when using vary headers
	const request1 = new Request("https://example.com/api/users", {
		headers: { "x-user": "admin" },
	});
	const request2 = new Request("https://example.com/api/users", {
		headers: { "x-user": "guest" },
	});

	const vary = { headers: ["x-user"], cookies: [], query: [] };
	const key1 = defaultGetCacheKey(request1, vary);
	const key2 = defaultGetCacheKey(request2, vary);

	// Keys should be different for different header values
	assert(key1 !== key2, "Cache keys should be unique for different vary header values");
	assert(key1.includes("admin"), "Cache key should include vary header value");
	assert(key2.includes("guest"), "Cache key should include vary header value");
});

Deno.test("Edge Cases - Empty and whitespace-only headers", () => {
	const emptyHeaders = [
		"", // Empty string
		"   ", // Whitespace only
		"\t", // Tab only
		"\n", // Newline only
		"\r\n", // CRLF
		" \t \n \r ", // Mixed whitespace
	];

	for (const header of emptyHeaders) {
		// Should handle gracefully without throwing
		const request = new Request("https://example.com/api/test", {
			headers: { "cache-control": header },
		});
		const cacheKey = defaultGetCacheKey(request);
		assertEquals(typeof cacheKey, "string");
		assert(cacheKey.startsWith("https://example.com/"));
	}
});