import { defineConfig, type Plugin } from 'vite';
import { createRequire } from 'node:module';
import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { DOC_LANGS } from './src/docs/copy.js';
import { buildSite, isWatched, renderIndex, renderPage, searchIndex, WATCHED, type DocsSite } from './docs/site.js';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);

/**
 * MapLibre v6 spawns its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
 * The bundler cannot see that, so the worker and its shared chunk are emitted next to the
 * entry chunk by hand. In dev the package is left unbundled so the same relative URL resolves.
 */
function maplibreWorkerAssets(): Plugin {
  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    generateBundle() {
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${file}`,
          source: readFileSync(require.resolve(`maplibre-gl/dist/${file}`), 'utf8'),
        });
      }
    },
  };
}

const ICON_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
};

/**
 * Favicons, the apple-touch icon, the manifest and the social card have to sit at
 * the site root, because that is where browsers and crawlers look for them. They
 * cannot live in publicDir: that is the repo's data/ folder, which holds campaigns
 * and basemap and should not collect site chrome. So dev serves them from
 * apps/demo/icons with a middleware and build emits them by hand — the same
 * approach the MapLibre worker assets above already use.
 */
function siteIcons(): Plugin {
  const dir = resolve(import.meta.dirname, 'icons');
  const files = readdirSync(dir);
  return {
    name: 'site-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!files.includes(name)) return next();
        res.setHeader('Content-Type', ICON_TYPES[extname(name)] ?? 'application/octet-stream');
        createReadStream(resolve(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(resolve(dir, name)) });
      }
    },
  };
}

/**
 * The docs: Markdown in docs/content/<lang>/ (plus the data contract) rendered to one static HTML page
 * per language and slug, at /docs/<lang>/<slug>/. docs/index.html is a normal Vite input, so its script
 * and styles are bundled as usual; this plugin then stamps each page into the processed template.
 * A broken internal link fails the build (see docs/site.ts). In dev the same pages are rendered per
 * request, with any link errors shown in a banner instead.
 */
function docsSite(): Plugin {
  const templateFile = resolve(import.meta.dirname, 'docs/index.html');
  let cache: Promise<DocsSite> | null = null;
  return {
    name: 'docs-site',
    enforce: 'post',
    configureServer(server) {
      server.watcher.add(WATCHED);
      server.watcher.on('all', (_event, file) => {
        if (!isWatched(file)) return;
        cache = null;
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (/^\/docs(\/(en|id)(\/[a-z0-9-]+)?)?$/.test(url)) {
          res.statusCode = 301;
          res.setHeader('Location', `${url}/`);
          res.end();
          return;
        }
        const search = /^\/docs\/search-(en|id)\.json$/.exec(url);
        const page = /^\/docs\/(?:(en|id)\/(?:([a-z0-9-]+)\/)?)?$/.exec(url);
        if (!search && !page) return next();
        try {
          const site = await (cache ??= buildSite());
          if (search) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(searchIndex(site, search[1] as (typeof DOC_LANGS)[number]));
            return;
          }
          const lang = page![1] as (typeof DOC_LANGS)[number] | undefined;
          const slug = page![2];
          const found = slug ? site.pages.find((p) => p.lang === lang && p.slug === slug) : null;
          if (slug && !found) return next();
          const template = await server.transformIndexHtml(url, readFileSync(templateFile, 'utf8'));
          let html = found ? renderPage(site, found, template) : renderIndex(site, template, lang ?? null);
          if (site.errors.length) {
            const list = site.errors.map((e) => `<li>${e.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('');
            html = html.replace(/<body[^>]*>/, (m) => `${m}<div class="dev-errors" role="alert"><strong>Docs build errors — the production build will fail:</strong><ul>${list}</ul></div>`);
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    },
    async generateBundle(_options, bundle) {
      const template = bundle['docs/index.html'];
      if (!template || template.type !== 'asset') return this.error('docs/index.html is missing from the bundle');
      const site = await buildSite();
      if (site.errors.length) return this.error(`Docs build errors:\n  ${site.errors.join('\n  ')}`);
      const source = String(template.source);
      template.source = renderIndex(site, source, null);
      for (const lang of DOC_LANGS) {
        this.emitFile({ type: 'asset', fileName: `docs/${lang}/index.html`, source: renderIndex(site, source, lang) });
        this.emitFile({ type: 'asset', fileName: `docs/search-${lang}.json`, source: searchIndex(site, lang) });
      }
      for (const p of site.pages) {
        this.emitFile({ type: 'asset', fileName: `docs/${p.lang}/${p.slug}/index.html`, source: renderPage(site, p, source) });
      }
    },
  };
}

export default defineConfig({
  // The repo's data folder is the demo's static root: /campaigns/*.json and /basemap/*.geojson
  publicDir: resolve(root, 'data'),
  plugins: [maplibreWorkerAssets(), siteIcons(), docsSite()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  resolve: {
    // most specific first: Vite matches aliases in order
    alias: [
      { find: '@pholidlabs/histamation-maplibre/style.css', replacement: resolve(root, 'packages/maplibre/src/histamation.css') },
      { find: '@pholidlabs/histamation-maplibre', replacement: resolve(root, 'packages/maplibre/src/index.ts') },
      { find: '@pholidlabs/histamation-engine', replacement: resolve(root, 'packages/engine/src/index.ts') },
    ],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    // Three pages: the landing explainer at /, the map app at /app/ and the docs template at /docs/,
    // which the docsSite plugin stamps into one page per language and slug. All entries' chunks land
    // in assets/, so the hand-emitted MapLibre worker above stays a sibling of the app chunk.
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
        docs: resolve(import.meta.dirname, 'docs/index.html'),
      },
    },
  },
});
