import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'index.ts'), // or ./src/index.ts
      name: 'InteractiveGlobe',
      fileName: (format) => `interactive-globe.${format}.js`,
      formats: ['es', 'cjs', 'umd'], // <- support all 3
    },
    rollupOptions: {
      // These dependencies will not be bundled into your library. Instead, the user is expected to provide them (like peerDependencies). This keeps your bundle small.
      // external: ['three', 'gsap'],
      /*      
      When building UMD/IIFE bundles, this tells Rollup/Vite what global variable to use for the external dependencies. For example:
      three will be expected as a global THREE
      gsap as a global gsap
      This is especially useful if someone includes your library via <script> tags in the browser and loads three.js/gsap separately.
      */      
      output: {
        globals: {
          three: 'THREE',
          gsap: 'gsap'
        }
      }
    },
    minify: 'terser',
  }
});
