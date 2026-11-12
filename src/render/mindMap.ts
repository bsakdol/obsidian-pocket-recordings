import type { MindMapNode, MindMapVariant } from "../model";
import { neutralizeMarkers } from "./markers";

/** Mind maps as nested lists, one heading per variant Pocket produced. Renders on mobile. */
export function renderMindMaps(variants: MindMapVariant[], headingLevel: number): string {
	const heading = "#".repeat(Math.min(6, headingLevel));
	return variants.map((variant) => `${heading} ${variant.name}\n\n${variant.roots.map((root) => renderNode(root, 0)).join("\n")}`).join("\n\n");
}

function renderNode(node: MindMapNode, depth: number): string {
	const line = `${"\t".repeat(depth)}- ${neutralizeMarkers(node.title.replace(/\s+/g, " "))}`;
	return depth >= 32 ? line : [line, ...node.children.map((child) => renderNode(child, depth + 1))].join("\n");
}
