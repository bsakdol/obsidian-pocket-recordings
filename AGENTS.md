# AGENTS.md

Obsidian plugin (TypeScript, bundled with esbuild) that syncs Pocket recordings into vault notes. `README.md` covers user-facing behavior; read its "How sync works" section before changing anything under `src/sync/`.

## Commands

- `npm install` — needs Node 22.9 or later.
- `npm test` — type-checks `src` and `tests`, then runs every `tests/*.test.ts` with `node:test`. Never touches the network or a real vault.
- `npm run lint` — the rules Obsidian's community review applies, including sentence case for UI text. In November 2026 the review flagged code that passed lint under typescript-eslint 8.46.0 and failed under 8.72.2, so keep the exact pin in `package.json` current; when the review flags something lint misses, bump typescript-eslint first to reproduce it.
- `npm run build` — type-checks and writes `main.js`.

A change is done only when all three pass. The release workflow runs the same checks and stops on any failure. Don't run `npm run dev` unless asked: it copies every build into the vault named in `.env`.

## Architecture

- `src/sync/` is the engine: `planner.ts` decides what to do, `executor.ts` does it. The engine reaches the vault only through the `VaultOps` interface in `src/vault/vaultOps.ts`.
- Only `src/main.ts`, `src/vault/obsidianVaultOps.ts`, `src/pocket/transport.ts`, `src/settings/`, and `src/ui/` import `obsidian`. Keep it that way so the engine runs in tests against `tests/support/memoryVaultOps.ts`.
- `src/pocket/` is the API client: raw response shapes in `raw.ts`, mapped to the app model in `mappers.ts`.
- `src/paths/` and `src/render/` are pure functions.

## Rules that protect user data

- The plugin writes only between `%% pocket-recordings:begin %%` and `%% pocket-recordings:end %%`, and only `pocket_*` properties. Never write Obsidian's `tags` property or anything outside the region.
- Never delete a note. Mark it with `pocket_status` instead.
- Every sync step must be safe to repeat: a second sync right after a first changes nothing.
- Paths must be identical on every device for the same recording and settings. Never use a device-local value such as the system time zone.
- Network calls go only to `https://public.heypocketai.com/api/v1`, read-only, through `requestUrl` in `src/pocket/transport.ts`. No new hosts, no telemetry.
- The API key lives in Obsidian's secret storage. Never put it in `data.json`, logs, or diagnostics.

## Tests

- Test new sync behavior by running a whole sync: `syncCycle` and `assertConverged` from `tests/support/harness.ts`. Copy the pattern from `tests/planner.test.ts`.
- Fixtures in `tests/fixtures/pocket/` are scrubbed. Never commit anything from `.probe/` or real recording text. Don't run `scripts/probe-pocket.mjs`: it needs a real API key and reads real recordings.

## Conventions

- Tabs, strict TypeScript with `noUncheckedIndexedAccess`. Match the comment density of the file you're editing.
- Code comments explain the reason in plain words. Don't cite plan labels such as `KTD12` or `R8`.
- Commit messages follow Conventional Commits 1.0.0, with scopes named after `src/` folders: `feat(sync): …`, `fix(paths): …`.
- A change users would notice gets an entry under `## [Unreleased]` in `CHANGELOG.md`, in the same commit. The changelog follows Keep a Changelog 1.1.0: file each entry under Added, Changed, Deprecated, Removed, Fixed, or Security, and write it for users, not developers.
- Never commit `main.js`, `data.json`, or `.env`.

## Releases

Obsidian installs a plugin by reading `version` from `manifest.json` on the default branch, then downloading the GitHub release whose tag is exactly that version. A release that breaks this rule fails for every user, so follow these steps in order:

1. Start on `main` with a clean tree and all three checks passing.
2. If the release needs a newer Obsidian API, raise `minAppVersion` in `manifest.json` first.
3. Run `npm version patch --no-git-tag-version` (or `minor`, `major`). This updates `package.json`, `manifest.json`, and `versions.json` together. The flag matters: without it npm makes a tag with a `v` prefix, and Obsidian rejects that.
4. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a new, empty `## [Unreleased]` above it.
5. Commit every file the bump changed, plus `CHANGELOG.md`, as `chore: release X.Y.Z`.
6. Tag with the bare version, no prefix: `git tag -a X.Y.Z -m "X.Y.Z"`.
7. Push the tag first: `git push origin X.Y.Z`. Wait for the release workflow to pass, and confirm the release has `main.js` and `manifest.json` attached. The workflow writes notes from pull request titles; replace them with the version's section from `CHANGELOG.md`.
8. Then push `main`. If you push `main` first, Obsidian reports an update that has no release to download.

Never move, delete, or reuse a published tag. To fix a bad release, ship the next patch version.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
- Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Pocket API Reference: https://docs.heypocketai.com/docs/api