import { normalizePath, stringifyYaml, TFile, TFolder, type App } from "obsidian";

import { pathKey } from "../paths/pathKey";
import { composeNote } from "../render/markers";
import type { Frontmatter, VaultFile, VaultOps } from "./vaultOps";

/** VaultOps over Obsidian's vault, file manager, and metadata cache. Verified by hand. */
export class ObsidianVaultOps implements VaultOps {
	private readonly queues = new Map<string, Promise<unknown>>();

	constructor(private readonly app: App) {}

	listMarkdown(): VaultFile[] {
		return this.app.vault.getMarkdownFiles().map((file) => {
			const cache = this.app.metadataCache.getFileCache(file);
			return { path: file.path, frontmatter: cache ? { ...(cache.frontmatter ?? {}) } : null };
		});
	}

	allPathKeys(): Set<string> {
		return new Set(this.app.vault.getAllLoadedFiles().map((file) => pathKey(file.path)));
	}

	fileExists(path: string): boolean {
		return this.app.vault.getFileByPath(normalizePath(path)) !== null;
	}

	frontmatterOf(path: string): Frontmatter | null {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		const cache = file ? this.app.metadataCache.getFileCache(file) : null;
		return cache ? { ...(cache.frontmatter ?? {}) } : null;
	}

	folderExists(path: string): boolean {
		return this.app.vault.getFolderByPath(normalizePath(path)) !== null;
	}

	async read(path: string): Promise<string> {
		return this.app.vault.read(this.file(path));
	}

	createNote(path: string, frontmatter: Frontmatter, body: string): Promise<void> {
		return this.serialized(path, async () => {
			await this.app.vault.create(normalizePath(path), composeNote(stringifyYaml(frontmatter), body));
		});
	}

	process(path: string, fn: (content: string) => string): Promise<void> {
		return this.serialized(path, async () => {
			await this.app.vault.process(this.file(path), fn);
		});
	}

	processFrontmatter(path: string, fn: (frontmatter: Frontmatter) => void): Promise<void> {
		return this.serialized(path, () => this.app.fileManager.processFrontMatter(this.file(path), fn));
	}

	rename(from: string, to: string): Promise<void> {
		return this.serialized(from, async () => {
			const target = normalizePath(to);
			if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`${target} already exists.`);
			// renameFile also updates links to the note, following the user's link settings.
			await this.app.fileManager.renameFile(this.file(from), target);
		});
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = normalizePath(path).split("/");
		for (let depth = 1; depth <= parts.length; depth++) {
			const prefix = parts.slice(0, depth).join("/");
			const existing = this.app.vault.getAbstractFileByPath(prefix);
			if (existing instanceof TFolder) continue;
			if (existing) throw new Error(`${prefix} is a file, not a folder.`);
			try {
				await this.app.vault.createFolder(prefix);
			} catch (error) {
				// Another writer may have created it in the meantime; only a still-missing folder is an error.
				if (!this.app.vault.getFolderByPath(prefix)) throw error;
			}
		}
	}

	async removeFolderIfEmpty(path: string): Promise<boolean> {
		const folder = this.app.vault.getFolderByPath(normalizePath(path));
		if (!folder || folder.isRoot() || folder.children.length > 0) return false;
		await this.app.fileManager.trashFile(folder);
		return true;
	}

	private file(path: string): TFile {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) throw new Error(`${path} does not exist.`);
		return file;
	}

	/** Writes to one path run one at a time. */
	private serialized<T>(path: string, task: () => Promise<T>): Promise<T> {
		const key = pathKey(path);
		const previous = this.queues.get(key) ?? Promise.resolve();
		const next = previous.then(task, task);
		const settled = next.catch(() => undefined);
		this.queues.set(key, settled);
		void settled.then(() => {
			if (this.queues.get(key) === settled) this.queues.delete(key);
		});
		return next;
	}
}
