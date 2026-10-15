/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server config. frontend-dev: feel free to extend (aliases, proxy,
// etc.) — just keep host 0.0.0.0 + port 5173 so docker-compose.yml still
// works.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      // Needed so file-change events from the bind mount are picked up
      // reliably inside Docker on Windows/Mac.
      usePolling: true,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
