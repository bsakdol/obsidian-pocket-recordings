import { pathKey } from "../../src/paths/pathKey";
import { composeNote } from "../../src/render/markers";
import type { Frontmatter, VaultFile, VaultOps } from "../../src/vault/vaultOps";

/**
 * An in-memory vault with Obsidian's semantics: create throws on an existing path, rename into a
 * missing folder throws, folders are explicit. Front matter is stored as JSON (which is valid YAML)
 * so it can be parsed back without a YAML library.
 */
export class MemoryVaultOps implements VaultOps {
	readonly files = new Map<string, string>();
	readonly folders = new Set<string>();
	/** Paths whose metadata cache entry is missing, to simulate a cold cache. */
	readonly uncached = new Set<string>();
	/** Every write, in order, for asserting what a run touched. */
	readonly writes: { op: string; path: string }[] = [];
	/** When set, the next operation of this kind throws, to simulate a crash. */
	failNext: { op: string; path?: string } | null = null;

	constructor(seed: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(seed)) this.put(path, content);
	}

	/** Writes a file directly, creating its folders, as a user or a sync service would. */
	put(path: string, content: string): void {
		this.addParents(path);
		this.files.set(path, content);
	}

	delete(path: string): void {
		this.files.delete(path);
	}

	deleteFolder(path: string): void {
		for (const file of [...this.files.keys()]) if (file.startsWith(`${path}/`)) this.files.delete(file);
		for (const folder of [...this.folders]) if (folder === path || folder.startsWith(`${path}/`)) this.folders.delete(folder);
	}

	listMarkdown(): VaultFile[] {
		return [...this.files.entries()]
			.filter(([path]) => path.endsWith(".md"))
			.map(([path, content]) => ({ path, frontmatter: this.uncached.has(path) ? null : parseFrontmatter(content) }));
	}

	allPathKeys(): Set<string> {
		return new Set([...this.files.keys(), ...this.folders].map(pathKey));
	}

	fileExists(path: string): boolean {
		return this.files.has(path);
	}

	folderExists(path: string): boolean {
		return this.folders.has(path);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`${path} does not exist.`);
		return content;
	}

	async createNote(path: string, frontmatter: Frontmatter, body: string): Promise<void> {
		this.maybeFail("create", path);
		if (this.files.has(path) || this.folders.has(path)) throw new Error(`${path} already exists.`);
		this.requireParent(path);
		this.files.set(path, composeNote(JSON.stringify(frontmatter), body));
		this.writes.push({ op: "create", path });
	}

	async process(path: string, fn: (content: string) => string): Promise<void> {
		this.maybeFail("process", path);
		const content = await this.read(path);
		const next = fn(content);
		if (next !== content) {
			this.files.set(path, next);
			this.writes.push({ op: "process", path });
		}
	}

	async processFrontmatter(path: string, fn: (frontmatter: Frontmatter) => void): Promise<void> {
		this.maybeFail("frontmatter", path);
		const content = await this.read(path);
		const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
		const frontmatter = match ? (JSON.parse(match[1] ?? "{}") as Frontmatter) : {};
		fn(frontmatter);
		const block = `---\n${JSON.stringify(frontmatter)}\n---\n`;
		this.files.set(path, match ? block + content.slice(match[0].length) : block + content);
		this.writes.push({ op: "frontmatter", path });
	}

	async rename(from: string, to: string): Promise<void> {
		this.maybeFail("rename", from);
		const content = await this.read(from);
		if (this.files.has(to) || this.folders.has(to)) throw new Error(`${to} already exists.`);
		this.requireParent(to);
		this.files.delete(from);
		this.files.set(to, content);
		this.writes.push({ op: "rename", path: `${from} -> ${to}` });
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = path.split("/");
		for (let depth = 1; depth <= parts.length; depth++) {
			const prefix = parts.slice(0, depth).join("/");
			if (this.files.has(prefix)) throw new Error(`${prefix} is a file.`);
			if (!this.folders.has(prefix)) {
				this.folders.add(prefix);
				this.writes.push({ op: "folder", path: prefix });
			}
		}
	}

	async removeFolderIfEmpty(path: string): Promise<boolean> {
		if (!this.folders.has(path)) return false;
		const busy = [...this.files.keys(), ...this.folders].some((other) => other.startsWith(`${path}/`));
		if (busy) return false;
		this.folders.delete(path);
		this.writes.push({ op: "rmdir", path });
		return true;
	}

	frontmatterOf(path: string): Frontmatter {
		return parseFrontmatter(this.files.get(path) ?? "");
	}

	paths(): string[] {
		return [...this.files.keys()].sort();
	}

	private addParents(path: string): void {
		const parts = path.split("/").slice(0, -1);
		for (let depth = 1; depth <= parts.length; depth++) this.folders.add(parts.slice(0, depth).join("/"));
	}

	private requireParent(path: string): void {
		const parent = path.split("/").slice(0, -1).join("/");
		if (parent && !this.folders.has(parent)) throw new Error(`Folder ${parent} does not exist.`);
	}

	private maybeFail(op: string, path: string): void {
		if (this.failNext && this.failNext.op === op && (!this.failNext.path || this.failNext.path === path)) {
			this.failNext = null;
			throw new Error(`Simulated failure: ${op} ${path}`);
		}
	}
}

function parseFrontmatter(content: string): Frontmatter {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match) return {};
	try {
		const parsed: unknown = JSON.parse(match[1] ?? "{}");
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Frontmatter) : {};
	} catch {
		return {};
	}
}
