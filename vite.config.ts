import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const openaiProxy = {
  "/openai": {
    target: "http://127.0.0.1:11234",
    rewrite: (path: string) => path.replace(/^\/openai/, ""),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: openaiProxy },
  preview: { proxy: openaiProxy },
})
