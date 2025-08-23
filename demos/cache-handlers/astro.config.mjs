// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	output: "server",
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
			persist: true,
		},
	}),
	vite: {
		build: {
			minify: false, // Better error messages during development
		},
	},
});
