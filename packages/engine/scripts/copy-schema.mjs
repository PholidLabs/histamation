// Copies the campaign JSON Schema into dist so histamation-check finds it next to
// itself, both in the repo and in the published package (schema/ lives outside it).
// Paths resolve from this file, not the cwd, so the root scripts and the package's
// own build script can both call it without duplicating the paths.
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, '..');
mkdirSync(resolve(pkg, 'dist'), { recursive: true });
copyFileSync(resolve(pkg, '../../schema/campaign.schema.json'), resolve(pkg, 'dist/campaign.schema.json'));
