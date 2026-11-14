/**
 * Reading view: collapse the block spacing between the independent lists that
 * long-note chunking writes, so a chunked note still reads as one continuous
 * bullet list.
 *
 * The split has to happen in the Markdown source (alternating `-`, `*`, `+`
 * every N items, with no blank line), because that is what lets Obsidian render
 * the note block by block. In Reading view those separate lists can still carry
 * their own block margins, so this post-processor tags the list blocks of a
 * Lifeline note and `styles.css` removes the spacing. Live Preview needs no
 * rule: the chunks have no blank line there.
 *
 * Nothing is written to the note, and only notes whose frontmatter `type` is
 * one of the three Lifeline note kinds are touched.
 */
import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';

const LIFELINE_NOTE_TYPES = new Set(['lifeline-channels', 'lifeline-playlist', 'lifeline-liked']);

function isLifelineNote(ctx: MarkdownPostProcessorContext): boolean {
	// `frontmatter` is typed as `any` in the public API, so narrow it before
	// reading the one key this needs.
	const frontmatter: unknown = ctx.frontmatter;
	if (frontmatter == null || typeof frontmatter !== 'object') return false;
	const type = (frontmatter as Record<string, unknown>).type;
	return typeof type === 'string' && LIFELINE_NOTE_TYPES.has(type);
}

export function registerNoteChunkStyle(plugin: Plugin): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!isLifelineNote(ctx)) return;
		// A block can arrive as the list itself or as the wrapper the reading
		// view puts around it; cover both so the rule does not depend on one
		// Obsidian DOM shape.
		if (el.tagName === 'UL' || el.tagName === 'OL') {
			el.classList.add('lifeline-bullet-list');
			return;
		}
		const list = el.querySelector(':scope > ul, :scope > ol');
		if (!list) return;
		el.classList.add('lifeline-bullet-block');
		list.classList.add('lifeline-bullet-list');
	});
}
