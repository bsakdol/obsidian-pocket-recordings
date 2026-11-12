/**
 * The comparison key for a vault path. Paths that differ only in letter case or Unicode
 * normalization form are the same path on common filesystems, so they share a key.
 */
export function pathKey(path: string): string {
	return path.normalize("NFC").toLowerCase();
}

export function parentOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "" : path.slice(0, slash);
}

export function basenameOf(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export function joinPath(...segments: string[]): string {
	return segments.filter((segment) => segment.length > 0).join("/");
}

/** Whether `path` is `folder` itself or lies beneath it. */
export function isUnder(path: string, folder: string): boolean {
	if (folder === "") return true;
	const key = pathKey(path);
	const folderKey = pathKey(folder);
	return key === folderKey || key.startsWith(`${folderKey}/`);
}
