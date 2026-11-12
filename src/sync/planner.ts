// The reconciliation planner: a pure function from Pocket's listing, the vault's identity index, and
// settings to the ops that make the vault reflect Pocket. Running it on the vault its own
// ops produced yields no ops.

import type { ListedRecording, RecordingDetail, RecordingKind } from "../model";
import { parentOf, pathKey } from "../paths/pathKey";
import { placeRecording, resolveCollisions, rolesFor, rollupPath, type Occupancy, type Placement } from "../paths/placement";
import { localDate } from "../paths/time";
import type { FolderTree } from "../pocket/folders";
import { renderConversationRole } from "../render/conversation";
import { renderInsight, renderRollup, sortMembers } from "../render/insight";
import { buildProperties, type PropertySet } from "../render/properties";
import type { Role, Settings } from "../settings/schema";
import type { Frontmatter } from "../vault/vaultOps";
import { notesOf, recordingIdentity, rollupIdentity, type IdentityIndex, type NoteRecord } from "./identityIndex";
import type { Notice, Op, Plan } from "./ops";
import { isInHorizon, type Scoped } from "./scope";

export interface PlanInput {
	scoped: Scoped[];
	index: IdentityIndex;
	/** The effective settings (confirmed structure applied). */
	settings: Settings;
	tree: FolderTree | null;
	renderFingerprint: string;
	horizonStartMs: number | null;
	/** "Re-sync everything": refetch and rewrite every in-scope recording. */
	resyncAll?: boolean;
}

type Action = "create" | "stay" | "move" | "user-moved" | "hold";

interface RoleDecision {
	role: Role;
	target: string;
	note: NoteRecord | null;
	action: Action;
}

interface Decision {
	recording: ListedRecording;
	kind: RecordingKind;
	identity: string;
	notes: NoteRecord[];
	blocked: Notice | null;
	roles: RoleDecision[];
	/** Notes whose role the current layout, outputs, or kind no longer uses. */
	retire: NoteRecord[];
	needsDetails: boolean;
}

const same = (a: string | null, b: string | null): boolean => a !== null && b !== null && pathKey(a) === pathKey(b);
const json = (value: unknown): string => JSON.stringify(value ?? null);

/** Who occupies each path, from note properties: plugin notes own their file and every ancestor folder. */
export function occupancyOracle(index: IdentityIndex): (anchor: string) => Occupancy {
	const owners = new Map<string, Set<string>>();
	for (const note of index.notes) {
		const owner = note.id ?? note.identity;
		for (let path = note.path; path; path = parentOf(path)) {
			const key = pathKey(path);
			const set = owners.get(key) ?? new Set<string>();
			set.add(owner);
			owners.set(key, set);
		}
	}
	return (anchor) => {
		const key = pathKey(anchor);
		if (!index.pathKeys.has(key)) return { kind: "free" };
		const ids = owners.get(key);
		return ids && ids.size > 0 ? { kind: "owned", ids } : { kind: "foreign" };
	};
}

/** The placements of every in-scope recording, with collisions resolved. */
export function placementsFor(input: PlanInput): Map<string, Placement> {
	const placements = input.scoped
		.filter((s) => s.scope === "in-scope")
		.map((s) => placeRecording(s.recording, s.kind, input.tree, input.settings));
	return new Map(resolveCollisions(placements, occupancyOracle(input.index)).map((p) => [p.id, p]));
}

/** The properties a note should carry, ignoring those only details can supply. */
function desiredProperties(recording: ListedRecording & { speakers?: string[] }, kind: RecordingKind, role: Role, input: PlanInput): PropertySet {
	return buildProperties({ recording, kind, role, settings: input.settings, tree: input.tree, renderFingerprint: input.renderFingerprint });
}

