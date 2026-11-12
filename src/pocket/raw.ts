// Raw Pocket payload shapes, as documented and as observed. Every field is optional and loosely
// typed: mappers.ts validates each one before it reaches the rest of the plugin.

export type Json = Record<string, unknown>;

export interface RawEnvelope {
	success?: boolean;
	data?: unknown;
	error?: string;
	pagination?: { page?: number; limit?: number; total?: number; total_pages?: number; has_more?: boolean };
}

export interface RawRecording {
	id?: unknown;
	title?: unknown;
	recording_at?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
	duration?: unknown;
	state?: unknown;
	language?: unknown;
	folder_id?: unknown;
	tags?: unknown;
	speakers?: unknown;
	transcript?: unknown;
	summarizations?: unknown;
	summarizations_errors?: unknown;
	translation?: unknown;
}

export interface RawSegment {
	start?: unknown;
	end?: unknown;
	speaker?: unknown;
	speakerName?: unknown;
	text?: unknown;
	originalText?: unknown;
}

export interface RawSummarization {
	id?: unknown;
	processingStatus?: unknown;
	createdAt?: unknown;
	updatedAt?: unknown;
	v2?: unknown;
}

export function asObject(value: unknown): Json | null {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
