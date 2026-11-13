import { apiVersion, Notice, Platform, Plugin } from "obsidian";

import { buildDiagnostics } from "./diagnostics";
import { Logger } from "./log";
import { deviceTimeZone } from "./paths/time";
import { PocketClient } from "./pocket/api";
import { FolderTree } from "./pocket/folders";
import { RateLimitBudget } from "./pocket/rateLimit";
import { obsidianRequester } from "./pocket/transport";
import { DeviceState } from "./runtime/deviceState";
import { Scheduler } from "./runtime/scheduler";
import { SingleFlight } from "./runtime/singleFlight";
import { noticeFor, statusText, statusTooltip } from "./runtime/statusBar";
import { folderChoices, folderLabel, PickModal, tagChoices, tagLabel, type PickerItem } from "./settings/pickers";
import { effectiveSettings, hasStructureDraft, pickStructure, sanitizeData, type PluginData, type Settings } from "./settings/schema";
import { PocketSettingTab, type FilterKey, type SettingsHost } from "./settings/tab";
import { buildIndexWhenReady } from "./sync/identityIndex";
import { emptyReport } from "./sync/report";
import { mergeOptions, messageOf, runSync, testConnection, type SyncOptions, type SyncOutcome } from "./sync/service";
import { evaluateSwitch } from "./sync/switchCount";
import { confirmSwitch } from "./ui/confirmSwitchModal";
import { DiagnosticsModal } from "./ui/diagnosticsModal";
import { ReportModal } from "./ui/reportModal";
import { ObsidianVaultOps } from "./vault/obsidianVaultOps";

const RESOLVED_TIMEOUT_MS = 10_000;

export default class PocketRecordingsPlugin extends Plugin implements SettingsHost {
	data!: PluginData;
	device!: DeviceState;
	private vaultOps!: ObsidianVaultOps;
	private flight!: SingleFlight<SyncOptions, SyncOutcome>;
	private scheduler!: Scheduler;
	private tab!: PocketSettingTab;
	private log!: Logger;
	private statusEl: HTMLElement | null = null;
	private unloaded = false;

	async onload(): Promise<void> {
		this.data = sanitizeData(await this.loadData());
		this.device = new DeviceState({ load: (key) => this.app.loadLocalStorage(key) as unknown, save: (key, value) => this.app.saveLocalStorage(key, value) }, Platform.isMobile);
		this.log = new Logger(() => this.data.settings.debugLogging);
		this.vaultOps = new ObsidianVaultOps(this.app);
		this.flight = new SingleFlight((options) => this.runOnce(options), mergeOptions);
		this.scheduler = new Scheduler({ setInterval: (fn, ms) => this.registerInterval(window.setInterval(fn, ms)), clearInterval: (id) => window.clearInterval(id) }, () => this.scheduledTick());

		this.tab = new PocketSettingTab(this.app, this);
		this.addSettingTab(this.tab);
		if (!Platform.isMobile) {
			this.statusEl = this.addStatusBarItem();
			this.statusEl.addClass("mod-clickable");
			this.registerDomEvent(this.statusEl, "click", () => this.openReport());
		}
		this.refreshStatus(false);

		this.addRibbonIcon("refresh-cw", "Sync Pocket recordings", () => void this.sync({ manual: true, resyncAll: false }));
		this.addCommand({ id: "sync-now", name: "Sync now", callback: () => void this.sync({ manual: true, resyncAll: false }) });
		this.addCommand({ id: "resync-all", name: "Re-sync everything", callback: () => this.resyncAll() });
		this.addCommand({ id: "test-connection", name: "Test connection", callback: () => void this.testConnection() });
		this.addCommand({ id: "toggle-auto-sync", name: "Toggle auto-sync on this device", callback: () => this.toggleAutoSync() });
		this.addCommand({ id: "show-report", name: "Show last sync report", callback: () => this.openReport() });
		// The id keeps its old name so hotkeys users already set for it still work.
		this.addCommand({ id: "copy-diagnostics", name: "Show diagnostics", callback: () => this.showDiagnostics() });

		// Sync waits for the workspace, so the metadata cache has started indexing.
		this.app.workspace.onLayoutReady(() => {
			if (!this.unloaded) this.scheduler.start(this.data.settings.intervalMinutes);
		});
	}

	onunload(): void {
		this.unloaded = true;
		this.scheduler.stop();
	}

	sync(options: SyncOptions): Promise<SyncOutcome> {
		return this.flight.request(options);
	}

	resyncAll(): void {
		void this.sync({ manual: true, resyncAll: true });
	}

