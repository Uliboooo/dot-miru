import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  // This app does not use Astro sessions, so it needs no Cloudflare KV binding.
  session: false,
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "passthrough",
  }),
  vite: {
    optimizeDeps: {
      // Avoid a Vite SSR optimizer race in the Cloudflare workerd dev runtime.
      exclude: ["astro"],
    },
  },
});
