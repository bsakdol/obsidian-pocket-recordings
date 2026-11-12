// Typed settings, their defaults, and the read-time sanitizer. Stored data is re-validated on every
// load: the settings UI validates on commit, but data.json may come from another version or be
// hand-edited.

export const SCHEMA_VERSION = 1;

export const ROLES = ["main", "transcript", "summary", "action-items", "mind-map", "translation", "single", "insight", "rollup"] as const;
export type Role = (typeof ROLES)[number];

/** The sections a main or single note can hold, in the user's chosen order. */
export const SECTIONS = ["summary", "action-items", "mind-map", "transcript", "translation"] as const;
export type Section = (typeof SECTIONS)[number];

export const SCHEMES = ["pocket-folders", "date"] as const;
export const GRANULARITIES = ["YYYY-MM-DD", "YYYY-MM", "YYYY/MM/DD"] as const;
export const LAYOUTS = ["main-transcript", "per-output", "single"] as const;
export const INSIGHT_SHAPES = ["per-recording", "rollup"] as const;
export const HORIZONS = ["all", "days", "since"] as const;

export const MIN_INTERVAL = 5;
export const MAX_INTERVAL = 1440;
/** The pseudo-folder id that picks recordings in no Pocket folder. */
export const UNFILED_ID = "__unfiled__";

export interface Settings {
	/** The id of the API key in Obsidian's secret storage; never the key itself. */
	apiKeySecret: string;

	outputSummary: boolean;
	outputActionItems: boolean;
	outputMindMaps: boolean;
	outputTranscript: boolean;
	outputTranslation: boolean;

	horizon: (typeof HORIZONS)[number];
	horizonDays: number;
	/** `YYYY-MM-DD`. */
	horizonSince: string;

	includeFolderIds: string[];
	excludeFolderIds: string[];
	includeTagIds: string[];
	excludeTagIds: string[];

	baseFolder: string;
	scheme: (typeof SCHEMES)[number];
	granularity: (typeof GRANULARITIES)[number];
	layout: (typeof LAYOUTS)[number];
	insightShape: (typeof INSIGHT_SHAPES)[number];
	insightsTag: string;
	/** IANA zone all devices format dates in. Empty until the first run captures it. */
	timeZone: string;

	templateFolder: string;
	templateMain: string;
	templateSingle: string;
	templateTranscript: string;
	templateSummary: string;
	templateActionItems: string;
	templateMindMap: string;
	templateTranslation: string;
	templateInsight: string;
	templateRollup: string;

	propSpace: boolean;
	propFolder: boolean;
	propSpeakers: boolean;
	propTags: boolean;
	propDuration: boolean;
	propLanguage: boolean;

	transcriptTimestamps: boolean;
	sectionOrder: Section[];
	actionItemDueDates: boolean;
	actionItemStatus: boolean;
	hideCompletedActionItems: boolean;
	inlineTags: boolean;

	intervalMinutes: number;
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	apiKeySecret: "",

	outputSummary: true,
	outputActionItems: true,
	outputMindMaps: true,
	outputTranscript: true,
	outputTranslation: true,

	horizon: "all",
	horizonDays: 30,
	horizonSince: "",

	includeFolderIds: [],
	excludeFolderIds: [],
	includeTagIds: [],
	excludeTagIds: [],

	baseFolder: "Pocket",
	scheme: "pocket-folders",
	granularity: "YYYY-MM-DD",
	layout: "main-transcript",
	insightShape: "per-recording",
	insightsTag: "highlights",
	timeZone: "",

	templateFolder: "{{date}} {{title}}",
	templateMain: "{{title}}",
	templateSingle: "{{title}}",
	templateTranscript: "{{title}} - Transcript",
	templateSummary: "{{title}} - Summary",
	templateActionItems: "{{title}} - Action items",
	templateMindMap: "{{title}} - Mind map",
	templateTranslation: "{{title}} - Translation",
	templateInsight: "{{date}} {{title}}",
	templateRollup: "{{date}} Highlights",

	propSpace: true,
	propFolder: true,
	propSpeakers: true,
	propTags: true,
	propDuration: true,
	propLanguage: true,

