/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS is required for camera + motion sensors on phones. basic-ssl generates a
// self-signed certificate: accept the warning once on each phone (see README).
// Set HTTP=1 to serve plain http (e.g. behind a cloudflared tunnel, which adds TLS).
const useHttps = !process.env.HTTP;

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 5173 },
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
