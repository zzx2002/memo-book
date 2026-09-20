import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 期望前端固定端口，且不希望在 src-tauri 变化时热重载
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
