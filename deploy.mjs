/**
 * Local convenience: copy the release artifacts into the real vault's plugin
 * folder (the test vault uses a junction symlink instead and hot-reloads).
 * Run via `npm run deploy` (builds first). Hardcoded path: edit for your setup.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const TARGET_DIR = 'D:/GitHub/Obsidian/Zettelkasten/.obsidian/plugins/lifeline';
const FILES = ['main.js', 'manifest.json', 'styles.css'];

await mkdir(TARGET_DIR, { recursive: true });
for (const file of FILES) {
	await copyFile(join(process.cwd(), file), join(TARGET_DIR, file));
	console.log(`Deployed ${file} -> ${join(TARGET_DIR, file)}`);
}