/** Whether any property the listing can decide is stale; `pocket_speakers` needs the detail, so it is skipped. */
function staleFromListing(note: NoteRecord, recording: ListedRecording, kind: RecordingKind, input: PlanInput): boolean {
	const desired = desiredProperties(recording, kind, note.role, input);
	for (const [key, value] of Object.entries(desired.set)) {
		if (key !== "pocket_speakers" && json(note.frontmatter[key]) !== json(value)) return true;
	}
	return desired.remove.some((key) => key !== "pocket_speakers" && key in note.frontmatter);
}

function decide(scoped: Scoped, placement: Placement, input: PlanInput): Decision {
	const { recording, kind } = scoped;
	const identity = recordingIdentity(recording.id);
	const notes = notesOf(input.index, identity);
	const decision: Decision = { recording, kind, identity, notes, blocked: null, roles: [], retire: [], needsDetails: false };

	if (input.index.duplicates.has(identity)) {
		decision.blocked = { kind: "duplicate", identity, paths: notes.map((n) => n.path) };
		return decision;
	}
	const active = notes.filter((n) => n.status !== "superseded");
	if (new Set(active.map((n) => n.kind ?? "")).size > 1 || new Set(active.map((n) => n.recordedAt ?? "")).size > 1) {
		decision.blocked = { kind: "conflict", identity, paths: notes.map((n) => n.path), detail: "its notes' pocket_* properties disagree" };
		return decision;
	}

	const wanted = rolesFor(kind, input.settings);
	const byRole = input.index.byIdentity.get(identity);
	for (const role of wanted) {
		const target = placement.files[role];
		if (!target) continue;
		const note = byRole?.get(role)?.[0] ?? null;
		let action: Action;
		if (!note) action = "create";
		else if (same(note.path, target)) action = "stay";
		// A folder the tree does not know is a guess; never move existing notes on a guess.
		else if (placement.uncertain) action = "hold";
		else if (same(note.path, note.placedPath)) action = "move";
		else action = "user-moved";
		decision.roles.push({ role, target, note, action });
	}
	decision.retire = notes.filter((n) => !wanted.includes(n.role));

	decision.needsDetails = decision.roles.some(({ note, action }) => {
		if (note?.frozen) return false;
		if (action === "create" || action === "move") return true;
		if (!note) return false;
		return input.resyncAll === true || note.status === "superseded" || staleFromListing(note, recording, kind, input);
	});
	return decision;
}

function decisions(input: PlanInput): Decision[] {
	const placements = placementsFor(input);
	return input.scoped.flatMap((s) => {
		const placement = s.scope === "in-scope" ? placements.get(s.recording.id) : undefined;
		return placement ? [decide(s, placement, input)] : [];
	});
}

/** Stage 1: the in-scope recordings whose details must be fetched. Unchanged ones need none. */
export function needsDetails(input: PlanInput): ListedRecording[] {
	const needed = new Map<string, ListedRecording>();
	for (const d of decisions(input)) if (!d.blocked && d.needsDetails) needed.set(d.recording.id, d.recording);
	for (const r of rollupDecisions(input)) if (!r.blocked && r.needsDetails) for (const member of r.members) needed.set(member.id, member);
	return [...needed.values()];
}

/** Puts the change-detection keys last, so an interrupted property write is redone next sync. */
function withPlacedPath(set: Frontmatter, placedPath: string | null): Frontmatter {
	const { pocket_updated_at, pocket_render, ...rest } = set;
	return { ...rest, ...(placedPath ? { pocket_placed_path: placedPath } : {}), pocket_updated_at, pocket_render };
}

function propsDiff(note: NoteRecord, desired: Frontmatter, remove: string[]): { set: Frontmatter; remove: string[] } | null {
	const set: Frontmatter = {};
	for (const [key, value] of Object.entries(desired)) if (json(note.frontmatter[key]) !== json(value)) set[key] = value;
	const removals = remove.filter((key) => key in note.frontmatter && !(key in desired));
	return Object.keys(set).length > 0 || removals.length > 0 ? { set, remove: removals } : null;
}

/**
 * Stage 2: every op for the run. `details` holds the fetched recordings; a recording that needed
 * details and has none (its fetch failed, or the run ran out of rate-limit budget) is skipped whole
 * and caught up next sync.
 */
