import { isUnder } from "../paths/pathKey";
import type { VaultFile } from "../vault/vaultOps";

export type BaseGuardResult = { ok: true } | { ok: false; foreignNotes: number; message: string };

/**
 * Refuses to sync into a base folder that holds notes this plugin did not create and none that it
 * did. Once the plugin's own notes are there, notes the user adds beside them are fine.
 */
export function checkBaseFolder(files: VaultFile[], baseFolder: string): BaseGuardResult {
	let plugin = 0;
	let foreign = 0;
	for (const file of files) {
		if (!isUnder(file.path, baseFolder)) continue;
		if (typeof file.frontmatter?.pocket_role === "string") plugin += 1;
		else foreign += 1;
	}
	if (plugin > 0 || foreign === 0) return { ok: true };
	return {
		ok: false,
		foreignNotes: foreign,
		message: `The folder "${baseFolder}" already holds ${foreign} note${foreign === 1 ? "" : "s"} this plugin did not create. Choose another base folder in settings, or rename the existing folder, then sync again.`,
	};
}
