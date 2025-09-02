import type { CacheConfig } from "./types.ts";
import {
	defaultGetCacheKey,
	getCache,
	parseResponseHeaders,
	removeHeaders,
	validateCacheTags,
} from "./utils.ts";
import { generateETag } from "./conditional.ts";
import { updateTagMetadata, updateVaryMetadata } from "./metadata.ts";
import { createDebugLogger } from "./debug.ts";

const METADATA_KEY = "https://cache-internal/cache-primitives-metadata";
const VARY_METADATA_KEY = "https://cache-internal/cache-vary-metadata";

export async function writeToCache(
	request: Request,
	response: Response,
	config: CacheConfig<Request, Response> = {},
): Promise<Response> {
	const debug = createDebugLogger(config.debug);

	if (request.method !== "GET") {
		debug.verbose(
			"write",
			`Skipping cache write for non-GET request: ${request.method} ${request.url}`,
		);
		return response;
	}
	const getCacheKey = config.getCacheKey || defaultGetCacheKey;
	const cache = await getCache(config);
	const cacheInfo = parseResponseHeaders(response, config);
	if (!cacheInfo.shouldCache) {
		debug.verbose("write", `Response not cacheable: ${request.url}`, {
			isPrivate: cacheInfo.isPrivate,
			noCache: cacheInfo.noCache,
			noStore: cacheInfo.noStore,
		});
		return removeHeaders(response, cacheInfo.headersToRemove, cacheInfo.filteredCacheControl);
	}
	const cacheKey = await getCacheKey(request, cacheInfo.vary);
	debug.logCacheWrite(request.url, cacheInfo.ttl, cacheInfo.tags);
	debug.verbose("write", `Cache key: ${cacheKey}`);

	const responseToCache = response.clone();
	const headers = new Headers(responseToCache.headers);
	if (cacheInfo.shouldGenerateETag) {
		const features = config.features ?? {};
		const conditionalConfig = typeof features.conditionalRequests === "object"
			? features.conditionalRequests
			: {};
		if (conditionalConfig.etagGenerator) {
			const etag = await conditionalConfig.etagGenerator(responseToCache);
			headers.set("etag", etag);
		} else {
			const etag = await generateETag(responseToCache);
			headers.set("etag", etag);
		}
	}
	if (cacheInfo.ttl) {
		const expiresAt = new Date(Date.now() + cacheInfo.ttl * 1000);
		headers.set("expires", expiresAt.toUTCString());
	}
	if (cacheInfo.tags.length > 0) {
		const validatedTags = validateCacheTags(cacheInfo.tags);
		headers.set("cache-tag", validatedTags.join(", "));
	}
	const cacheResponse = new Response(responseToCache.body, {
		status: responseToCache.status,
		statusText: responseToCache.statusText,
		headers,
	});
	await cache.put(cacheKey, cacheResponse);
	if (cacheInfo.tags.length > 0) {
		const validatedTags = validateCacheTags(cacheInfo.tags);
		await updateTagMetadata(cache, METADATA_KEY, validatedTags, cacheKey);
	}
	if (cacheInfo.vary) {
		await updateVaryMetadata(
			cache,
			VARY_METADATA_KEY,
			request.url,
			cacheInfo.vary,
		);
	}
	return removeHeaders(response, cacheInfo.headersToRemove, cacheInfo.filteredCacheControl);
}