	transcriptTimestamps: true,
	sectionOrder: [...SECTIONS],
	actionItemDueDates: true,
	actionItemStatus: false,
	hideCompletedActionItems: false,
	inlineTags: false,

	intervalMinutes: 60,
	debugLogging: false,
} satisfies Settings) as Readonly<Settings>;

/**
 * The settings that decide which files exist and where. Changing them can move or supersede
 * notes, so they change only through the ask-once Apply flow.
 */
export const STRUCTURE_KEYS = [
	"baseFolder",
	"scheme",
	"granularity",
	"layout",
	"outputSummary",
	"outputActionItems",
	"outputMindMaps",
	"outputTranscript",
	"outputTranslation",
	"templateFolder",
	"templateMain",
	"templateSingle",
	"templateTranscript",
	"templateSummary",
	"templateActionItems",
	"templateMindMap",
	"templateTranslation",
	"templateInsight",
	"templateRollup",
	"insightShape",
	"insightsTag",
	"timeZone",
] as const satisfies readonly (keyof Settings)[];
export type StructureKey = (typeof STRUCTURE_KEYS)[number];
export type Structure = Pick<Settings, StructureKey>;

/** The settings that change how notes render but not where they are. Saved at once. */
export const RENDER_KEYS = [
	"outputSummary",
	"outputActionItems",
	"outputMindMaps",
	"outputTranscript",
	"outputTranslation",
	"propSpace",
	"propFolder",
	"propSpeakers",
	"propTags",
	"propDuration",
	"propLanguage",
	"transcriptTimestamps",
	"sectionOrder",
	"actionItemDueDates",
	"actionItemStatus",
	"hideCompletedActionItems",
	"inlineTags",
	"timeZone",
] as const satisfies readonly (keyof Settings)[];

/** What data.json holds. Sync knowledge lives in the vault, never here. */
export interface PluginData {
	schemaVersion: number;
	/** All settings. Structure fields here are the user's draft until applied. */
	settings: Settings;
	/** The structure the vault reflects. Null until the first sync confirms one. */
	confirmedStructure: Structure | null;
}

export function pickStructure(settings: Settings): Structure {
	const out = {} as Record<StructureKey, unknown>;
	for (const key of STRUCTURE_KEYS) out[key] = settings[key];
	return out as Structure;
}

/** The settings a sync runs with: the user's settings, with structure taken from the confirmed copy. */
export function effectiveSettings(data: PluginData): Settings {
	return data.confirmedStructure ? { ...data.settings, ...data.confirmedStructure } : data.settings;
}

/** Whether any structure field in the settings differs from the confirmed structure. */
export function hasStructureDraft(data: PluginData): boolean {
	if (!data.confirmedStructure) return false;
	const confirmed = data.confirmedStructure;
	return STRUCTURE_KEYS.some((key) => JSON.stringify(data.settings[key]) !== JSON.stringify(confirmed[key]));
}

export function sanitizeData(raw: unknown): PluginData {
	const value = isRecord(raw) ? raw : {};
	const settings = sanitizeSettings(value.settings);
	const confirmed = isRecord(value.confirmedStructure) ? pickStructure(sanitizeSettings(value.confirmedStructure)) : null;
	return { schemaVersion: SCHEMA_VERSION, settings, confirmedStructure: confirmed };
}

