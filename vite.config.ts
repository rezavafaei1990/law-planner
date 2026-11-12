import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function preservePublicPwaLinks(): Plugin {
  return {
    name: 'preserve-public-pwa-links',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/href=["'][^"']*manifest[^"']*\.json["']/gi, 'href="./manifest.json"')
          .replace(/href=["'][^"']*apple-touch-icon[^"']*\.png["']/gi, 'href="./icons/apple-touch-icon.png"')
          .replace(/href=["'][^"']*icon[^"']*\.svg["']/gi, 'href="./icons/icon.svg"');
      },
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), preservePublicPwaLinks()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
