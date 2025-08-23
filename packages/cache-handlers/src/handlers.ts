import type {
	CacheConfig,
	CacheHandle,
	HandlerFunction,
	MinimalRequest,
	MinimalResponse,
	SWRPolicy,
} from "./types.ts";
import { readFromCache } from "./read.ts";
import { writeToCache } from "./write.ts";

export function createCacheHandler<
	TRequest extends MinimalRequest = Request,
	TResponse extends MinimalResponse = Response,
>(
	options: CacheConfig<TRequest, TResponse> = {},
): CacheHandle<TRequest, TResponse> {
	const baseHandler: HandlerFunction<TRequest, TResponse> | undefined =
		options.handler;

	const handle: CacheHandle<TRequest, TResponse> = async (
		request,
		callOpts = {},
	): Promise<TResponse> => {
		// Only cache GET
		if (request.method !== "GET") {
			const handler = callOpts.handler || baseHandler;
			if (!handler) {
				return new Response("No handler provided", {
					status: 500,
				}) as unknown as TResponse;
			}
			return handler(request, { mode: "miss", background: false });
		}

		const { cached, needsBackgroundRevalidation } = await readFromCache(
			request,
			options,
		);
		const statusSetting = options.features?.cacheStatusHeader;
		const enableStatus = !!statusSetting;
		const cacheStatusName =
			typeof statusSetting === "string" && statusSetting.trim()
				? statusSetting.trim()
				: "cache-handlers";
		if (cached) {
			const policy: SWRPolicy = callOpts.swr || options.swr || "background";
			if (needsBackgroundRevalidation) {
				if (policy === "blocking") {
					const handler = baseHandler || callOpts.handler;
					if (handler) {
						try {
							const fresh = await handler(request, {
								mode: "stale",
								background: false,
							});
							return await writeToCache(request, fresh, options);
						} catch (err) {
							console.warn(
								"SWR blocking revalidation failed; serving stale",
								err,
							);
						}
					}
				} else if (policy === "background") {
					const handler = baseHandler || callOpts.handler;
					if (handler) {
						const scheduler = callOpts.runInBackground ||
							options.runInBackground;
						const revalidatePromise = (async () => {
							try {
								const response = await handler(request, {
									mode: "stale",
									background: true,
								});
								await writeToCache(request, response, options);
							} catch (err) {
								console.warn("SWR background revalidation failed", err);
							}
						})();
						if (scheduler) {
							scheduler(revalidatePromise);
						} else {
							queueMicrotask(() => void revalidatePromise);
						}
					}
				} else if (policy === "off") {
					// Treat stale-while-revalidate as disabled: delete and proceed as miss
					try {
						await caches.open(options.cacheName || "cache-primitives-default")
							.then((c) => c.delete(request as unknown as Request));
					} catch (_) {
						// ignore
					}
					// fall through to miss path below
					cached.body?.cancel();
					// Force miss logic by not returning cached
				} else {
					// Unknown policy -> default to background
				}
				if (policy === "off") {
					// continue to miss logic
				} else {
					if (enableStatus) {
						const headers = new Headers(cached.headers as HeadersInit);
						const parts = [cacheStatusName, "hit", "stale"];
						const expires = headers.get("expires");
						if (expires) {
							const diff = Date.parse(expires) - Date.now();
							if (!isNaN(diff)) {
								parts.push(`ttl=${Math.max(0, Math.round(diff / 1000))}`);
							}
						}
						headers.set("cache-status", parts.join("; "));
						return new Response(cached.body, {
							status: cached.status,
							statusText: cached.statusText,
							headers,
						}) as unknown as TResponse;
					}
					return cached;
				}
			} else {
				if (enableStatus) {
					const headers = new Headers(cached.headers as HeadersInit);
					const parts = [cacheStatusName, "hit"];
					const expires = headers.get("expires");
					if (expires) {
						const diff = Date.parse(expires) - Date.now();
						if (!isNaN(diff)) {
							parts.push(`ttl=${Math.max(0, Math.round(diff / 1000))}`);
						}
					}
					headers.set("cache-status", parts.join("; "));
					return new Response(cached.body, {
						status: cached.status,
						statusText: cached.statusText,
						headers,
					}) as unknown as TResponse;
				}
				return cached;
			}
		}

		// Cache miss
		const handler = callOpts.handler || baseHandler;
		if (!handler) {
			return new Response("Cache miss and no handler provided", {
				status: 500,
			}) as unknown as TResponse;
		}
		const response = await handler(request, {
			mode: "miss",
			background: false,
		});
		const stored = await writeToCache(request, response, options);
		if (enableStatus) {
			const headers = new Headers(stored.headers as HeadersInit);
			const parts = [cacheStatusName, "miss"];
			const expires = headers.get("expires");
			if (expires) {
				const diff = Date.parse(expires) - Date.now();
				if (!isNaN(diff)) {
					parts.push(`ttl=${Math.max(0, Math.round(diff / 1000))}`);
				}
			}
			headers.set("cache-status", parts.join("; "));
			return new Response(stored.body, {
				status: stored.status,
				statusText: stored.statusText,
				headers,
			}) as unknown as TResponse;
		}
		return stored;
	};

	return handle;
}
