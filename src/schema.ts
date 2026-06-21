import { z } from 'astro/zod';

/**
 * Schema for skill data stored in the content collection
 */
export const skillSchema = z.object({
	/** Skill name from SKILL.md frontmatter */
	name: z.string().min(1).max(64),
	/** Skill description from SKILL.md frontmatter */
	description: z.string().min(1).max(1024),
	/** Distribution type: "skill-md" for single SKILL.md, "archive" for bundled archive */
	type: z.enum(['skill-md', 'archive']),
	/** SHA-256 content digest of the artifact, formatted as sha256:{hex} */
	digest: z.string(),
	/** SHA-256 content digest of the raw SKILL.md bytes, formatted as sha256:{hex} */
	skillMdDigest: z.string(),
	/** Raw SKILL.md content (UTF-8 string) - used for serving SKILL.md directly */
	skillMdRaw: z.string(),
	/** Full SKILL.md frontmatter */
	frontmatter: z
		.object({
			name: z.string().min(1).max(64),
			description: z.string().min(1).max(1024),
		})
		.passthrough(),
	/** Files in this skill directory */
	files: z.array(
		z.object({
			path: z.string(),
			content: z.string(),
			encoding: z.enum(['utf-8', 'base64']),
			mimeType: z.string(),
			digest: z.string(),
			size: z.number().int().nonnegative(),
		}),
	),
	/** Pre-generated tar.gz archive (base64-encoded) - only present for archive type skills */
	archive: z.string().optional(),
	/** SHA-256 content digest of the archive bytes, formatted as sha256:{hex} */
	archiveDigest: z.string().optional(),
});

export type SkillSchema = z.infer<typeof skillSchema>;
