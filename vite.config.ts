import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Main configuration for the primary Electron window
const mainConfig = defineConfig(({ command, mode }) => ({
  base: command === "build" ? "./" : "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

// Configuration for the map window
const mapConfig = defineConfig(({ command, mode }) => ({
  base: command === "build" ? "./" : "/",
  build: {
    outDir: 'dist-map',
    rollupOptions: {
      input: {
        map: path.resolve(__dirname, 'map.html'),
      },
      external: ['react', 'react-dom'],
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

// Export default based on VITE_BUILD_TARGET environment variable
export default defineConfig(({ command, mode }) => {
  if (process.env.VITE_BUILD_TARGET === 'map') {
    return mapConfig({ command, mode });
  } else {
    return mainConfig({ command, mode });
  }
});
