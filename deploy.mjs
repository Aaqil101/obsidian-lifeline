/**
 * Local convenience: copy the release artifacts into the real vault's plugin
 * folder (the test vault uses a junction symlink instead and hot-reloads).
 * Run via `npm run deploy` (builds first). Set the GITHUB_DIR environment
 * variable to your vault's plugin folder path.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const TARGET_DIR = process.env.GITHUB_DIR;
if (!TARGET_DIR) {
	console.error('GITHUB_DIR environment variable is not set.');
	process.exit(1);
}
const FILES = ['main.js', 'manifest.json', 'styles.css'];

await mkdir(TARGET_DIR, { recursive: true });
for (const file of FILES) {
	await copyFile(join(process.cwd(), file), join(TARGET_DIR, file));
	console.log(`Deployed ${file} -> ${join(TARGET_DIR, file)}`);
}
