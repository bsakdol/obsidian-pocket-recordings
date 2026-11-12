// Dates formatted in one vault-level IANA zone, so every device computes the same folders and
// names for a recording.

export interface LocalParts {
	year: string;
	month: string;
	day: string;
	hour: string;
	minute: string;
}

/** The device's zone, captured on first run as the vault's zone. */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
	let cached = formatters.get(zone);
	if (!cached) {
		cached = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(zone, cached);
	}
	return cached;
}

/** The calendar parts of `iso` in `zone` (the device zone when empty). */
export function localParts(iso: string, zone: string): LocalParts {
	const parts = formatter(zone || deviceTimeZone()).formatToParts(new Date(iso));
	const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "00";
	return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute") };
}

/** `YYYY-MM-DD` of `iso` in `zone`. */
export function localDate(iso: string, zone: string): string {
	const { year, month, day } = localParts(iso, zone);
	return `${year}-${month}-${day}`;
}
