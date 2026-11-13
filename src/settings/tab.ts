import { PluginSettingTab, type App, type Plugin, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";

import type { DeviceState } from "../runtime/deviceState";
import { hasStructureDraft, SECTIONS, type PluginData, type Section, type Settings } from "./schema";
import { validateBaseFolder, validateDate, validateHorizonDays, validateInterval, validateTag, validateTemplate, validateTimeZone } from "./validate";

export const POCKET_API_KEYS_URL = "https://app.heypocket.com/app/settings/api-keys";
const DEVICE_AUTO_SYNC = "device:autoSync";

export type FilterKey = "includeFolderIds" | "excludeFolderIds" | "includeTagIds" | "excludeTagIds";

/** What the settings tab needs from the plugin. */
export interface SettingsHost {
	data: PluginData;
	device: DeviceState;
	persist(): Promise<void>;
	onSettingChanged(key: keyof Settings): void;
	testConnection(): Promise<void>;
	applyStructure(): Promise<void>;
	discardStructureDraft(): Promise<void>;
	/** Opens a search to add one folder or tag to a filter list. */
	addFilter(key: FilterKey): Promise<void>;
	removeFilter(key: FilterKey, index: number): Promise<void>;
	filterLabel(key: FilterKey, id: string): string;
	resyncAll(): void;
	openReport(): void;
	showDiagnostics(): void;
}

const SECTION_NAMES: Record<Section, string> = {
	summary: "Summary",
	"action-items": "Action items",
	"mind-map": "Mind map",
	transcript: "Transcript",
	translation: "Translation",
};

/** Declarative settings: validated on commit, never re-rendered per keystroke. */
export class PocketSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: Plugin & SettingsHost,
	) {
		super(app, host);
	}

	private get settings(): Settings {
		return this.host.data.settings;
	}

	getControlValue(key: string): unknown {
		if (key === DEVICE_AUTO_SYNC) return this.host.device.autoSync;
		return this.settings[key as keyof Settings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === DEVICE_AUTO_SYNC) {
			this.host.device.setAutoSync(value === true);
			this.host.onSettingChanged("intervalMinutes");
			return;
		}
		(this.settings as unknown as Record<string, unknown>)[key] = typeof value === "string" && key !== "apiKeySecret" ? value.trim() : value;
		await this.host.persist();
		this.host.onSettingChanged(key as keyof Settings);
		// Refreshes visibility and the Organization page's pending-changes marker, without a re-render.
		this.update();
		this.refreshDomState();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = (): Settings => this.settings;
		const toggle = (key: keyof Settings, name: string, desc?: string): SettingGroupItem => ({ name, desc, control: { type: "toggle", key } });
		const template = (key: keyof Settings, name: string): SettingGroupItem => ({ name, control: { type: "text", key, validate: validateTemplate } });
		const pending = (): boolean => hasStructureDraft(this.host.data);

		return [
			{
				type: "group",
				heading: "Connection",
				items: [
					{
						name: "API key",
						desc: `Kept in Obsidian's secret storage, never in this plugin's settings file. Create a key in the Pocket app: ${POCKET_API_KEYS_URL}`,
						control: { type: "secret", key: "apiKeySecret" },
					},
					{ name: "Test connection", desc: "Check that Pocket accepts the key.", action: () => void this.host.testConnection() },
				],
			},
			{
				type: "page",
				name: "What syncs",
				desc: "How far back, and which folders and tags.",
				items: [
					{
						type: "group",
						heading: "Sync horizon",
						items: [
							{
								name: "Recordings from",
								control: { type: "dropdown", key: "horizon", options: { all: "All history", days: "The last N days", since: "Since a date" } },
							},
							{ name: "Days", visible: () => s().horizon === "days", control: { type: "number", key: "horizonDays", min: 1, step: 1, validate: validateHorizonDays } },
							{ name: "Since", desc: "A date as YYYY-MM-DD.", visible: () => s().horizon === "since", control: { type: "text", key: "horizonSince", placeholder: "2026-01-01", validate: validateDate } },
						],
					},
					this.filterList("includeFolderIds", "Include only these folders", "Every folder syncs.", "Add a folder to include", "Including a folder covers its subfolders. Highlights ignore folder filters."),
					this.filterList("excludeFolderIds", "Exclude these folders", "No folder is excluded.", "Add a folder to exclude", "Excluding a folder covers its subfolders, and wins over an include."),
					this.filterList("includeTagIds", "Include only these tags", "Recordings sync whatever their tags.", "Add a tag to include", "A recording syncs when it has any of these tags."),
					this.filterList("excludeTagIds", "Exclude these tags", "No tag is excluded.", "Add a tag to exclude", "A recording with any of these tags does not sync."),
				],
			},
			{
				type: "page",
				name: "Organization",
				desc: "Where notes go and what they are called. Changes apply only when you choose Apply.",
				status: () => (pending() ? "warning" : null),
				displayValue: () => (pending() ? "Changes not applied" : ""),
				items: [
					{
						type: "group",
						heading: "Pending changes",
						items: [
							{
								name: "Apply changes",
								desc: "Counts the recordings affected, asks once, then syncs. Nothing is deleted.",
								disabled: () => !pending(),
								action: () => void this.host.applyStructure(),
							},
							{ name: "Discard changes", disabled: () => !pending(), action: () => void this.host.discardStructureDraft() },
						],
					},
					{
						type: "group",
						heading: "Layout",
						items: [
							{ name: "Base folder", control: { type: "folder", key: "baseFolder", validate: validateBaseFolder } },
							{ name: "Organize by", control: { type: "dropdown", key: "scheme", options: { "pocket-folders": "Pocket folders", date: "Date" } } },
							{ name: "Date folders", control: { type: "dropdown", key: "granularity", options: { "YYYY-MM-DD": "YYYY-MM-DD", "YYYY-MM": "YYYY-MM", "YYYY/MM/DD": "YYYY/MM/DD (nested)" } } },
							{
								name: "Files per recording",
								control: { type: "dropdown", key: "layout", options: { "main-transcript": "Main note and transcript", "per-output": "One file per output", single: "One note" } },
							},
							{ name: "Time zone", desc: "All devices date folders and names in this zone.", control: { type: "text", key: "timeZone", placeholder: "America/Chicago", validate: validateTimeZone } },
						],
					},
					{
						type: "group",
						heading: "Outputs",
						items: [
							toggle("outputSummary", "Summary"),
							toggle("outputActionItems", "Action items"),
							toggle("outputMindMaps", "Mind maps"),
							toggle("outputTranscript", "Transcript"),
							toggle("outputTranslation", "Translation"),
						],
					},
					{
						type: "group",
						heading: "Insights",
						items: [
							{ name: "Insights tag", desc: "Recordings with this Pocket tag sync as insights.", control: { type: "text", key: "insightsTag", validate: validateTag } },
							{ name: "Insight notes", control: { type: "dropdown", key: "insightShape", options: { "per-recording": "One note per highlight", rollup: "One note per day" } } },
						],
					},
					{
						type: "page",
						name: "Name templates",
						desc: "Tokens: {{date}}, {{time}}, {{title}}, {{id}}, {{short_id}}, {{year}}, {{month}}, {{day}}, {{hour}}, {{minute}}.",
						items: [
							{
								type: "group",
								items: [
									template("templateFolder", "Recording folder"),
									template("templateMain", "Main note"),
									template("templateSingle", "Single note"),
									template("templateTranscript", "Transcript"),
									template("templateSummary", "Summary"),
									template("templateActionItems", "Action items"),
									template("templateMindMap", "Mind map"),
									template("templateTranslation", "Translation"),
									template("templateInsight", "Insight"),
									template("templateRollup", "Daily highlights"),
								],
							},
						],
					},
				],
			},
			{
				type: "page",
				name: "Rendering",
				desc: "What notes show. Changes refresh notes on the next sync.",
				items: [
					{
						type: "group",
						heading: "Content",
						items: [
							toggle("transcriptTimestamps", "Transcript timestamps"),
							toggle("actionItemDueDates", "Action item due dates"),
							toggle("actionItemStatus", "Action item status"),
							toggle("hideCompletedActionItems", "Hide completed action items"),
							toggle("inlineTags", "Inline Pocket tags", "Shows Pocket tags as #pocket/… tags in the note body."),
						],
					},
					{
						type: "list",
						heading: "Section order",
						items: this.settings.sectionOrder.map((section) => ({ name: SECTION_NAMES[section] })),
						onReorder: (from, to) => void this.reorderSections(from, to),
					},
					{
						type: "group",
						heading: "Properties",
						items: [
							toggle("propSpace", "Space"),
							toggle("propFolder", "Folder"),
							toggle("propSpeakers", "Speakers"),
							toggle("propTags", "Tags", "Written as pocket_tags, never as Obsidian tags."),
							toggle("propDuration", "Duration"),
							toggle("propLanguage", "Language"),
						],
					},
				],
			},
			{
				type: "group",
				heading: "Running",
				items: [
					{ name: "Auto-sync on this device", desc: "Stored on this device only.", control: { type: "toggle", key: DEVICE_AUTO_SYNC } },
					{ name: "Sync interval", desc: "Minutes between automatic syncs, 5–1440.", control: { type: "number", key: "intervalMinutes", min: 5, max: 1440, step: 1, validate: validateInterval } },
					{ name: "Last sync report", action: () => this.host.openReport() },
					{ name: "Re-sync everything", desc: "Refetches every recording in scope and rewrites the plugin's regions.", action: () => this.host.resyncAll() },
				],
			},
			{
				type: "group",
				heading: "Advanced",
				items: [
					toggle("debugLogging", "Debug logging", "Writes sync detail to the developer console."),
					{ name: "Show diagnostics", desc: "Shows a report without your API key, for bug reports.", action: () => this.host.showDiagnostics() },
				],
			},
		];
	}

	/** One filter as a short list of what is picked, with a search to add and a button to remove. */
	private filterList(key: FilterKey, heading: string, emptyState: string, addName: string, help: string): SettingDefinitionItem {
		return {
			type: "list",
			heading,
			emptyState: `${emptyState} ${help}`,
			items: this.settings[key].map((id) => ({ name: this.host.filterLabel(key, id) })),
			addItem: { name: addName, action: () => void this.host.addFilter(key) },
			onDelete: (index) => void this.host.removeFilter(key, index),
		};
	}

	private async reorderSections(from: number, to: number): Promise<void> {
		const order = [...this.settings.sectionOrder];
		const [moved] = order.splice(from, 1);
		if (!moved) return;
		order.splice(to, 0, moved);
		this.settings.sectionOrder = order.filter((section): section is Section => (SECTIONS as readonly string[]).includes(section));
		await this.host.persist();
		this.host.onSettingChanged("sectionOrder");
		this.update();
	}
}