	async persist(): Promise<void> {
		await this.saveData(this.data);
	}

	onSettingChanged(key: keyof Settings): void {
		if (key === "intervalMinutes") this.scheduler.reschedule(this.data.settings.intervalMinutes);
		this.refreshStatus(this.flight.running);
	}

	apiKey(): string | null {
		const id = this.data.settings.apiKeySecret;
		return id ? this.app.secretStorage.getSecret(id) : null;
	}

	async testConnection(): Promise<void> {
		const key = this.apiKey();
		if (!key) {
			new Notice("Add your Pocket API key in settings first.");
			return;
		}
		const result = await testConnection(key, obsidianRequester);
		new Notice(result.ok ? `Connected to Pocket. Found ${result.folders} spaces and folders.` : `Could not connect to Pocket: ${result.message}`);
	}

	toggleAutoSync(): void {
		const on = !this.device.autoSync;
		this.device.setAutoSync(on);
		if (on) this.device.resume();
		new Notice(on ? "Auto-sync is on for this device." : "Auto-sync is off for this device. Manual sync still works.");
		this.refreshStatus(this.flight.running);
	}

	openReport(): void {
		new ReportModal(this.app, this.device.lastReport).open();
	}

	showDiagnostics(): void {
		const key = this.apiKey();
		const text = buildDiagnostics({
			pluginVersion: this.manifest.version,
			appVersion: apiVersion,
			platform: Platform.isMobile ? "mobile" : "desktop",
			settings: this.data.settings,
			structureDraftPending: hasStructureDraft(this.data),
			device: { autoSync: this.device.autoSync, paused: this.device.paused, failures: this.device.failures, lastSync: this.device.lastSync },
			lastReport: this.device.lastReport,
			recentErrors: this.log.recentErrors(),
			secrets: key ? [key] : [],
		});
		new DiagnosticsModal(this.app, text).open();
	}

	/** Applies structure edits once the user confirms the count. */
	async applyStructure(): Promise<void> {
		if (!this.data.confirmedStructure) {
			// Nothing has synced yet, so there is nothing to move: the next sync confirms these settings.
			new Notice("Saved. The first sync uses these settings.");
			return;
		}
		if (!hasStructureDraft(this.data)) return;
		try {
			const index = await buildIndexWhenReady(this.vaultOps, () => this.waitForResolved());
			const cached = this.device.cachedFolders;
			const evaluation = evaluateSwitch(index, cached ? FolderTree.fromNodes(cached) : null, effectiveSettings(this.data), this.data.settings);
			if (evaluation.kind === "blocked") {
				new Notice(evaluation.message);
				return;
			}
			if (evaluation.affected > 0 && !(await confirmSwitch(this.app, evaluation.affected, evaluation.userMoved))) {
				await this.discardStructureDraft();
				return;
			}
			this.data.confirmedStructure = pickStructure(this.data.settings);
			await this.persist();
			this.tab.update();
			void this.sync({ manual: true, resyncAll: false });
		} catch (error) {
			this.log.error("Could not apply settings", error);
			new Notice(`Could not apply the changes: ${messageOf(error)}`);
		}
	}

	async discardStructureDraft(): Promise<void> {
		if (!this.data.confirmedStructure) return;
		this.data.settings = { ...this.data.settings, ...this.data.confirmedStructure };
		await this.persist();
		this.tab.update();
	}

	filterLabel(key: FilterKey, id: string): string {
		if (key === "includeFolderIds" || key === "excludeFolderIds") {
			const cached = this.device.cachedFolders;
			return folderLabel(id, cached ? FolderTree.fromNodes(cached) : null);
		}
		return tagLabel(id, this.device.cachedTags);
	}

	async addFilter(key: FilterKey): Promise<void> {
		const s = this.data.settings;
		const folders = key === "includeFolderIds" || key === "excludeFolderIds";
		// A folder or tag can sit in only one of its two lists.
		const taken = new Set(folders ? [...s.includeFolderIds, ...s.excludeFolderIds] : [...s.includeTagIds, ...s.excludeTagIds]);
		let items: PickerItem[] | null;
		if (folders) {
			const tree = await this.fetchOr(
				async (client) => {
					const fresh = await client.listFolders();
					this.device.setCachedFolders(fresh.toJSON());
					return fresh;
				},
				() => {
					const cached = this.device.cachedFolders;
					return cached ? FolderTree.fromNodes(cached) : null;
				},
			);
			items = tree ? folderChoices(tree, taken) : null;
		} else {
			const tags = await this.fetchOr(
				async (client) => {
					const fresh = await client.listTags();
					this.device.setCachedTags(fresh);
					return fresh;
				},
				() => this.device.cachedTags,
			);
			items = tags ? tagChoices(tags, taken) : null;
		}
		if (!items) return;
		const noun = folders ? "folder" : "tag";
		new PickModal(this.app, items, `Type to find a ${noun}`, `No other ${noun}s to add.`, (item) => {
			s[key] = [...s[key], item.id];
			void this.persist().then(() => this.tab.update());
		}).open();
	}