export function planOps(input: PlanInput, details: ReadonlyMap<string, RecordingDetail>): Plan {
	const ops: Op[] = [];
	const notices: Notice[] = [];
	const unchanged: string[] = [];
	const base = input.settings.baseFolder;

	for (const d of decisions(input)) {
		if (d.blocked) {
			notices.push(d.blocked);
			continue;
		}
		const detail = details.get(d.recording.id);
		if (d.needsDetails && !detail) continue;
		const before = ops.length;
		const finalPath = (rd: RoleDecision): string => (rd.action === "create" || rd.action === "move" ? rd.target : (rd.note?.path ?? rd.target));
		const siblings: Partial<Record<Role, string>> = {};
		for (const rd of d.roles) siblings[rd.role] = finalPath(rd);

		for (const rd of d.roles) {
			const { note } = rd;
			if (note?.frozen) {
				notices.push({ kind: "frozen", identity: d.identity, paths: [note.path] });
				continue;
			}
			if (rd.action === "user-moved" && note) {
				notices.push({ kind: "user-moved", identity: d.identity, paths: [note.path], detail: rd.target });
			}
			const placedPath = rd.action === "user-moved" || rd.action === "hold" ? (note?.placedPath ?? null) : rd.target;

			if (!detail) {
				// Nothing changed in Pocket: only repair placement memory and clear stale marks.
				if (note && rd.action === "stay" && !same(note.placedPath, rd.target)) {
					ops.push({ kind: "update-props", identity: d.identity, path: note.path, set: { pocket_placed_path: rd.target }, remove: [] });
				}
				if (note?.status) ops.push({ kind: "clear-mark", identity: d.identity, path: note.path });
				continue;
			}

			// Properties come from the listing (plus speakers, which only the detail has), so they match
			// what the staleness check compares against even when the detail disagrees with the listing.
			const desired = desiredProperties({ ...d.recording, speakers: detail.speakers }, d.kind, rd.role, input);
			const frontmatter = withPlacedPath(desired.set, placedPath);
			const render = (ticks: ReadonlySet<string>): string =>
				rd.role === "insight" ? renderInsight(detail, input.settings, ticks) : renderConversationRole({ detail, role: rd.role, settings: input.settings, siblings, ticks });
			const path = finalPath(rd);

			if (!note) {
				ops.push({ kind: "ensure-folder", identity: d.identity, path: parentOf(rd.target) });
				ops.push({ kind: "create", identity: d.identity, path: rd.target, frontmatter, body: render(new Set()) });
				continue;
			}
			if (rd.action === "move") {
				ops.push({ kind: "ensure-folder", identity: d.identity, path: parentOf(rd.target) });
				ops.push({ kind: "move", identity: d.identity, from: note.path, to: rd.target });
				ops.push({ kind: "remove-empty-folder", identity: d.identity, path: parentOf(note.path), stopAt: base });
			}
			ops.push({ kind: "update-region", identity: d.identity, path, render });
			const diff = propsDiff(note, frontmatter, [...desired.remove, ...(placedPath ? [] : ["pocket_placed_path"])]);
			if (diff) ops.push({ kind: "update-props", identity: d.identity, path, ...diff });
			if (note.status) ops.push({ kind: "clear-mark", identity: d.identity, path });
		}

		for (const note of d.retire) {
			if (note.frozen) notices.push({ kind: "frozen", identity: d.identity, paths: [note.path] });
			else if (note.status !== "superseded") ops.push({ kind: "mark", identity: d.identity, path: note.path, status: "superseded" });
		}
		if (ops.length === before) unchanged.push(d.identity);
	}

	planRollups(input, details, ops, notices, unchanged);
	planUnscoped(input, ops, notices);
	return { ops: dedupeFolders(ops), notices, unchanged };
}

