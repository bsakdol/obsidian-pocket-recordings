import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mts", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			"obsidianmd/ui/sentence-case": ["error", { brands: ["Pocket"] }],
		},
	},
	globalIgnores([
		"node_modules",
		".claude",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"version-bump.mjs",
		"versions.json",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"tsconfig.test.json",
		"main.js",
		".test-dist",
		".probe",
		"docs",
		"scripts",
		"tests",
	]),
);