	async removeFilter(key: FilterKey, index: number): Promise<void> {
		const s = this.data.settings;
		s[key] = s[key].filter((_, i) => i !== index);
		await this.persist();
		this.tab.update();
	}

	/** Runs a one-off Pocket request for the pickers, falling back when it fails. */
	private async fetchOr<T>(fetch: (client: PocketClient) => Promise<T>, fallback: () => T | null): Promise<T | null> {
		const key = this.apiKey();
		if (key) {
			try {
				return await fetch(new PocketClient(key, { request: obsidianRequester, budget: new RateLimitBudget(60_000) }));
			} catch (error) {
				this.log.error("Could not read from Pocket", error);
			}
		}
		const fromCache = fallback();
		if (fromCache === null) new Notice(key ? "Could not reach Pocket. Try again in a moment." : "Add your Pocket API key in settings first.");
		return fromCache;
	}

	private scheduledTick(): void {
		if (this.device.autoSync && !this.device.paused) void this.sync({ manual: false, resyncAll: false });
	}

	/**
	 * The settings a run uses. The first run captures the device's time zone as the vault's
	 * and confirms the structure it syncs with, so later structure edits go through Apply.
	 */
	private async prepareSettings(): Promise<Settings> {
		let changed = false;
		if (!this.data.settings.timeZone) {
			this.data.settings.timeZone = deviceTimeZone();
			changed = true;
		}
		if (!this.data.confirmedStructure) {
			this.data.confirmedStructure = pickStructure(this.data.settings);
			changed = true;
		} else if (!this.data.confirmedStructure.timeZone) {
			this.data.confirmedStructure.timeZone = this.data.settings.timeZone;
			changed = true;
		}
		if (changed) await this.persist();
		return effectiveSettings(this.data);
	}

	private waitForResolved(): Promise<void> {
		return new Promise((resolve) => {
			const cache = this.app.metadataCache;
			const done = (): void => {
				cache.offref(ref);
				window.clearTimeout(timer);
				resolve();
			};
			const ref = cache.on("resolved", done);
			const timer = window.setTimeout(done, RESOLVED_TIMEOUT_MS);
		});
	}

	private refreshStatus(running: boolean): void {
		if (!this.statusEl) return;
		const state = { running, paused: this.device.paused, autoSync: this.device.autoSync, last: this.device.lastSync };
		this.statusEl.setText(statusText(state));
		this.statusEl.setAttribute("aria-label", statusTooltip(state));
	}

	private async runOnce(options: SyncOptions): Promise<SyncOutcome> {
		this.refreshStatus(true);
		let outcome: SyncOutcome;
		try {
			outcome = await runSync(
				{
					vault: this.vaultOps,
					request: obsidianRequester,
					apiKey: () => this.apiKey(),
					prepareSettings: () => this.prepareSettings(),
					waitForResolved: () => this.waitForResolved(),
					now: () => Date.now(),
					isMobile: Platform.isMobile,
					cancelled: () => this.unloaded,
					log: (message, details) => this.log.debug(message, details),
					onFolders: (tree) => this.device.setCachedFolders(tree.toJSON()),
				},
				options,
			);
		} catch (error) {
			this.log.error("Sync failed", error);
			outcome = { status: "aborted", report: emptyReport(), message: messageOf(error) };
		}
		if (this.unloaded) return outcome;

		for (const error of outcome.report.errors) this.log.remember(error.message);
		if (outcome.message) this.log.remember(outcome.message);
		const report = outcome.status === "ok" ? outcome.report : { ...outcome.report, errors: [...outcome.report.errors, { message: outcome.message ?? "Sync stopped." }] };
		const { pausedNow } = this.device.recordOutcome(outcome.status, options.manual);
		if (outcome.status !== "cancelled") {
			this.device.setLastSync({ at: Date.now(), status: outcome.status, message: outcome.message });
			this.device.setLastReport(report);
		}
		this.refreshStatus(false);
		const notice = noticeFor(outcome, options.manual, pausedNow);
		if (notice) new Notice(notice);
		return outcome;
	}
}
