/**
 * The v0.2.0 $schema URI for the Agent Skills Discovery index
 */
export const SCHEMA_URI = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

/**
 * Options for the skills integration
 * Currently reserved for future use.
 */
export interface SkillsIntegrationOptions {
	// Reserved for future options
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
	/** Raw SKILL.md content (UTF-8 string) */
	skillMdRaw: string;
	/** Pre-generated tar.gz archive (base64-encoded) - only present for archive type skills */
	archive?: string;
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
