import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/schema";

/** Default settings in UTC, so test expectations do not depend on the machine's zone. */
export function settingsWith(overrides: Partial<Settings> = {}): Settings {
	return { ...DEFAULT_SETTINGS, sectionOrder: [...DEFAULT_SETTINGS.sectionOrder], timeZone: "UTC", ...overrides };
}