/** Notes of excluded recordings, and of recordings Pocket no longer lists. */
function planUnscoped(input: PlanInput, ops: Op[], notices: Notice[]): void {
	const listed = new Map(input.scoped.map((s) => [recordingIdentity(s.recording.id), s]));
	for (const [identity] of input.index.byIdentity) {
		if (!identity.startsWith("id:")) continue;
		const scoped = listed.get(identity);
		let status: "deleted" | "excluded" | null = null;
		if (!scoped) status = "deleted";
		else if (scoped.scope === "excluded") status = "excluded";
		if (!status) continue;

		const notes = notesOf(input.index, identity);
		if (status === "deleted") {
			// Absent from a complete listing: deleted when inside the horizon, left alone when older.
			const recordedAt = notes.find((n) => n.recordedAt)?.recordedAt ?? null;
			if (!recordedAt || !isInHorizon(recordedAt, input.horizonStartMs)) continue;
		}
		if (input.index.duplicates.has(identity)) {
			notices.push({ kind: "duplicate", identity, paths: notes.map((n) => n.path) });
			continue;
		}
		for (const note of notes) {
			if (note.frozen) notices.push({ kind: "frozen", identity, paths: [note.path] });
			else if (note.status !== status) ops.push({ kind: "mark", identity, path: note.path, status });
		}
	}
}

