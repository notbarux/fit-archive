import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import packageJson from './package.json'

export default defineConfig({
  // Relative asset paths work both at the domain root and under /<repository>/.
  base: './',
  plugins: [vue()],
  // Keep the visible app version tied to package.json (single source of truth).
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    // Vite's equivalent of buildDir: generated GitHub Pages files go in /docs.
    outDir: 'docs',
    emptyOutDir: true,
  },
})
