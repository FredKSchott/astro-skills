/**
 * The v0.2.0 $schema URI for the Agent Skills Discovery index
 */
export const SCHEMA_URI = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

/**
 * Options for the skills integration
 */
export interface SkillsIntegrationOptions {
	/**
	 * Experimental SEP-2640/MCP Skills output mode.
	 *
	 * Set to `true` to enable the default `/.well-known/mcp/skills` routes, or
	 * pass an object to customize the generated route and resource URIs.
	 *
	 * @default false
	 */
	mcp?: boolean | SkillsMcpOptions;
}

/**
 * Options for experimental SEP-2640/MCP Skills output.
 */
export interface SkillsMcpOptions {
	/**
	 * Static route prefix for generated MCP skill artifacts.
	 * @default '/.well-known/mcp/skills'
	 */
	prefix?: string;
	/**
	 * Resource URI base used in generated index and tree manifests.
	 * @default 'skill://'
	 */
	resourceBase?: string;
	/**
	 * Generate a `.tree.json` directory manifest.
	 * @default true
	 */
	directoryManifest?: boolean;
	/**
	 * Include generated tar.gz archive resources in the MCP index.
	 * Archives are generated for multi-file skills.
	 * @default true
	 */
	archives?: boolean;
}

/**
 * Fully resolved MCP output options.
 */
export interface ResolvedSkillsMcpOptions {
	prefix: string;
	resourceBase: string;
	directoryManifest: boolean;
	archives: boolean;
}

/**
 * Options for the skills loader
 */
export interface SkillsLoaderOptions {
	/**
	 * Base directory for skills, relative to project root.
	 * @default 'skills/'
	 */
	base?: string;
}

/**
 * Distribution type for a skill
 */
export type SkillType = 'skill-md' | 'archive';

/**
 * Full SKILL.md YAML frontmatter as rendered to JSON.
 */
export type SkillFrontmatter = Record<string, unknown> & {
	name: string;
	description: string;
};

/**
 * Represents a file within a skill directory.
 */
export interface SkillFileData {
	/** Path relative to the skill directory root */
	path: string;
	/** File content (UTF-8 string or base64-encoded for binary files) */
	content: string;
	/** Encoding used for the content */
	encoding: 'utf-8' | 'base64';
	/** MIME type for serving the file as a resource */
	mimeType: string;
	/** SHA-256 content digest of the raw file bytes, formatted as sha256:{hex} */
	digest: string;
	/** Raw file size in bytes */
	size: number;
}

/**
 * Represents a skill's data as stored in the content collection
 */
export interface SkillData {
	/** Skill name from SKILL.md frontmatter */
	name: string;
	/** Skill description from SKILL.md frontmatter */
	description: string;
	/** Distribution type: "skill-md" for single SKILL.md, "archive" for bundled archive */
	type: SkillType;
	/** SHA-256 content digest of the artifact, formatted as sha256:{hex} */
	digest: string;
	/** SHA-256 content digest of the raw SKILL.md bytes, formatted as sha256:{hex} */
	skillMdDigest: string;
	/** Raw SKILL.md content (UTF-8 string) */
	skillMdRaw: string;
	/** Full SKILL.md frontmatter */
	frontmatter: SkillFrontmatter;
	/** Files in this skill directory */
	files: SkillFileData[];
	/** Pre-generated tar.gz archive (base64-encoded) - only present for archive type skills */
	archive?: string;
	/** SHA-256 content digest of the archive bytes, formatted as sha256:{hex} */
	archiveDigest?: string;
}

/**
 * A skill entry as returned by the content collection
 */
export interface Skill {
	/** Skill ID (directory name) */
	id: string;
	/** Skill data */
	data: SkillData;
	/** SKILL.md body content (markdown without frontmatter) */
	body: string;
}

/**
 * A skill entry in the v0.2.0 discovery index
 */
export interface SkillsIndexEntry {
	name: string;
	type: SkillType;
	description: string;
	url: string;
	digest: string;
}

/**
 * The index.json response format per the Agent Skills Discovery RFC v0.2.0
 */
export interface SkillsIndex {
	$schema: string;
	skills: SkillsIndexEntry[];
}

/**
 * Archive entry in the experimental SEP-2640/MCP skill index.
 */
export interface SkillsMcpArchiveEntry {
	url: string;
	mimeType: 'application/gzip';
	digest: string;
}

/**
 * Skill entry in the experimental SEP-2640/MCP skill index.
 */
export interface SkillsMcpIndexEntry {
	frontmatter: SkillFrontmatter;
	url?: string;
	digest?: string;
	archives?: SkillsMcpArchiveEntry[];
}

/**
 * Experimental SEP-2640/MCP skill index.
 */
export interface SkillsMcpIndex {
	skills: SkillsMcpIndexEntry[];
}

/**
 * Directory entry in the experimental MCP tree manifest.
 */
export interface SkillsMcpTreeDirectoryEntry {
	type: 'directory';
	name: string;
	path: string;
	uri: string;
	mimeType: 'inode/directory';
}

/**
 * File entry in the experimental MCP tree manifest.
 */
export interface SkillsMcpTreeFileEntry {
	type: 'file';
	name: string;
	path: string;
	uri: string;
	mimeType: string;
	digest: string;
	size: number;
	description?: string;
	_meta?: {
		'io.modelcontextprotocol.skills/frontmatter': SkillFrontmatter;
	};
}

export type SkillsMcpTreeEntry = SkillsMcpTreeDirectoryEntry | SkillsMcpTreeFileEntry;

/**
 * Experimental MCP tree manifest for directory-read adapters.
 */
export interface SkillsMcpTree {
	entries: SkillsMcpTreeEntry[];
}
