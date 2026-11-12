// Minimal stand-in for the `obsidian` module, used only by the test bundle.

// Plugin code uses `window` timers, as Obsidian requires; Node has none, so alias the global.
(globalThis as { window?: unknown }).window ??= globalThis;

// Mirrors Obsidian's normalizePath: it does not trim whitespace, so a path
// with a leading space stays distinct from the same path without one.
export function normalizePath(path: string): string {
	let normalized = path
		.replace(/[\\/]+/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/[\u00A0\u202F]/g, " ");
	if (normalized === "") {
		normalized = "/";
	}
	return normalized.normalize("NFC");
}

// Tests inject their own request function; reaching the real one means a test forgot to.
export function requestUrl(): never {
	throw new Error("requestUrl is not available in tests; inject a request function.");
}

export const Platform = { isMobile: false, isDesktop: true };

export class TAbstractFile {
	path = "";
	name = "";
}

export class TFile extends TAbstractFile {}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export class Plugin {}

export class Notice {
	constructor(public message?: string) {}
}

/** Records the modals a test opens; nothing is drawn. */
export class Modal {
	static opened: Modal[] = [];

	constructor(public app?: unknown) {}

	open(): void {
		Modal.opened.push(this);
	}

	close(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
	emptyStateText = "";
	setPlaceholder(_placeholder: string): void {}
	getItems(): T[] {
		return [];
	}
}

export class PluginSettingTab {}

export class Setting {}

export function stringifyYaml(value: unknown): string {
	return JSON.stringify(value);
}
