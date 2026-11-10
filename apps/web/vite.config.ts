import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The Cortex server (npm run dev -w @cortex/server) listens on 8080.
    proxy: { "/api": "http://localhost:8080" },
  },
});
