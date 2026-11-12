import { isUnder, parentOf, pathKey } from "../paths/pathKey";
import { collectTicks } from "../render/actionItems";
import { parseNote, spliceRegion } from "../render/markers";
import type { VaultOps } from "../vault/vaultOps";
import type { Notice, OpKind, Plan } from "./ops";
import { emptyReport, type SyncReport } from "./report";

/**
 * The order ops apply in. Moves come before creates so a recording that moves aside frees its old
 * path for another recording's new note in the same run; region writes come before property writes
 * so an interrupted update is redone by the next sync.
 */
const ORDER: Record<OpKind, number> = {
	"ensure-folder": 0,
	move: 1,
	create: 2,
	"update-region": 3,
	"update-props": 4,
	mark: 5,
	"clear-mark": 5,
	"remove-empty-folder": 6,
};

/** Applies a plan through VaultOps and reports what happened. */
export async function execute(plan: Plan, vault: VaultOps, shouldStop: () => boolean = () => false): Promise<SyncReport> {
	const report = emptyReport();
	report.unchanged = plan.unchanged.length;
	applyNotices(plan.notices, report);

	const ops = plan.ops.map((op, index) => ({ op, index })).sort((a, b) => ORDER[a.op.kind] - ORDER[b.op.kind] || a.index - b.index);
	// Case-folded keys of every path, kept current as this run writes.
	const keys = vault.allPathKeys();
	const failed = new Set<string>();
	const damaged = new Set<string>();
	const updated = new Set<string>();

	for (const { op } of ops) {
		// Every op is idempotent, so stopping between any two leaves a state the next sync completes.
		if (shouldStop()) break;
		if (failed.has(op.identity)) continue;
		try {
			switch (op.kind) {
				case "ensure-folder":
					if (op.path) await vault.ensureFolder(op.path);
					for (let path = op.path; path; path = parentOf(path)) keys.add(pathKey(path));
					break;
				case "move":
					if (keys.has(pathKey(op.to)) && pathKey(op.to) !== pathKey(op.from)) {
						report.conflicts.push({ path: op.from, reason: `could not move to ${op.to}: the path is taken` });
						failed.add(op.identity);
						break;
					}
					await vault.rename(op.from, op.to);
					keys.delete(pathKey(op.from));
					keys.add(pathKey(op.to));
					report.relocated.push(op.to);
					break;
				case "create": {
					const existing = vault.fileExists(op.path) ? vault.frontmatterOf(op.path) : null;
					if (existing && existing.pocket_id === op.frontmatter.pocket_id && existing.pocket_role === op.frontmatter.pocket_role && existing.pocket_id !== undefined) {
						// Another device (or an earlier interrupted run) already wrote this exact note.
						keys.add(pathKey(op.path));
						break;
					}
					if (keys.has(pathKey(op.path))) {
						// Never overwrite: a file already at the path (in any case) is reported instead.
						report.conflicts.push({ path: op.path, reason: "the path is already taken by another file" });
						break;
					}
					await vault.createNote(op.path, op.frontmatter, op.body);
					keys.add(pathKey(op.path));
					report.created.push(op.path);
					break;
				}
				case "update-region": {
					let changed = false;
					await vault.process(op.path, (content) => {
						// The marker check runs inside the atomic rewrite, so check and write cannot race.
						const parsed = parseNote(content);
						if (parsed.kind === "damaged") {
							damaged.add(pathKey(op.path));
							report.conflicts.push({ path: op.path, reason: `markers damaged: ${parsed.reason}` });
							return content;
						}
						const body = op.render(collectTicks(parsed.region));
						if (body === parsed.region) return content;
						changed = true;
						return spliceRegion(parsed, body);
					});
					if (changed) updated.add(op.path);
					break;
				}
				case "update-props":
					if (damaged.has(pathKey(op.path))) break;
					await vault.processFrontmatter(op.path, (fm) => {
						Object.assign(fm, op.set);
						for (const key of op.remove) delete fm[key];
					});
					updated.add(op.path);
					break;
				case "mark":
					if (damaged.has(pathKey(op.path))) break;
					await vault.processFrontmatter(op.path, (fm) => {
						fm.pocket_status = op.status;
					});
					report[op.status].push(op.path);
					break;
				case "clear-mark":
					if (damaged.has(pathKey(op.path))) break;
					await vault.processFrontmatter(op.path, (fm) => {
						delete fm.pocket_status;
					});
					updated.add(op.path);
					break;
				case "remove-empty-folder":
					// Walk up from the emptied folder, never removing the base folder or anything outside it.
					for (let path = op.path; path && isUnder(path, op.stopAt) && pathKey(path) !== pathKey(op.stopAt); path = parentOf(path)) {
						if (!(await vault.removeFolderIfEmpty(path))) break;
						keys.delete(pathKey(path));
					}
					break;
			}
		} catch (error) {
			failed.add(op.identity);
			report.errors.push({ identity: op.identity, message: error instanceof Error ? error.message : String(error) });
		}
	}

	const created = new Set(report.created.map(pathKey));
	report.updated = [...updated].filter((path) => !created.has(pathKey(path)));
	return report;
}

function applyNotices(notices: Notice[], report: SyncReport): void {
	for (const notice of notices) {
		switch (notice.kind) {
			case "user-moved":
				report.userMoved.push(...notice.paths);
				break;
			case "duplicate":
				report.duplicates.push(notice.paths);
				break;
			case "frozen":
				report.frozen.push(...notice.paths);
				break;
			case "conflict":
				for (const path of notice.paths) report.conflicts.push({ path, reason: notice.detail ?? "conflict" });
				break;
		}
	}
}