/** Coerces every field to a valid value, falling back to its default. Unknown fields are dropped. */
export function sanitizeSettings(raw: unknown): Settings {
	const value = isRecord(raw) ? raw : {};
	const d = DEFAULT_SETTINGS;
	const text = (key: keyof Settings, fallback: string): string => (typeof value[key] === "string" ? value[key] : fallback);
	const flag = (key: keyof Settings, fallback: boolean): boolean => (typeof value[key] === "boolean" ? value[key] : fallback);
	const oneOf = <T extends string>(key: keyof Settings, options: readonly T[], fallback: T): T =>
		options.includes(value[key] as T) ? (value[key] as T) : fallback;
	const ids = (key: keyof Settings): string[] =>
		Array.isArray(value[key]) ? [...new Set((value[key] as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0))] : [];
	const template = (key: keyof Settings, fallback: string): string => {
		const candidate = text(key, fallback).trim();
		return candidate.length > 0 ? candidate : fallback;
	};

	return {
		apiKeySecret: text("apiKeySecret", d.apiKeySecret),

		outputSummary: flag("outputSummary", d.outputSummary),
		outputActionItems: flag("outputActionItems", d.outputActionItems),
		outputMindMaps: flag("outputMindMaps", d.outputMindMaps),
		outputTranscript: flag("outputTranscript", d.outputTranscript),
		outputTranslation: flag("outputTranslation", d.outputTranslation),

		horizon: oneOf("horizon", HORIZONS, d.horizon),
		horizonDays: clampInt(value.horizonDays, 1, 36500, d.horizonDays),
		horizonSince: /^\d{4}-\d{2}-\d{2}$/.test(text("horizonSince", "")) ? text("horizonSince", "") : d.horizonSince,

		includeFolderIds: ids("includeFolderIds"),
		excludeFolderIds: ids("excludeFolderIds"),
		includeTagIds: ids("includeTagIds"),
		excludeTagIds: ids("excludeTagIds"),

		baseFolder: sanitizeBaseFolder(text("baseFolder", d.baseFolder)) || d.baseFolder,
		scheme: oneOf("scheme", SCHEMES, d.scheme),
		granularity: oneOf("granularity", GRANULARITIES, d.granularity),
		layout: oneOf("layout", LAYOUTS, d.layout),
		insightShape: oneOf("insightShape", INSIGHT_SHAPES, d.insightShape),
		insightsTag: text("insightsTag", d.insightsTag).trim() || d.insightsTag,
		timeZone: isValidTimeZone(text("timeZone", "")) ? text("timeZone", "") : d.timeZone,

		templateFolder: template("templateFolder", d.templateFolder),
		templateMain: template("templateMain", d.templateMain),
		templateSingle: template("templateSingle", d.templateSingle),
		templateTranscript: template("templateTranscript", d.templateTranscript),
		templateSummary: template("templateSummary", d.templateSummary),
		templateActionItems: template("templateActionItems", d.templateActionItems),
		templateMindMap: template("templateMindMap", d.templateMindMap),
		templateTranslation: template("templateTranslation", d.templateTranslation),
		templateInsight: template("templateInsight", d.templateInsight),
		templateRollup: template("templateRollup", d.templateRollup),

		propSpace: flag("propSpace", d.propSpace),
		propFolder: flag("propFolder", d.propFolder),
		propSpeakers: flag("propSpeakers", d.propSpeakers),
		propTags: flag("propTags", d.propTags),
		propDuration: flag("propDuration", d.propDuration),
		propLanguage: flag("propLanguage", d.propLanguage),

		transcriptTimestamps: flag("transcriptTimestamps", d.transcriptTimestamps),
		sectionOrder: sanitizeSectionOrder(value.sectionOrder),
		actionItemDueDates: flag("actionItemDueDates", d.actionItemDueDates),
		actionItemStatus: flag("actionItemStatus", d.actionItemStatus),
		hideCompletedActionItems: flag("hideCompletedActionItems", d.hideCompletedActionItems),
		inlineTags: flag("inlineTags", d.inlineTags),

		intervalMinutes: clampInt(value.intervalMinutes, MIN_INTERVAL, MAX_INTERVAL, d.intervalMinutes),
		debugLogging: flag("debugLogging", d.debugLogging),
	};
}

/** Keeps known sections in the stored order, drops duplicates, and appends any missing ones. */
function sanitizeSectionOrder(raw: unknown): Section[] {
	const stored = Array.isArray(raw) ? raw.filter((s): s is Section => (SECTIONS as readonly unknown[]).includes(s)) : [];
	const order = [...new Set(stored)];
	for (const section of SECTIONS) if (!order.includes(section)) order.push(section);
	return order;
}

/** A vault-relative folder path: no leading or trailing slashes, no empty or dot segments. */
export function sanitizeBaseFolder(path: string): string {
	return path
		.split(/[\\/]+/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
		.join("/");
}

export function isValidTimeZone(zone: string): boolean {
	if (!zone) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
	return Math.min(max, Math.max(min, Math.round(raw)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
