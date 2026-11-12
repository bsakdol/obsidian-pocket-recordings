import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outdir = join(root, ".test-dist");

function findTests(dir) {
	const found = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			found.push(...findTests(full));
		} else if (name.endsWith(".test.ts")) {
			found.push(full);
		}
	}
	return found;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

const entryPoints = findTests(join(root, "tests"));
if (entryPoints.length === 0) {
	fail("No tests found under tests/.");
}

// Type-check src and tests first; esbuild strips types without checking them.
const tsc = spawnSync(
	process.execPath,
	[join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.test.json"],
	{ stdio: "inherit", cwd: root },
);
if (tsc.status !== 0) {
	fail("Type check failed (tsconfig.test.json).");
}

rmSync(outdir, { recursive: true, force: true });

await esbuild.build({
	entryPoints,
	outdir,
	outbase: join(root, "tests"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	logLevel: "warning",
	alias: { obsidian: join(root, "tests", "stubs", "obsidian.ts") },
	outExtension: { ".js": ".mjs" },
	loader: { ".json": "json" },
});

// Hand node --test an explicit file list: directory discovery differs across
// Node majors, and a run that finds zero files must not pass.
const outputs = entryPoints.map((entry) =>
	join(outdir, relative(join(root, "tests"), entry).replace(/\.ts$/, ".mjs")),
);
const missing = outputs.filter((file) => !existsSync(file));
if (missing.length > 0) {
	fail(`Expected test bundles were not produced:\n${missing.join("\n")}`);
}

const result = spawnSync(process.execPath, ["--test", ...outputs], {
	stdio: "inherit",
	cwd: root,
});
process.exit(result.status ?? 1);
