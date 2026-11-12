// Commit-time validators for the settings UI. Obsidian runs them when a value is committed
// (leaving the field or pressing Enter), never on each keystroke; a message rejects the value and
// shows inline, and the stored value stays at the last valid one.

import { TEMPLATE_TOKENS, tokensOf } from "../paths/template";
import { isValidTimeZone, MAX_INTERVAL, MIN_INTERVAL, sanitizeBaseFolder } from "./schema";

export function validateInterval(value: number): string | undefined {
	if (!Number.isInteger(value) || value < MIN_INTERVAL || value > MAX_INTERVAL) {
		return `Enter a whole number of minutes, ${MIN_INTERVAL}–${MAX_INTERVAL}.`;
	}
	return undefined;
}

export function validateHorizonDays(value: number): string | undefined {
	return Number.isInteger(value) && value >= 1 && value <= 36500 ? undefined : "Enter a whole number of days, 1 or more.";
}

export function validateTemplate(value: string): string | undefined {
	if (value.trim().length === 0) return "Enter a name template.";
	const unknown = tokensOf(value).filter((token) => !(TEMPLATE_TOKENS as readonly string[]).includes(token));
	if (unknown.length > 0) {
		return `Unknown token ${unknown.map((token) => `{{${token}}}`).join(", ")}. Available: ${TEMPLATE_TOKENS.map((token) => `{{${token}}}`).join(", ")}.`;
	}
	return undefined;
}

export function validateTimeZone(value: string): string | undefined {
	return isValidTimeZone(value.trim()) ? undefined : "Enter an IANA time zone, such as America/Chicago.";
}

export function validateDate(value: string): string | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a date as YYYY-MM-DD.";
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? undefined : "Enter a real date as YYYY-MM-DD.";
}

export function validateBaseFolder(value: string): string | undefined {
	return sanitizeBaseFolder(value).length > 0 ? undefined : "Enter a folder for synced notes.";
}

export function validateTag(value: string): string | undefined {
	return value.trim().length > 0 ? undefined : "Enter the tag that marks highlights.";
}
