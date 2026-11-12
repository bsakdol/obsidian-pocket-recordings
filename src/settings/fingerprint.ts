import { fnv1a, stableStringify } from "../util/hash";
import { RENDER_KEYS, STRUCTURE_KEYS, type Settings } from "./schema";

/**
 * Bumped whenever the renderer's output changes for the same input, so every note is refreshed on
 * the next sync.
 */
export const RENDERER_VERSION = 1;

/** A hash of the settings that decide which files exist and where. */
export function structureFingerprint(settings: Settings): string {
	return fnv1a(stableStringify(pick(settings, STRUCTURE_KEYS)));
}

/** A hash of the render-affecting settings plus the renderer version, stored as `pocket_render`. */
export function renderFingerprint(settings: Settings): string {
	return fnv1a(stableStringify({ renderer: RENDERER_VERSION, settings: pick(settings, RENDER_KEYS) }));
}

function pick(settings: Settings, keys: readonly (keyof Settings)[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of keys) out[key] = settings[key];
	return out;
}
