import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative asset paths work both at the domain root and under /<repository>/.
  base: './',
  plugins: [vue()],
  build: {
    // Vite's equivalent of buildDir: generated GitHub Pages files go in /docs.
    outDir: 'docs',
    emptyOutDir: true,
  },
})
