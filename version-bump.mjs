import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// Copy the package version into manifest.json, and record which minAppVersion it needs in versions.json.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
}
