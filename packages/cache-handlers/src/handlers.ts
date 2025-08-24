import type { CacheConfig, CacheHandle, SWRPolicy } from "./types.ts";
import { readFromCache } from "./read.ts";
import { writeToCache } from "./write.ts";
import { createDebugLogger } from "./debug.ts";

export function createCacheHandler<
	TRequest = Request,
	TResponse = Response,
>(
	options: CacheConfig<TRequest, TResponse> = {},
): CacheHandle<TRequest, TResponse> {
	const opts = options as unknown as CacheConfig<Request, Response>;

	const baseHandler = opts.handler;
	const debug = createDebugLogger(opts.debug);

	const handle: CacheHandle<Request, Response> = async (
		request,
		callOpts = {},
	): Promise<Response> => {
		// Only cache GET
		if (request.method !== "GET") {
			debug.log(
				"handler",
				`Non-GET request (${request.method}), bypassing cache: ${request.url}`,
			);
			const handler = callOpts.handler || baseHandler;
			if (!handler) {
				return new Response("No handler provided", {
					status: 500,
				});
			}
			return handler(request, { mode: "miss", background: false });
		}

		const { cached, needsBackgroundRevalidation } = await readFromCache(
			request as Request,
			opts,
		);

		if (cached) {
			debug.logCacheRead(
				request.url,
				needsBackgroundRevalidation ? "stale" : "hit",
			);
		} else {
			debug.logCacheRead(request.url, "miss");
		}
		const statusSetting = opts.features?.cacheStatusHeader;
		const enableStatus = !!statusSetting;
		const cacheStatusName =
			typeof statusSetting === "string" && statusSetting.trim()
				? statusSetting.trim()
				: "cache-handlers";
		if (cached) {
			const policy: SWRPolicy = callOpts.swr || opts.swr || "background";
			if (needsBackgroundRevalidation) {
				if (policy === "blocking") {
					const handler = baseHandler || callOpts.handler;
					if (handler) {
						try {
							debug.log("handler", `Blocking revalidation for ${request.url}`);
							const fresh = await handler(request, {
								mode: "stale",
								background: false,
							});
							return await writeToCache(
								request,
								fresh,
								opts,
							);
						} catch (err) {
							debug.logError(
								"handler",
								err as Error,
								"SWR blocking revalidation",
							);
							console.warn(
								"SWR blocking revalidation failed; serving stale",
								err,
							);
						}
					}
				} else if (policy === "background") {
					const handler = baseHandler || callOpts.handler;
					if (handler) {
						debug.logBackgroundRevalidation(request.url, true);
						const scheduler = callOpts.runInBackground ||
							opts.runInBackground;
						const revalidatePromise = (async () => {
							try {
								debug.log(
									"handler",
									`Background revalidation starting for ${request.url}`,
								);
								const response = await handler(request, {
									mode: "stale",
									background: true,
								});
								await writeToCache(
									request,
									response,
									opts,
								);
								debug.log(
									"handler",
									`Background revalidation completed for ${request.url}`,
								);
							} catch (err) {
								debug.logError(
									"handler",
									err as Error,
									"SWR background revalidation",
								);
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
					debug.log(
						"handler",
						`SWR disabled, deleting stale entry for ${request.url}`,
					);
					try {
						await caches.open(opts.cacheName || "cache-primitives-default")
							.then((c) => c.delete(request));
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
						});
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
					});
				}
				return cached;
			}
		}

		// Cache miss
		debug.log("handler", `Cache miss, calling handler for ${request.url}`);
		const handler = callOpts.handler || baseHandler;
		if (!handler) {
			return new Response("Cache miss and no handler provided", {
				status: 500,
			});
		}
		const response = await handler(request, {
			mode: "miss",
			background: false,
		});
		const stored = await writeToCache(
			request as Request,
			response as Response,
			opts,
		);
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
			});
		}
		return stored;
	};

	return handle as unknown as CacheHandle<TRequest, TResponse>;
}
