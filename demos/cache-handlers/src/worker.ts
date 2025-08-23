import { App } from "astro/app";
import type { SSRManifest } from "astro";
import { handle, type Runtime } from "@astrojs/cloudflare/handler";
import type { ExportedHandlerFetchHandler } from "@cloudflare/workers-types";
import { createCacheHandler } from "cache-handlers";

type CFRequest = Parameters<ExportedHandlerFetchHandler>[0];

export function createExports(manifest: SSRManifest) {
	const app = new App(manifest);
	return {
		default: {
			async fetch(
				request: CFRequest,
				env: Runtime["runtime"]["env"],
				ctx: Runtime["runtime"]["ctx"],
			) {
				if (request.method !== "GET") {
					// Directly invoke Astro for non-GET (no cache)
					return handle(
						manifest,
						app,
						request,
						env,
						ctx,
					);
				}
				const url = new URL(request.url);
				const cacheHandle = createCacheHandler<
					CFRequest
				>({
					swr: "background",
					handler: (req) => handle(manifest, app, req, env, ctx),
					features: {
						conditionalRequests: { etag: "generate" },
						cacheStatusHeader: "demo-cache",
					},
					debug: {
						enabled: true,
						logLevel: "verbose",
					},
				});

				if (url.pathname.endsWith("/blocking")) {
					return cacheHandle(request, {
						swr: "blocking",
						runInBackground: ctx.waitUntil.bind(ctx),
					});
				}
				if (url.pathname.endsWith("/off")) {
					return cacheHandle(request, {
						swr: "off",
						runInBackground: ctx.waitUntil.bind(ctx),
					});
				}
				return cacheHandle(request, { runInBackground: ctx.waitUntil.bind(ctx) });
			},
		},
	};
}
