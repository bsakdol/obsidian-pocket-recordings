import type { Frontmatter } from "../vault/vaultOps";
import type { NoteStatus } from "./identityIndex";

/**
 * What the planner asks the executor to do. Every op is idempotent: applying it to a vault that
 * already reflects it changes nothing. `identity` groups a recording's (or rollup's) ops, so one
 * failure skips only that recording's remaining ops.
 */
export type Op =
	| { kind: "ensure-folder"; identity: string; path: string }
	| { kind: "move"; identity: string; from: string; to: string }
	| { kind: "create"; identity: string; path: string; frontmatter: Frontmatter; body: string }
	/** Rewrites the region; `render` receives the ticks collected from the old region. */
	| { kind: "update-region"; identity: string; path: string; render: (ticks: ReadonlySet<string>) => string }
	| { kind: "update-props"; identity: string; path: string; set: Frontmatter; remove: string[] }
	| { kind: "mark"; identity: string; path: string; status: NoteStatus }
	| { kind: "clear-mark"; identity: string; path: string }
	| { kind: "remove-empty-folder"; identity: string; path: string; stopAt: string };

export type OpKind = Op["kind"];

/** Things the user should know that need no write. */
export interface Notice {
	kind: "user-moved" | "conflict" | "duplicate" | "frozen";
	identity: string;
	paths: string[];
	detail?: string;
}

export interface Plan {
	ops: Op[];
	notices: Notice[];
	/** In-scope identities that needed nothing. */
	unchanged: string[];
}
