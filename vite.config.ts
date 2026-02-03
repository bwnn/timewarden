import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const __dirname = import.meta.dirname;

export default defineConfig({
    plugins: [
        tailwindcss(),
        svelte(),
        // Post-build: flatten HTML entrypoints to dist root, copy manifest + icons
        {
            name: 'extension-post-build',
            writeBundle() {
                const dist = resolve(__dirname, 'dist');
                const entrypointsDir = resolve(dist, 'src', 'entrypoints');

                // Move HTML files from dist/src/entrypoints/ to dist/
                if (existsSync(entrypointsDir)) {
                    for (const file of readdirSync(entrypointsDir)) {
                        if (file.endsWith('.html')) {
                            renameSync(resolve(entrypointsDir, file), resolve(dist, file));
                        }
                    }
                    // Clean up empty nested dirs
                    rmSync(resolve(dist, 'src'), { recursive: true, force: true });
                }

                // Copy manifest.json
                copyFileSync(resolve(__dirname, 'manifest.json'), resolve(dist, 'manifest.json'));

                // Copy static/icons
                const iconsSource = resolve(__dirname, 'static', 'icons');
                const iconsDest = resolve(dist, 'icons');
                if (existsSync(iconsSource)) {
                    mkdirSync(iconsDest, { recursive: true });
                    for (const file of readdirSync(iconsSource)) {
                        copyFileSync(resolve(iconsSource, file), resolve(iconsDest, file));
                    }
                }
            },
        },
    ],
    resolve: {
        alias: {
            $lib: resolve(__dirname, 'src/lib'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        minify: false, // Easier debugging for extension review
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/entrypoints/popup.html'),
                settings: resolve(__dirname, 'src/entrypoints/settings.html'),
                dashboard: resolve(__dirname, 'src/entrypoints/dashboard.html'),
                blocked: resolve(__dirname, 'src/entrypoints/blocked.html'),
                background: resolve(__dirname, 'src/background/index.ts'),
            },
            output: {
                entryFileNames: (chunkInfo) => {
                    // Background script needs to be at background/index.js
                    if (chunkInfo.name === 'background') {
                        return 'background/index.js';
                    }
                    return 'assets/[name]-[hash].js';
                },
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
});
