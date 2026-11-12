import type { RecordingKind } from "../model";
import { pathKey } from "../paths/pathKey";
import { ROLES, type Role } from "../settings/schema";
import type { Frontmatter, VaultFile, VaultOps } from "../vault/vaultOps";

export type NoteStatus = "deleted" | "excluded" | "superseded";
const STATUSES: readonly NoteStatus[] = ["deleted", "excluded", "superseded"];

/** One plugin note, as its own properties describe it. */
export interface NoteRecord {
	path: string;
	/** `id:<pocket id>` or `rollup:<YYYY-MM-DD>`. */
	identity: string;
	id: string | null;
	rollupDate: string | null;
	role: Role;
	kind: RecordingKind | null;
	placedPath: string | null;
	updatedAt: string | null;
	render: string | null;
	recordedAt: string | null;
	title: string | null;
	/** `undefined` when the note does not say; `null` means unfiled. */
	folderId: string | null | undefined;
	status: NoteStatus | null;
	frozen: boolean;
	members: string[] | null;
	frontmatter: Frontmatter;
}

export interface IdentityIndex {
	notes: NoteRecord[];
	/** identity → role → every note claiming that identity and role. */
	byIdentity: Map<string, Map<Role, NoteRecord[]>>;
	/** Identities with two or more notes for one role. */
	duplicates: Set<string>;
	/** Case-folded keys of every file and folder in the vault. */
	pathKeys: Set<string>;
	/** Every markdown file, for the base-folder guard. */
	files: VaultFile[];
}

export class VaultIndexingError extends Error {
	constructor() {
		super("The vault is still indexing. Try the sync again in a moment.");
		this.name = "VaultIndexingError";
	}
}

export function recordingIdentity(id: string): string {
	return `id:${id}`;
}

export function rollupIdentity(date: string): string {
	return `rollup:${date}`;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** Reads a note's plugin properties, or null when it is not a plugin note. */
export function noteRecord(file: VaultFile): NoteRecord | null {
	const fm = file.frontmatter;
	if (!fm) return null;
	const role = (ROLES as readonly unknown[]).includes(fm.pocket_role) ? (fm.pocket_role as Role) : null;
	const id = str(fm.pocket_id);
	const rollupDate = str(fm.pocket_rollup_date);
	if (!role || (!id && !rollupDate)) return null;
	const kind = fm.pocket_kind === "conversation" || fm.pocket_kind === "insight" ? fm.pocket_kind : null;
	const status = (STATUSES as readonly unknown[]).includes(fm.pocket_status) ? (fm.pocket_status as NoteStatus) : null;
	const freeze = fm.pocket_freeze;
	return {
		path: file.path,
		identity: id ? recordingIdentity(id) : rollupIdentity(rollupDate ?? ""),
		id,
		rollupDate: id ? null : rollupDate,
		role,
		kind,
		placedPath: str(fm.pocket_placed_path),
		updatedAt: str(fm.pocket_updated_at),
		render: str(fm.pocket_render),
		recordedAt: str(fm.pocket_recorded_at),
		title: typeof fm.pocket_title === "string" ? fm.pocket_title : null,
		folderId: "pocket_folder_id" in fm ? str(fm.pocket_folder_id) : undefined,
		status,
		frozen: freeze === true || freeze === "true" || freeze === 1,
		members: Array.isArray(fm.pocket_members) ? fm.pocket_members.filter((m): m is string => typeof m === "string") : null,
		frontmatter: fm,
	};
}

/** Groups every plugin note by identity and role, from properties alone (no file reads). */
export function buildIndex(files: VaultFile[], pathKeys: Set<string>): IdentityIndex {
	const notes: NoteRecord[] = [];
	const byIdentity = new Map<string, Map<Role, NoteRecord[]>>();
	const duplicates = new Set<string>();
	for (const file of files) {
		const record = noteRecord(file);
		if (!record) continue;
		notes.push(record);
		const roles = byIdentity.get(record.identity) ?? new Map<Role, NoteRecord[]>();
		const claimants = roles.get(record.role) ?? [];
		claimants.push(record);
		roles.set(record.role, claimants);
		byIdentity.set(record.identity, roles);
		if (claimants.length > 1) duplicates.add(record.identity);
	}
	for (const file of files) pathKeys.add(pathKey(file.path));
	return { notes, byIdentity, duplicates, pathKeys, files };
}

/**
 * Builds the index only once the metadata cache covers every markdown file. A cold cache
 * makes notes look absent, which would re-create them as duplicates. While entries are missing,
 * waits for the cache's next `resolved` event and retries, up to `attempts` times, then gives up.
 */
export async function buildIndexWhenReady(vault: VaultOps, waitForResolved: () => Promise<void>, attempts = 3): Promise<IdentityIndex> {
	for (let attempt = 0; ; attempt++) {
		const files = vault.listMarkdown();
		if (files.every((file) => file.frontmatter !== null)) {
			return buildIndex(files, vault.allPathKeys());
		}
		if (attempt >= attempts) throw new VaultIndexingError();
		await waitForResolved();
	}
}

/** The notes of one identity, flattened. */
export function notesOf(index: IdentityIndex, identity: string): NoteRecord[] {
	return [...(index.byIdentity.get(identity)?.values() ?? [])].flat();
}
