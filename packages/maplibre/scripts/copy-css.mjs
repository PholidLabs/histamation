// Copies the renderer stylesheet into dist alongside tsc's output.
// Paths resolve from this file, not the cwd, so the root build script and the
// package's own build script can both call it without duplicating the paths.
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, '..');
mkdirSync(resolve(pkg, 'dist'), { recursive: true });
copyFileSync(resolve(pkg, 'src/histamation.css'), resolve(pkg, 'dist/histamation.css'));
