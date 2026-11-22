import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// For GitHub Pages project sites, build with: npm run build -- --base=/ai-stream-ui/
export default defineConfig({
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
