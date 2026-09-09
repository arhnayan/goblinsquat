import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        studio: fileURLToPath(new URL("./studio.html", import.meta.url)),
      },
    },
  },
});
