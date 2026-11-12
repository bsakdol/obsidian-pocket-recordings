import { ShapeError } from "./errors";
import { asArray, asObject, str } from "./raw";

export const UNFILED = "Unfiled";

export interface FolderNode {
	id: string;
	name: string;
	/** `space` for a top-level space, `folder` otherwise. */
	isSpace: boolean;
	parentId: string | null;
	spaceId: string | null;
}

/** Where a recording sits in Pocket: its space and folder chain, by display name. */
export interface FolderPlacement {
	/** Space name first, then each folder down to the recording's own. Empty when unfiled. */
	segments: string[];
	/** False when the folder id is not in the tree (the tree is stale or the id is unknown). */
	known: boolean;
}

/**
 * Pocket's space and folder tree (`GET /public/folders`). Nodes may arrive nested through
 * `children` or flat through `parent_folder_id`; nesting wins when both are present.
 */
export class FolderTree {
	private readonly nodes = new Map<string, FolderNode>();

	private constructor(nodes: FolderNode[]) {
		for (const node of nodes) this.nodes.set(node.id, node);
	}

	/** Builds the tree from the response's `data`. Anything but a list is a ShapeError, never an empty tree. */
	static fromRaw(data: unknown): FolderTree {
		if (!Array.isArray(data)) {
			throw new ShapeError("Pocket returned the folder list in an unexpected format.");
		}
		const nodes: FolderNode[] = [];
		const visit = (raw: unknown, nestedParent: string | null, depth: number): void => {
			const value = asObject(raw);
			const id = str(value?.id);
			if (!value || !id || depth > 64) return;
			const kind = str(value.kind);
			const spaceId = str(value.space_id);
			const isSpace = kind === "space" || (spaceId === id && nestedParent === null);
			nodes.push({
				id,
				name: (str(value.name) ?? id).trim(),
				isSpace,
				parentId: nestedParent ?? str(value.parent_folder_id),
				spaceId: isSpace ? id : spaceId,
			});
			for (const child of asArray(value.children)) visit(child, id, depth + 1);
		};
		for (const raw of data) visit(raw, null, 0);
		return new FolderTree(nodes);
	}

	/** A tree rebuilt from `toJSON()` output, for the cached copy used offline. */
	static fromNodes(nodes: FolderNode[]): FolderTree {
		return new FolderTree(nodes);
	}

	toJSON(): FolderNode[] {
		return [...this.nodes.values()];
	}

	get(id: string): FolderNode | undefined {
		return this.nodes.get(id);
	}

	all(): FolderNode[] {
		return [...this.nodes.values()];
	}

	/** The nodes from the space down to `id`, or null when `id` is unknown. */
	chain(id: string): FolderNode[] | null {
		const start = this.nodes.get(id);
		if (!start) return null;
		const chain: FolderNode[] = [];
		const seen = new Set<string>();
		let node: FolderNode | undefined = start;
		while (node && !seen.has(node.id)) {
			seen.add(node.id);
			chain.unshift(node);
			node = node.parentId ? this.nodes.get(node.parentId) : undefined;
		}
		const top = chain[0];
		// A top folder whose parent is missing still belongs to its space when the space is known.
		if (top && !top.isSpace && top.spaceId && !seen.has(top.spaceId)) {
			const space = this.nodes.get(top.spaceId);
			if (space) chain.unshift(space);
		}
		return chain;
	}

	placement(folderId: string | null): FolderPlacement {
		if (folderId === null) {
			return { segments: [], known: true };
		}
		const chain = this.chain(folderId);
		return chain ? { segments: chain.map((node) => node.name), known: true } : { segments: [], known: false };
	}

	/** `Space/Parent/Child`, `Space` for a space root, or `Unfiled`. */
	displayPath(folderId: string | null): string {
		const { segments } = this.placement(folderId);
		return segments.length > 0 ? segments.join("/") : UNFILED;
	}

	/** Whether `folderId` is `ancestorId` or lies anywhere beneath it. */
	isWithin(folderId: string, ancestorId: string): boolean {
		return this.chain(folderId)?.some((node) => node.id === ancestorId) ?? false;
	}
}
