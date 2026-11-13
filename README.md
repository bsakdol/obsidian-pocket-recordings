# Pocket Recordings _(pocket-recordings)_

Sync Pocket recordings into conversation and insight notes, with transcripts, summaries, action items, and mind maps.

Pocket Recordings is an Obsidian plugin that brings what [Pocket](https://heypocket.com) records (transcripts, summaries, action items, mind maps, and translations) into your vault as Markdown you own. You choose what syncs, how far back, how files are laid out and named, and where they go. One fixed set of rules then handles your edits, moves, deletions, and re-imports, on desktop and mobile.

Each note carries its own identity in its properties, so the vault itself is the record of which note belongs to which recording. There is no hidden map to drift between devices, and deleting the plugin's settings file loses nothing.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Settings](#settings)
- [How sync works](#how-sync-works)
- [Properties](#properties)
- [Network use and privacy](#network-use-and-privacy)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Install

Pocket Recordings needs Obsidian 1.13.2 or later, on desktop or mobile, and a Pocket account with an API key.

### From Obsidian

1. Open **Settings → Community plugins**. If restricted mode is on, choose **Turn on community plugins**.
2. Choose **Browse**, search for **Pocket Recordings**, and choose **Install**.
3. Choose **Enable**.

Or open [obsidian://show-plugin?id=pocket-recordings](obsidian://show-plugin?id=pocket-recordings) to go straight to the plugin's page in Obsidian. Obsidian checks for updates under **Settings → Community plugins → Check for updates**.

### Manually

Download `main.js` and `manifest.json` from the [latest release](https://github.com/bsakdol/obsidian-pocket-recordings/releases/latest) and place them in your vault's plugin folder, then enable **Pocket Recordings** under **Settings → Community plugins**. A manual install does not update itself; repeat these steps for each new release. [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

```sh
mkdir -p "<your vault>/.obsidian/plugins/pocket-recordings"
cp main.js manifest.json "<your vault>/.obsidian/plugins/pocket-recordings/"
```

## Usage

1. Create an API key in the Pocket app under **Settings → API keys**.
2. In **Settings → Pocket Recordings**, enter the key under **API key** and choose **Test connection**.
3. Optionally choose what syncs (horizon, folder and tag filters) and how notes are organized.
4. Run **Sync now** from the ribbon icon or the command palette.

With the default settings, a recording in Pocket's `Work/Clients` folder lands like this:

```text
Pocket/
├── Conversations/
│   └── Work/
│       └── Clients/
│           └── 2026-11-10/
│               └── 2026-11-10 Acme kickoff/
│                   ├── Acme kickoff.md
│                   └── Acme kickoff - Transcript.md
└── Insights/
    └── 2026-11-10/
        └── 2026-11-10 Big idea.md
```

Commands (none has a default hotkey):

| Command | What it does |
|---|---|
| Sync now | Syncs once. Also on the ribbon. |
| Re-sync everything | Refetches every recording in scope and rewrites the plugin's part of each note. |
| Test connection | Checks that Pocket accepts the API key. |
| Toggle auto-sync on this device | Turns scheduled sync on or off for this device only. |
| Show last sync report | Opens what the last sync did, with links to the notes. |
| Show diagnostics | Shows a report for bug reports, without your API key, in a window you can copy from. |

On desktop, the status bar shows when the last sync ran, whether one is running, and any error. Click it to open the report.

## Settings

### Connection

- **API key**: kept in Obsidian's secret storage, never in the plugin's settings file (`data.json`). The settings file stores only the name of the secret.
- **Test connection**: reads your Pocket folders to confirm the key works.

### What syncs

- **Recordings from**: all history (default), the last N days, or since a date. A recording that ages out of a rolling window is left exactly as it is.
- **Include only these folders** and **Exclude these folders**: add a folder with the **+** button, which opens a search: type part of its name and press Enter. Including a folder covers its subfolders, and exclusions win. **Unfiled** can be picked like a folder. Highlights ignore folder filters. With nothing included, every folder syncs.
- **Include only these tags** and **Exclude these tags**: the same, for Pocket tags. A recording syncs when it has any included tag and no excluded one.

Filters are stored by Pocket id, so renaming a folder or tag in Pocket does not break them. A recording only syncs once Pocket has finished processing it; if summarization failed, it syncs with whatever Pocket has.

### Organization

These settings decide where notes go and what they are called. Edits are held as pending changes until you choose **Apply changes**, which counts the recordings affected, asks once, and then syncs. **Discard changes** restores the applied values.

- **Base folder**: where everything goes (default `Pocket`).
- **Organize by**: Pocket folders (default), as `<base>/Conversations/<space>/<folders>/<date>/<recording>`, or date, as `<base>/Conversations/<date>/<recording>`.
- **Date folders**: `YYYY-MM-DD` (default), `YYYY-MM`, or nested `YYYY/MM/DD`.
- **Files per recording**: a main note plus a transcript note (default), one file per output, or one note.
- **Time zone**: the zone every device uses for date folders and names, so they always agree. The first sync fills in this device's zone.
- **Outputs**: summary, action items, mind maps, transcript, and translation, each on or off.
- **Insights tag**: recordings with this Pocket tag (default `highlights`) sync as insights under `<base>/Insights`.
- **Insight notes**: one note per highlight (default), or one note per day that collects that day's highlights.
- **Name templates**: one per folder and note type, built from `{{date}}`, `{{time}}`, `{{title}}`, `{{id}}`, `{{short_id}}`, `{{year}}`, `{{month}}`, `{{day}}`, `{{hour}}`, and `{{minute}}`. Names are always made safe for every platform: a character that file names or links can't contain (`\ / : * ? " < > | # [ ] ^`) becomes a dash between two characters, so `1:1` becomes `1-1`, and is dropped next to a space or at either end, so `Acme: Q4` becomes `Acme Q4`.

### Rendering

These change what notes show and apply on the next sync without asking.

- **Transcript timestamps**, **Action item due dates**, **Action item status**, **Hide completed action items**, and **Inline Pocket tags** (shown as `#pocket/…` in the note body).
- **Section order**: drag to reorder the sections of a main or single note.
- **Properties**: which metadata properties to write: space, folder, speakers, tags, duration, and language.

### Running

- **Auto-sync on this device**: on by default on desktop, off on mobile. Stored on this device only, so each device decides for itself. Manual sync works everywhere.
- **Sync interval**: minutes between automatic syncs, 5–1440 (default 60). Auto-sync also runs once when Obsidian starts.
- **Last sync report** and **Re-sync everything**: as the commands above.

### Advanced

- **Debug logging**: writes sync detail to the developer console.
- **Show diagnostics**: as the command above.

## How sync works

**The plugin owns one region of each note.** Everything it writes sits between `%% pocket-recordings:begin %%` and `%% pocket-recordings:end %%`, which Obsidian hides in reading view, plus its own `pocket_*` properties. Anything you write above or below the region, and any property of your own, is never touched. The plugin never writes Obsidian's `tags` property.

**Damaged markers are left alone.** If a note's markers are missing, duplicated, or out of order, the plugin skips that note and reports a conflict. Restore the markers to resume updates.

**Ticks survive.** Each action item ends with a block id taken from Pocket's item id. An item is checked when Pocket marks it complete or you ticked it in Obsidian, even after Pocket regenerates the summary.

**Notes change only when something changed.** Each sync lists your recordings, but fetches and rewrites only new or changed ones. An unchanged recording's notes are not written at all.

**Moves follow Pocket, but respect yours.** When a recording moves to another Pocket folder, is renamed, or you apply new organization settings, the plugin moves its notes, but only while they are still where it put them. Notes you moved stay where you put them, keep updating, and are listed in the report. Emptied recording folders are removed; a folder holding a file of yours is kept.

**Missing notes come back.** If you delete a recording's notes and the recording is still in Pocket and in scope, the next sync re-imports them.

**Nothing is deleted.** Notes are marked with `pocket_status` instead:

- `deleted`: the recording is no longer in Pocket.
- `excluded`: a filter now excludes it.
- `superseded`: your layout or outputs no longer use that file.

Marked notes stay in place and stop updating. Every mark clears by itself if the reason goes away.

**Freeze a note** by adding the property `pocket_freeze: true`. A frozen note is never updated, moved, or marked.

**Duplicates are reported, never merged.** If two notes claim the same recording and role (for example after a file-sync conflict), that recording is left alone and listed in the report until you remove one.

**The base folder is protected.** Before the first sync into a base folder, the plugin checks for notes it did not create. If it finds some, it stops without writing anything and asks you to choose another folder or rename the existing one. The plugin does not import notes made by other tools.

**Several devices can share a vault.** Every device computes the same paths, so two devices that sync the same new recording write the same notes instead of copies. Leaving auto-sync on for one device and syncing others by hand keeps concurrent writers to a minimum.

**Interrupted syncs finish themselves.** Every step is safe to repeat, so the next sync completes whatever an interrupted one left undone.

## Properties

The plugin writes only these properties, all prefixed `pocket_`.

| Property | On | Meaning |
|---|---|---|
| `pocket_id` | conversation and insight notes | The Pocket recording id. |
| `pocket_role` | every note | `main`, `transcript`, `summary`, `action-items`, `mind-map`, `translation`, `single`, `insight`, or `rollup`. |
| `pocket_kind` | every note | `conversation` or `insight`. |
| `pocket_title` | conversation and insight notes | The recording's title in Pocket. |
| `pocket_recorded_at` | conversation and insight notes | When the recording was made. |
| `pocket_folder_id` | conversation and insight notes | The recording's Pocket folder id, or empty when unfiled. |
| `pocket_rollup_date` | daily highlight notes | The day the note collects. |
| `pocket_members` | daily highlight notes | The highlights it was built from. |
| `pocket_placed_path` | every note | Where the plugin last placed the note; used to tell its moves from yours. |
| `pocket_updated_at` | every note | Pocket's last-updated time when the note was written. |
| `pocket_render` | every note | A fingerprint of the rendering settings used. |
| `pocket_status` | marked notes | `deleted`, `excluded`, or `superseded`. |
| `pocket_freeze` | set by you | `true` stops all updates to the note. |
| `pocket_space` | when selected | The Pocket space. |
| `pocket_folder` | when selected | The folder path within the space. |
| `pocket_speakers` | when selected | Speaker names. |
| `pocket_tags` | when selected | Pocket tag names. |
| `pocket_duration` | when selected | Length in minutes. |
| `pocket_language` | when selected | The recording's language. |

Older notes from other Pocket plugins use different property names. The plugin does not recognize them as its own, so it never changes them.

## Network use and privacy

The plugin sends requests only to Pocket's public API at `https://public.heypocketai.com/api/v1`, authenticated with your API key, to read your recordings, folders, and tags. It never writes to Pocket, sends no telemetry, and contacts no other service. The plugin never reads or writes your clipboard. **Show diagnostics** shows a report with your API key removed, and you copy it yourself if you choose to. Error messages in the report can include note and folder names, so read it before you share it.

To find its own notes wherever you have moved them, the plugin looks through the properties of every note in your vault for `pocket_id`. It reads no note text outside the notes it created.

## Development

You need [Node.js](https://nodejs.org) 22.9 or later, and Obsidian on a desktop computer.

### Set up

```sh
git clone https://github.com/bsakdol/obsidian-pocket-recordings.git
cd obsidian-pocket-recordings
npm install
```

### Check a change

Run these three before every commit. The release workflow runs the same checks and stops on any failure.

```sh
npm test        # type-checks, then runs every test (a few seconds)
npm run lint    # the rules Obsidian's community review applies
npm run build   # type-checks and writes main.js
```

The tests never contact Pocket and never touch a real vault. They use recorded Pocket responses from `tests/fixtures/pocket/` and an in-memory vault, so they are safe to run any time.

### Try a change in Obsidian

Use a throwaway vault, never your real one: the plugin creates, moves, and marks notes.

1. In Obsidian, create a new empty vault to test in. A vault in iCloud (or synced by Obsidian Sync) also lets you test on your phone. In that vault, open **Settings → Community plugins** and turn community plugins on.
2. Tell the dev build where the test vault is. Create a file named `.env` in this repository (git ignores it) with the vault's full path:

   ```sh
   OBSIDIAN_VAULT="/path/to/your/test vault"
   ```

3. Start the watcher, and leave it running. Each time you save a source file it rebuilds `main.js` and copies the plugin into the test vault's `.obsidian/plugins/pocket-recordings/` folder.

   ```sh
   npm run dev
   ```

4. In the test vault, enable **Pocket Recordings** under **Settings → Community plugins**, enter your API key, and run **Sync now**.
5. After each change, reload the plugin so Obsidian picks up the new build: turn it off and on again under **Settings → Community plugins**, or run **Reload app without saving** from the command palette.

To see what a sync is doing, turn on **Debug logging** (in the plugin's settings, under Advanced) and open the developer console with Cmd+Option+I on macOS or Ctrl+Shift+I on Windows and Linux. **Show last sync report** lists every note the last sync touched.

To try a change on your phone, open the same synced test vault there once the copied files have synced, and reload Obsidian. Auto-sync is off on mobile by default, so use **Sync now**.

### Add a test

Any file named `tests/*.test.ts` is picked up automatically. Tests use Node's built-in `node:test` and `assert`, with no test framework to learn. Most sync behavior is tested by running a whole sync against the in-memory vault, using two helpers from `tests/support/harness.ts`: `syncCycle` runs one sync, and `assertConverged` checks that a second sync would change nothing. `tests/planner.test.ts` has a test for each sync rule and is the best file to copy a pattern from.

### Refresh the recorded Pocket responses

The fixtures in `tests/fixtures/pocket/` stand in for real Pocket responses: captured from an account with all text scrubbed, or synthetic until a capture has been made (their README says which). To capture fresh ones from your account:

```sh
POCKET_API_KEY=pk_... node scripts/probe-pocket.mjs
node scripts/sanitize-fixtures.mjs --keep highlights
```

The probe writes raw responses, including your recordings' text, to `.probe/`, which git ignores. The sanitizer writes scrubbed copies to `tests/fixtures/pocket/`. Read them before committing. `tests/fixtures/pocket/README.md` explains the full procedure and what the probe checks.

## Contributing

To report a bug or propose a change, [open an issue](https://github.com/bsakdol/obsidian-pocket-recordings/issues/new/choose). When reporting a sync problem, include the output of **Show diagnostics**. Pull requests are welcome once the change has been discussed and agreed in an issue. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to make a change, and [SECURITY.md](SECURITY.md) how to report a vulnerability privately.

## License

[0BSD](LICENSE) © Bradley Sakdol
