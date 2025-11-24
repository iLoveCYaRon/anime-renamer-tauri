import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  server: {
    open: false,
    port: 3033,
    strictPort: true,
  },
  plugins: [pluginReact()],
});