/** One ensure-folder per path, and one empty-folder removal per folder. */
function dedupeFolders(ops: Op[]): Op[] {
	const seen = new Set<string>();
	return ops.filter((op) => {
		if (op.kind !== "ensure-folder" && op.kind !== "remove-empty-folder") return true;
		const key = `${op.kind}:${pathKey(op.path)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

interface RollupDecision {
	date: string;
	identity: string;
	members: ListedRecording[];
	/** `id@updated_at` of each member, sorted: the regeneration key. */
	memberKeys: string[];
	note: NoteRecord | null;
	target: string;
	action: Action;
	blocked: Notice | null;
	needsDetails: boolean;
}

/** Daily rollups the in-scope highlights call for, keyed by their local date. */
function rollupDecisions(input: PlanInput): RollupDecision[] {
	if (input.settings.insightShape !== "rollup") return [];
	const byDate = new Map<string, ListedRecording[]>();
	for (const s of input.scoped) {
		if (s.scope !== "in-scope" || s.kind !== "insight") continue;
		const date = localDate(s.recording.recordingAt, input.settings.timeZone);
		byDate.set(date, [...(byDate.get(date) ?? []), s.recording]);
	}
	const placements = resolveCollisions(
		[...byDate.entries()].map(([date, members]): Placement => {
			const path = rollupPath(date, input.settings);
			return { id: rollupIdentity(date), kind: "insight", recordingAt: `${date}T00:00:00.000Z`, anchor: path, files: { rollup: path }, uncertain: false };
		}),
		occupancyOracle(input.index),
	);
	return placements.map((placement) => {
		const date = placement.id.slice("rollup:".length);
		const identity = placement.id;
		const members = sortMembers(byDate.get(date) ?? []);
		const memberKeys = members.map((m) => `${m.id}@${m.updatedAt}`).sort();
		const target = placement.anchor;
		const claimants = input.index.byIdentity.get(identity)?.get("rollup") ?? [];
		const note = claimants[0] ?? null;
		const decision: RollupDecision = { date, identity, members, memberKeys, note, target, action: "create", blocked: null, needsDetails: false };
		if (input.index.duplicates.has(identity)) {
			decision.blocked = { kind: "duplicate", identity, paths: notesOf(input.index, identity).map((n) => n.path) };
			return decision;
		}
		if (note) decision.action = same(note.path, target) ? "stay" : same(note.path, note.placedPath) ? "move" : "user-moved";
		if (note?.frozen) return decision;
		decision.needsDetails =
			!note ||
			decision.action === "move" ||
			input.resyncAll === true ||
			note.status !== null ||
			note.render !== input.renderFingerprint ||
			json(note.members) !== json(memberKeys);
		return decision;
	});
}

function planRollups(input: PlanInput, details: ReadonlyMap<string, RecordingDetail>, ops: Op[], notices: Notice[], unchanged: string[]): void {
	const wanted = new Set<string>();
	for (const r of rollupDecisions(input)) {
		wanted.add(r.identity);
		if (r.blocked) {
			notices.push(r.blocked);
			continue;
		}
		const { note } = r;
		if (note?.frozen) {
			notices.push({ kind: "frozen", identity: r.identity, paths: [note.path] });
			continue;
		}
		if (r.action === "user-moved" && note) notices.push({ kind: "user-moved", identity: r.identity, paths: [note.path], detail: r.target });
		if (!r.needsDetails) {
			if (note && r.action === "stay" && !same(note.placedPath, r.target)) {
				ops.push({ kind: "update-props", identity: r.identity, path: note.path, set: { pocket_placed_path: r.target }, remove: [] });
			} else {
				unchanged.push(r.identity);
			}
			continue;
		}
		// A rollup is regenerated from every member, so it waits until all of them are fetched.
		const memberDetails = r.members.map((m) => details.get(m.id));
		if (memberDetails.some((detail) => !detail)) continue;
		const fetched = memberDetails.filter((detail): detail is RecordingDetail => detail !== undefined);
		const placedPath = r.action === "user-moved" ? (note?.placedPath ?? null) : r.target;
		const latest = r.members.reduce((max, m) => (m.updatedAt > max ? m.updatedAt : max), "");
		const frontmatter = withPlacedPath(
			{
				pocket_rollup_date: r.date,
				pocket_role: "rollup",
				pocket_kind: "insight",
				pocket_members: r.memberKeys,
				pocket_updated_at: latest,
				pocket_render: input.renderFingerprint,
			},
			placedPath,
		);
		const render = (ticks: ReadonlySet<string>): string => renderRollup(fetched, input.settings, ticks);
		if (!note) {
			ops.push({ kind: "ensure-folder", identity: r.identity, path: parentOf(r.target) });
			ops.push({ kind: "create", identity: r.identity, path: r.target, frontmatter, body: render(new Set()) });
			continue;
		}
		const path = r.action === "move" ? r.target : note.path;
		if (r.action === "move") {
			ops.push({ kind: "ensure-folder", identity: r.identity, path: parentOf(r.target) });
			ops.push({ kind: "move", identity: r.identity, from: note.path, to: r.target });
			ops.push({ kind: "remove-empty-folder", identity: r.identity, path: parentOf(note.path), stopAt: input.settings.baseFolder });
		}
		ops.push({ kind: "update-region", identity: r.identity, path, render });
		const diff = propsDiff(note, frontmatter, placedPath ? [] : ["pocket_placed_path"]);
		if (diff) ops.push({ kind: "update-props", identity: r.identity, path, ...diff });
		if (note.status) ops.push({ kind: "clear-mark", identity: r.identity, path });
	}

	// Rollups no longer called for: deleted when their day lost every highlight inside the horizon,
	// superseded when the insight shape changed, left alone when older than the horizon.
	for (const [identity] of input.index.byIdentity) {
		if (!identity.startsWith("rollup:") || wanted.has(identity)) continue;
		const notes = notesOf(input.index, identity);
		const date = identity.slice("rollup:".length);
		let status: "deleted" | "superseded" | null = null;
		if (input.settings.insightShape !== "rollup") status = "superseded";
		else if (input.horizonStartMs === null || localDate(new Date(input.horizonStartMs).toISOString(), input.settings.timeZone) <= date) status = "deleted";
		if (!status) continue;
		if (input.index.duplicates.has(identity)) {
			notices.push({ kind: "duplicate", identity, paths: notes.map((n) => n.path) });
			continue;
		}
		for (const n of notes) {
			if (n.frozen) notices.push({ kind: "frozen", identity, paths: [n.path] });
			else if (n.status !== status) ops.push({ kind: "mark", identity, path: n.path, status });
		}
	}
}
