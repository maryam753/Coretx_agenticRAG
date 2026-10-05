import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every /api request is forwarded to the FastAPI backend, so the browser
// never hits CORS and the streaming response passes straight through.
export default defineConfig({
  plugins: [react()],
  server: {
  proxy: {
    '^/api/': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    }
  }
}
});