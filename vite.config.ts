import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync } from 'fs';
import { fileURLToPath, URL } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Mirror the launcher's per-subpath SDK alias pattern so dev edits in
// `../../asyar-sdk/src/{contracts,worker,view}.ts` hot-reload without going
// through the SDK's compiled `dist/`. In CI / published-npm mode the
// local source does not exist and Node resolution falls back to
// node_modules/asyar-sdk/package.json exports — which is why the alias object
// is empty in that branch.
//
// Never alias the bare `asyar-sdk` specifier: the SDK's exports map has no
// "." entry, so the bare import is invalid and must fail at build time.
const sdkSrcDir = resolve(__dirname, '../../asyar-sdk/src');
const sdkSubpaths = ['contracts', 'worker', 'view'] as const;
const useLocalSdk = sdkSubpaths.every((sub) =>
  existsSync(resolve(sdkSrcDir, `${sub}.ts`)),
);

const sdkAliases = useLocalSdk
  ? Object.fromEntries(
      sdkSubpaths.map((sub) => [
        `asyar-sdk/${sub}`,
        resolve(sdkSrcDir, `${sub}.ts`),
      ]),
    )
  : {};

export default defineConfig(() => {
  // eslint-disable-next-line no-console
  console.log(
    `\x1b[36m[Vite] (Tauri Docs Extension)\x1b[0m Asyar-SDK: \x1b[33m${
      useLocalSdk ? `Local Source (${sdkSrcDir})` : 'node_modules (NPM)'
    }\x1b[0m`,
  );

  return {
    plugins: [svelte()],

    // Relative asset paths in emitted HTML so the Rust `asyar-extension://`
    // scheme handler can serve `./view.js` / `./assets/*` from the extension
    // install path without any absolute-root rewriting.
    base: './',

    resolve: {
      alias: sdkAliases,
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          worker: resolve(__dirname, 'worker.html'),
          view: resolve(__dirname, 'view.html'),
        },
        output: {
          // Deterministic, hash-free entry names so worker.html loads
          // `./worker.js` and view.html loads `./view.js`. Shared chunks
          // and assets keep content hashes for cache-busting behind the
          // HTML's <link>/<script> tags.
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
