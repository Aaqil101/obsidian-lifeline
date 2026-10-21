/**
 * Local convenience: copy the release artifacts into the personal vault's
 * plugin folder (the test vault uses a junction symlink instead and
 * hot-reloads). Run via `npm run deploy` (builds first). GITHUB_DIR is the
 * GitHub root, so the target is derived from it rather than read from it:
 * <GITHUB_DIR>\Obsidian\Zettelkasten\.obsidian\plugins\lifeline.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const GITHUB_DIR = process.env.GITHUB_DIR;
if (!GITHUB_DIR) {
	console.error('GITHUB_DIR environment variable is not set.');
	process.exit(1);
}

const TARGET_DIR = join(
	GITHUB_DIR,
	'Obsidian',
	'Zettelkasten',
	'.obsidian',
	'plugins',
	'lifeline',
);
const FILES = ['main.js', 'manifest.json', 'styles.css'];

await mkdir(TARGET_DIR, { recursive: true });
for (const file of FILES) {
	await copyFile(join(process.cwd(), file), join(TARGET_DIR, file));
	console.log(`Deployed ${file} -> ${join(TARGET_DIR, file)}`);
}
