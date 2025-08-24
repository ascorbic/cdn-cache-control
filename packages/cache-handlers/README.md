# cache-handlers

Fully-featured, modern, standards-based HTTP caching library designed for server-side rendered web apps. Get the features of a modern CDN built into your app.

Modern CDNs such as Cloudflare, Netlify and Fastly include powerful features that allow you to cache responses, serve stale content while revalidating in the background, and invalidate cached content by tags or paths. This library brings those capabilities to your server-side code with a simple API. This is particularly useful if you're not running your app behind a modern caching CDN. Ironically, this includes Cloudflare, because Workers run in front of the cache.

## How it works

Set standard HTTP headers in your SSR pages or API responses, and this library will handle caching. It will cache responses as needed, and return cached data if available. It supports standard headers like `Cache-Control`, `CDN-Cache-Control`, `Cache-Tag`, `Vary`, `ETag`, and `Last-Modified`. It can handle conditional requests using `If-Modified-Since` and `If-None-Match`. This also supports a custom `Cache-Vary` header (inspired by [`Netlify-Vary`](https://www.netlify.com/blog/netlify-cache-key-variations/)) that allows you to specify which headers, cookies, or query parameters should be used for caching.

## Supported runtimes

This library uses the web stqndard [`CacheStorage`](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) API for storage, which is available in modern runtimes like Cloudflare Workers, Netlify Edge and Deno. It can also be used in Node.js using the Node.js [`undici`](https://undici.nodejs.org/) polyfill.

## Install

```bash
pnpm i cache-handlers
# or
npm i cache-handlers
```

## Quick Start

```ts
// handleRequest.ts
export async function handleRequest(_req: Request) {
	return new Response("Hello World", {
		headers: {
			// Fresh for 60s, allow serving stale for 5m while background refresh runs
			"cdn-cache-control": "public, max-age=60, stale-while-revalidate=300",
			// Tag for later invalidation
			"cache-tag": "home, content",
		},
	});
}

// route.ts
import { createCacheHandler } from "cache-handlers";
import { handleRequest } from "./handleRequest.js";

export const GET = createCacheHandler({
	handler: handleRequest,
	features: { conditionalRequests: { etag: "generate" } },
});
```

## Node 20+ Usage (Undici Polyfill)

Node.js ships `CacheStorage` as part of `Undici`, but it is not available by default. To use it, you need to install the `undici` polyfill and set it up in your code:

```bash
pnpm i undici
# or
npm i undici
```

```ts
import { createServer } from "node:http";
import { caches, install } from "undici";
import { createCacheHandler } from "cache-handlers";
// Use Unidici for Request, Response, Headers, etc.
install();

import { handleRequest } from "./handleRequest.js";
const handle = createCacheHandler({
	handler: handleRequest,
	features: { conditionalRequests: { etag: "generate" } },
});

createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", "http://localhost:3000");
	const request = new Request(url, {
		method: req.method,
		headers: req.headers as HeadersInit,
	});

	const response = await handle(request);
	res.statusCode = response.status;
	response.headers.forEach((v, k) => res.setHeader(k, v));
	if (response.body) {
		const buf = Buffer.from(await response.arrayBuffer());
		res.end(buf);
	} else {
		res.end();
	}
}).listen(3000, () => console.log("Listening on http://localhost:3000"));
```

## Other Runtimes

### Cloudflare Workers

```ts
import { createCacheHandler } from "cache-handlers";
import handler from "./handler.js"; // Your ssr handler function
const handle = createCacheHandler({
	handler,
});
export default {
	async fetch(request, env, ctx) {
		return handle(request, {
			runInBackground: ctx.waitUntil.bind(ctx),
		});
	},
};
```

### Deno / Deploy

```ts
import { createCacheHandler } from "jsr:@ascorbic/cache-handlers";
import { handleRequest } from "./handleRequest.ts";
const handle = createCacheHandler({ handler: handleRequest });
Deno.serve((req) => handle(req));
```

## SWR (Stale-While-Revalidate)

Just send the directive in your upstream response:

```http
CDN-Cache-Control: public, max-age=30, stale-while-revalidate=300
```

While inside the SWR window the _stale_ cached response is returned immediately and a background revalidation run is triggered.

To use a runtime scheduler (eg Workers' `event.waitUntil`):

```ts
import handler from "./handler.js";

addEventListener("fetch", (event) => {
	const handle = createCacheHandler({
		handler: handleRequest,
		runInBackground: event.waitUntil.bind(event),
	});
	event.respondWith(handle(event.request));
});
```

## Invalidation

Tag and path invalidation helpers work against the same underlying cache.

```ts
import {
	getCacheStats,
	invalidateAll,
	invalidateByPath,
	invalidateByTag,
} from "cache-handlers";

await invalidateByTag("home");
await invalidateByPath("/docs/intro");
const removed = await invalidateAll();
const stats = await getCacheStats();
console.log(stats.totalEntries, stats.entriesByTag);
```

## Configuration Overview (`CacheConfig`)

| Option                                      | Purpose                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cacheName`                                 | Named cache to open (defaults to `caches.default` if present, else `cache-primitives-default`) |
| `cache`                                     | Provide a `Cache` instance directly                                                            |
| `handler`                                   | Function invoked on misses / background revalidation                                           |
| `swr`                                       | SWR policy: `background` (default), `blocking`, or `off`                                        |
| `defaultTtl`                                | Fallback TTL (seconds) when no cache headers present                                           |
| `maxTtl`                                    | Upper bound to clamp any TTL (seconds)                                                         |
| `getCacheKey`                               | Custom key generator `(request) => string`                                                     |
| `runInBackground`                           | Scheduler for SWR tasks (eg `waitUntil`)                                                       |
| `features.conditionalRequests`              | `true`, `false` or config object (ETag, Last-Modified)                                         |
| `features.cacheTags`                        | Enable `Cache-Tag` parsing (default true)                                                      |
| `features.cacheVary`                        | Enable `Cache-Vary` parsing (default true)                                                     |
| `features.vary`                             | Respect standard `Vary` header (default true)                                                  |
| `features.cacheControl` / `cdnCacheControl` | Header support toggles                                                                         |
| `features.cacheStatusHeader`               | Emit `Cache-Status` header (boolean = default name, string = custom name)                      |

Minimal example:

```ts
import { handleRequest } from "./handleRequest.js";
createCacheHandler({ handler: handleRequest });
```

## Conditional Requests (ETag / Last-Modified)

Enable with auto ETag generation:

```ts
import { handleRequest } from "./handleRequest.js";
createCacheHandler({
	handler: handleRequest,
	features: { conditionalRequests: { etag: "generate", lastModified: true } },
});
```


## Backend-Driven Variations (`Cache-Vary` – custom header)

`Cache-Vary` is a _non-standard_, library-specific response header. It augments the standard `Vary` mechanism by letting you list only the precise components you want included in the cache key (headers, cookies, query params) without emitting a large `Vary` header externally. The library consumes & strips it when constructing the internal key.

Add selective vary dimensions without inflating the standard `Vary` header:

```http
Cache-Vary: header=Accept-Language, cookie=session_id, query=version
```

Each listed dimension becomes part of the derived cache key. Standard `Vary` remains fully respected; `Cache-Vary` is additive and internal – safe to use even if unknown to intermediaries.

## Cache-Status Header (optional)

You can opt-in to emitting the [RFC 9211 `Cache-Status`](https://www.rfc-editor.org/rfc/rfc9211) response header to aid debugging and observability.

Enable it with a boolean (uses the default cache name `cache-handlers`) or provide a custom cache identifier string:

```ts
import { handleRequest } from "./handleRequest.js";
createCacheHandler({
	handler: handleRequest,
	features: { cacheStatusHeader: true }, // => Cache-Status: cache-handlers; miss; ttl=59
});

createCacheHandler({
	handler: handleRequest,
	features: { cacheStatusHeader: "edge-cache" }, // => Cache-Status: edge-cache; hit; ttl=42
});
```

Format emitted:

```
Cache-Status: <name>; miss; ttl=123
Cache-Status: <name>; hit; ttl=120
Cache-Status: <name>; hit; stale; ttl=0
```

Notes:
* `ttl` is derived from the `Expires` header if present.
* `stale` appears when within the `stale-while-revalidate` window.
* Header is omitted entirely when the feature flag is disabled (default).

## Types

```ts
import type {
	CacheConfig,
	CacheHandle,
	ConditionalRequestConfig,
	HandlerFunction,
	HandlerInfo,
	HandlerMode,
	InvalidationOptions,
	SWRPolicy,
} from "cache-handlers";
```

## Important Caveats & behaviour

### Race Conditions

**Concurrent Cache Writes**: Multiple simultaneous requests for the same resource may result in duplicate cache writes. The last write wins, but all requests will complete successfully. This is generally harmless but may cause temporary inconsistency during high concurrency.

**Background Revalidation**: When using `stale-while-revalidate`, multiple concurrent requests during the SWR window will each trigger their own background revalidation. The library does not deduplicate these - each will run independently. Consider using request deduplication at the application level if this is a concern.

**Invalidation During Revalidation**: Cache invalidation operations may occur while background revalidation is in progress. The invalidation will complete immediately, but in-flight revalidations may still write back to the cache, potentially restoring stale data.

### Platform-Specific CacheStorage behaviour

Different platforms implement the Web Standard `CacheStorage` API with varying capabilities and limitations:

#### Cloudflare Workers
```ts
// ✅ Full support for all features
// ✅ Persistent across requests within the same data center
// ✅ Automatic geographic distribution
// ⚠️  Cache keys limited to ~8KB total URL length
// ⚠️  Cache entries expire after ~1 hour of inactivity
```

#### Deno Deploy
```ts
// ✅ Full CacheStorage support
// ✅ Persistent across deployments in same region
// ⚠️  Regional caches - not globally distributed
// ⚠️  Cache may not persist during deployment updates
```

#### Node.js (with undici polyfill)
```ts
// ✅ Works via undici polyfill
// ⚠️  In-memory only by default - not persistent across restarts
// ⚠️  Limited to single process - no cross-process sharing
```

#### Netlify Edge Functions
```ts
// ✅ CacheStorage available
// ⚠️  Cache is per-edge location, not globally consistent
// ⚠️  Cache may be cleared during deployments
```

#### Vercel Edge Runtime
```ts
// ❌ CacheStorage not available
// 💡 Use Vercel's built-in caching mechanisms instead
```

### Memory and Performance Considerations

**Large Responses**: Caching large responses (>1MB) may impact performance and memory usage. Consider streaming or chunked responses for large payloads.

**Cache Key Generation**: Complex cache key generation (e.g., with many vary parameters) can impact performance. Keep cache keys simple when possible.

**Metadata Overhead**: Cache tag metadata is stored separately and may grow large with many tagged entries. Monitor cache statistics and clean up unused tags periodically.

### Debugging and Monitoring

Enable debug logging to understand cache behaviour:

```ts
createCacheHandler({
  debug: {
    enabled: true,
    logLevel: 'verbose' // Use 'basic' in production
  }
});
```

Monitor cache statistics:

```ts
import { getCacheStats } from 'cache-handlers';
const stats = await getCacheStats();
console.log(`Cache: ${stats.totalEntries} entries, ${Object.keys(stats.entriesByTag).length} tags`);
```

## Best Practices

1. Always bound TTLs with `maxTtl`.
2. Use `stale-while-revalidate` for latency-sensitive endpoints.
3. Include cache tags for selective purge (`cache-tag: user:123, list:users`).
4. Generate or preserve ETags to leverage client 304s.
5. Keep cache keys stable & explicit if customizing via `getCacheKey`.
6. Test cache behaviour thoroughly across your target platforms.
7. Monitor cache hit rates and adjust TTLs based on usage patterns.
8. Use debug logging during development to understand cache behaviour.

## License

MIT

---

Have ideas / issues? PRs welcome.
