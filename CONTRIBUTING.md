# Contributing to Pocket Recordings

Thanks for helping. This plugin has one maintainer, working on it in their own time, so please be patient and kind, and expect the same in return.

## Reporting a bug

[Open a bug report](https://github.com/bsakdol/obsidian-pocket-recordings/issues/new?template=bug_report.yml) and include the output of **Copy diagnostics**. Issues are public: never paste your Pocket API key or the text of a recording.

To report a security problem, follow [SECURITY.md](SECURITY.md) instead. Don't open a public issue.

## Suggesting a change

[Open a feature request](https://github.com/bsakdol/obsidian-pocket-recordings/issues/new?template=feature_request.yml) that describes the problem before the solution. Pull requests are welcome once the change has been discussed and agreed in an issue, so that nobody spends time on work that can't be merged.

## Making a change

[Development](README.md#development) in the README explains how to set up, build, test, and try a change in a throwaway vault. Read [How sync works](README.md#how-sync-works) before changing anything under `src/sync/`.

A change is ready when all three of these pass. CI runs the same checks on every pull request.

```sh
npm test
npm run lint
npm run build
```

### Rules that protect users' notes

People trust this plugin with their vaults. Every change has to keep these promises:

- Write only between `%% pocket-recordings:begin %%` and `%% pocket-recordings:end %%`, and only `pocket_*` properties. Never write Obsidian's `tags` property or anything outside the region.
- Never delete a note. Mark it with `pocket_status` instead.
- Every sync step must be safe to repeat: a second sync right after a first changes nothing.
- Paths must come out the same on every device for the same recording and settings. Never use a device-local value such as the system time zone.
- Network requests go only to `https://public.heypocketai.com/api/v1`, read-only, through `src/pocket/transport.ts`. No new hosts and no telemetry.
- The API key stays in Obsidian's secret storage. Never put it in `data.json`, logs, or diagnostics.

### Code

- The sync engine in `src/sync/` reaches the vault only through the `VaultOps` interface, and only `src/main.ts`, `src/vault/obsidianVaultOps.ts`, `src/pocket/transport.ts`, `src/settings/`, and `src/ui/` import `obsidian`. This keeps the engine testable without Obsidian.
- Use tabs and strict TypeScript. Match the comment density of the file you're editing, and write comments that explain why, in plain words.
- Interface text uses sentence case. `npm run lint` checks this, along with the rest of Obsidian's review rules.

### Tests

- Test sync behavior by running a whole sync with `syncCycle`, then `assertConverged` to check that a second sync changes nothing. `tests/planner.test.ts` shows the pattern.
- For a bug fix, add a test that fails without the fix.
- Never commit anything from `.probe/` or the text of real recordings. Fixtures in `tests/fixtures/pocket/` must be scrubbed; their README explains how.

## Commits and pull requests

- Write commit messages and pull request titles as [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), scoped to the `src/` folder the change touches, for example `fix(paths): keep date folders the same on every device`.
- If users would notice the change, add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the same commit. File it under Added, Changed, Deprecated, Removed, Fixed, or Security, and write it for users, not developers.
- Never commit `main.js`, `data.json`, or `.env`.
- Keep a pull request to one change, and fill in the template: what changed and why, the commands you ran with their output, and what you didn't verify.

The maintainer handles version bumps and releases.

## License

By contributing, you agree that your contribution is licensed under the [0BSD license](LICENSE), like the rest of the project.
