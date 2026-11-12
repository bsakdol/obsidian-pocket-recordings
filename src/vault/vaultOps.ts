// The boundary between the sync engine and the vault. The engine talks only to this
// interface; the Obsidian implementation stays thin, and tests use an in-memory one.

export type Frontmatter = Record<string, unknown>;

export interface VaultFile {
	path: string;
	/** The file's cached properties: `{}` when it has none, `null` when the cache has not indexed it yet. */
	frontmatter: Frontmatter | null;
}

export interface VaultOps {
	/** Every markdown file with its cached properties. */
	listMarkdown(): VaultFile[];
	/** Case-folded keys of every file and folder path. */
	allPathKeys(): Set<string>;
	fileExists(path: string): boolean;
	/** The cached properties of the file at exactly `path`, or null when there is none or it is not indexed. */
	frontmatterOf(path: string): Frontmatter | null;
	folderExists(path: string): boolean;
	read(path: string): Promise<string>;
	/** Creates a note whose content already holds its properties. Throws when the path exists. */
	createNote(path: string, frontmatter: Frontmatter, body: string): Promise<void>;
	/** Atomically rewrites a note's content; `fn` returns the content unchanged to skip. */
	process(path: string, fn: (content: string) => string): Promise<void>;
	/** Atomically edits a note's properties in place. */
	processFrontmatter(path: string, fn: (frontmatter: Frontmatter) => void): Promise<void>;
	/** Moves a file. Throws when the target exists or its folder is missing. */
	rename(from: string, to: string): Promise<void>;
	/** Creates a folder and any missing parents. */
	ensureFolder(path: string): Promise<void>;
	/** Removes a folder only when it is empty. Returns whether it was removed. */
	removeFolderIfEmpty(path: string): Promise<boolean>;
}
