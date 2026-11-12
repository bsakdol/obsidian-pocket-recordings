import listing from "../fixtures/pocket/listing.json";
import folders from "../fixtures/pocket/folders.json";
import tags from "../fixtures/pocket/tags.json";
import detail1 from "../fixtures/pocket/detail-a1b2c3d4-0001.json";
import detail3 from "../fixtures/pocket/detail-a1b2c3d4-0003.json";
import detail4 from "../fixtures/pocket/detail-a1b2c3d4-0004.json";
import detail6 from "../fixtures/pocket/detail-a1b2c3d4-0006.json";

import type { ListedRecording, RecordingDetail } from "../../src/model";
import { FolderTree } from "../../src/pocket/folders";
import { mapDetail, mapListed } from "../../src/pocket/mappers";

export const rawListing = listing;
export const rawFolders = folders;
export const rawTags = tags;
export const rawDetails: Record<string, unknown> = {
	[detail1.data.id]: detail1,
	[detail3.data.id]: detail3,
	[detail4.data.id]: detail4,
	[detail6.data.id]: detail6,
};

export const ids = {
	acme: "a1b2c3d4-0001-4000-8000-000000000001",
	weekly: "a1b2c3d4-0002-4000-8000-000000000002",
	memo: "a1b2c3d4-0003-4000-8000-000000000003",
	idea: "a1b2c3d4-0004-4000-8000-000000000004",
	processing: "a1b2c3d4-0005-4000-8000-000000000005",
	doctor: "a1b2c3d4-0006-4000-8000-000000000006",
} as const;

export function listedFixtures(): ListedRecording[] {
	return rawListing.data.map(mapListed);
}

export function listedFixture(id: string): ListedRecording {
	const found = listedFixtures().find((recording) => recording.id === id);
	if (!found) throw new Error(`no listing fixture ${id}`);
	return found;
}

export function folderTree(): FolderTree {
	return FolderTree.fromRaw(rawFolders.data);
}

/** The mapped detail for a fixture id, or a detail synthesized from the listing when none is captured. */
export function detailFixture(id: string): RecordingDetail {
	const listed = listedFixture(id);
	const raw = rawDetails[id] as { data: unknown } | undefined;
	return mapDetail(raw?.data ?? { id }, listed);
}
