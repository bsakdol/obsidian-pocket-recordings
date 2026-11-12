# Pocket API fixtures

> **Status: provisional.** These fixtures are synthetic. They follow the shapes in Pocket's published API reference plus what the earlier `obsidian-pocket` plugin observed in live payloads. They will be replaced by sanitized captures from `scripts/probe-pocket.mjs` once the probe has run against a real account. Every finding below marked **provisional** is an assumption the code is built on until then.

## How to refresh

1. `POCKET_API_KEY=pk_... node scripts/probe-pocket.mjs` writes raw responses and `findings.json` to the gitignored `.probe/`.
2. Regenerate the summary of one captured recording in the Pocket app, then run `POCKET_API_KEY=pk_... node scripts/probe-pocket.mjs --compare`.
3. `node scripts/sanitize-fixtures.mjs --keep highlights` writes sanitized copies here. Review them before committing.
4. Update the findings below from `.probe/findings.json` and `.probe/compare-findings.json`.

## Files

- `listing.json`: one listing page covering a nested folder, a space-root recording, an unfiled recording, a highlight, an unfinished recording, and a failed one.
- `folders.json`: two spaces, a two-level folder chain, and a sibling folder.
- `tags.json`: the `highlights` tag and one other.
- `detail-*.json`: recording details for the listing's ids.

## Findings

### Documented by Pocket (API reference, read 2026-11-11)

- Endpoints: `GET /public/recordings`, `GET /public/recordings/{id}`, `GET /public/folders`, `GET /public/tags`, under `https://public.heypocketai.com/api/v1`, with `Authorization: Bearer pk_...`.
- Listing filters: `start_date` and `end_date` as `YYYY-MM-DD` in UTC, `tag_ids`, `page`, and `limit` (at most 100).
- Detail query: `include_transcript`, `include_summarizations`, `summarization_id`.
- Transcript segments carry `start`, `end`, `speaker`, `speakerName`, `text`, and `originalText`.
- Recordings carry `speakers` (a map of `{ name, speakerId }`), `translation` (status metadata only), `summarizations_errors`, `transcript_error`, and `translation_error`.

### Observed by the earlier plugin (one live account, 2026-11-10)

- Listing and detail top-level fields: `id, title, recording_at, created_at, updated_at, duration, state, language, tags, folder_id`.
- `folder_id` is present on every listed recording: a string or `null` (unfiled).
- Folder kinds seen: `space` and `folder`. Every top-level node was a space.
- `X-RateLimit-Reset` is in epoch seconds. `X-RateLimit-Remaining` is present.
- Summarizations are keyed by id. Each has `processingStatus` and a `v2` object with `summary` (`title`, `emoji`, `markdown`), `actionItems` (either `actionItems[]` with `id`, `title`, `isCompleted`, `dueDate`, `status`, or `actions[]` with `id`, `label`), and `mindMap`.

### Open questions (provisional answers)

- **Finished states** — provisional: `processing`, `pending`, `queued`, `uploading`, `transcribing`, and `summarizing` mean unfinished. Every other state counts as finished, including `completed` and `failed`, so a new final state Pocket adds is never held forever.
- **Failed summarization** — provisional: `summarizations` is `null` or empty and `summarizations_errors` is non-empty. The recording imports with its transcript.
- **`speakerName`** — documented. It may be absent or empty, in which case the raw `speaker` label is used.
- **Folder kinds** — `space` and `folder`. A `folder_id` naming a space files the recording at the space root.
- **Action-item id format** — provisional: an opaque string. Block ids are sanitized to `[A-Za-z0-9-]` with a hash suffix whenever characters had to be replaced.
- **Mind-map shape and variants** — provisional: `mindMap` is a node `{ title, children }` (one variant), an array of nodes, or an object whose values are nodes (one variant per key).
- **Translation** — provisional: Pocket reports translation status in `translation`. When it is `completed`, segment `text` is the translated text and `originalText` is the source. The transcript renders `originalText`, and the translation output renders `text`.

### Stop conditions (plan Goal Capsule)

- **Action-item ids stable across summary regeneration** — **OPEN**, awaiting `--compare`.
- **Listing `updated_at` moves when a summary is regenerated** — **OPEN**, awaiting `--compare`.
- **Listing date filters apply to `recording_at`** — **OPEN**, awaiting the capture run's `dateFilter` finding. The plugin already requests a two-day margin and filters by `recording_at` locally, so it is safe either way, provided the filter is not on `updated_at`.
