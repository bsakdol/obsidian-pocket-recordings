import { localParts } from "./time";

/** Every token a name template may use. */
export const TEMPLATE_TOKENS = ["date", "time", "title", "id", "short_id", "year", "month", "day", "hour", "minute"] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export interface TemplateInput {
	id: string;
	title: string;
	/** ISO timestamp the date tokens are taken from. */
	at: string;
	zone: string;
}

/** The token names a template uses, including unknown ones. */
export function tokensOf(template: string): string[] {
	return [...template.matchAll(TOKEN)].map((match) => match[1] ?? "");
}

/** Fills a template's tokens. The result is not yet sanitized; unknown tokens are left as written. */
export function fillTemplate(template: string, input: TemplateInput): string {
	const p = localParts(input.at, input.zone);
	const values: Record<TemplateToken, string> = {
		date: `${p.year}-${p.month}-${p.day}`,
		time: `${p.hour}-${p.minute}`,
		title: input.title,
		id: input.id,
		short_id: input.id.slice(0, 6),
		year: p.year,
		month: p.month,
		day: p.day,
		hour: p.hour,
		minute: p.minute,
	};
	return template.replace(TOKEN, (whole, name: string) => (name in values ? values[name as TemplateToken] : whole));
}
