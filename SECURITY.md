# Security policy

## Supported versions

Only the latest release gets security fixes. Obsidian offers updates under **Settings → Community plugins → Check for updates**; a manual install has to be updated by hand.

## Reporting a vulnerability

Please report a vulnerability privately, not in a public issue. Use [Report a vulnerability](https://github.com/bsakdol/obsidian-pocket-recordings/security/advisories/new) on the repository's **Security** tab. Only you and the maintainer can see the report.

Include:

- what the problem is and what an attacker could do with it
- the plugin version, Obsidian version, and platform
- steps to reproduce, or a proof of concept

Never include a real Pocket API key or the text of real recordings. If a key may have been exposed, revoke it in the Pocket app under **Settings → API keys** and create a new one.

## What happens next

This project has one maintainer, working on it in their own time. You can expect an acknowledgment within 7 days. Once the problem is confirmed, the fix ships in a new patch release, and a security advisory is published that credits you unless you'd rather not be named.

## Scope

In scope, because the plugin promises the opposite:

- the API key reaching the plugin's settings file (`data.json`), logs, diagnostics, or anywhere outside Obsidian's secret storage
- a request to any host other than `https://public.heypocketai.com/api/v1`, or any request that writes to Pocket
- writing outside the plugin's region of a note or outside its `pocket_*` properties, or deleting a note
- a release `main.js` that was not built by this repository's release workflow

Out of scope:

- Pocket's own service and app: report those to [Pocket](https://heypocket.com)
- Obsidian itself: report those to [Obsidian](https://obsidian.md/security)
- problems that need an attacker who already controls your device or your vault

## Verifying a release

Each release's `main.js` is built and signed by GitHub Actions. With the [GitHub CLI](https://cli.github.com), check that a downloaded copy came from this repository:

```sh
gh attestation verify main.js --repo bsakdol/obsidian-pocket-recordings
```
