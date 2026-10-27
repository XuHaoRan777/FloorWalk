import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, envDir, ['PORT', 'VITE_']);
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }

  const apiOrigin = new URL(
    env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3018/api',
  ).origin;
  const contentSecurityPolicy =
    mode === 'production'
      ? [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: ${apiOrigin}`,
          `connect-src 'self' ${apiOrigin}`,
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join('; ')
      : undefined;
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (contentSecurityPolicy) {
    plugins.push({
      name: 'floorwalk-production-csp',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const policyTag = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`;
          return html.replace('</head>', `  ${policyTag}\n  </head>`);
        },
      },
    });
  }

  return {
    envDir,
    plugins,
    server: { host: '127.0.0.1', port, strictPort: true },
    preview: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      ...(mode === 'production'
        ? { headers: { 'Content-Security-Policy': contentSecurityPolicy } }
        : {}),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  };
});
