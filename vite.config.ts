import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The pure Style Card rule module shared with the Edge Functions (spec 1.5): one validator for
      // the profiler, the prompt engine and the editor's checks / Clean up. Mirrored in tsconfig.app.json.
      '@shared/style_card_rules': fileURLToPath(
        new URL('./supabase/functions/_shared/style_card_rules.ts', import.meta.url),
      ),
    },
  },
})
