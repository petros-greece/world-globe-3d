import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'index.ts'), // or ./src/index.ts
      name: 'InteractiveGlobe',
      fileName: (format) => `index.${format}.js`, // optional: removes hash
    },
    rollupOptions: {
      external: ['three', 'gsap'],
      output: {
        globals: {
          three: 'THREE',
          gsap: 'gsap'
        }
      }
    }
  }
});
