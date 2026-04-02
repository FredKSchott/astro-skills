import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import matter from 'gray-matter';
import pLimit from 'p-limit';
import picomatch from 'picomatch';
import { Header, Pack, ReadEntry } from 'tar';
import { glob as tinyglobby } from 'tinyglobby';
import { skillSchema } from './schema.js';
import type { SkillsLoaderOptions, SkillType } from './types.js';
import {
	getSkillNameValidationError,
	isBinaryFile,
	isValidSkillName,
	normalizeFilePath,
} from './utils.js';

/**
 * Represents a single file within a skill (used internally during loading)
 */
interface SkillFile {
	/** File content (UTF-8 string or base64-encoded for binary files) */
	content: string;
	/** Encoding used for the content */
	encoding: 'utf-8' | 'base64';
}

/**
 * Default base directory for skills
 */
const DEFAULT_BASE = 'skills/';

/**
 * Converts a path to use forward slashes (POSIX style)
 */
function posixRelative(from: string, to: string): string {
	return relative(from, to).replace(/\\/g, '/');
}

/**
 * Compute SHA-256 digest of a buffer, formatted as sha256:{hex}
 */
function sha256(data: Buffer | string): string {
	const hash = createHash('sha256');
	hash.update(data);
	return `sha256:${hash.digest('hex')}`;
}

/**
 * Generate a tar.gz archive from a set of files.
 * Returns the archive as a Buffer.
 */
async function generateTarGz(files: Record<string, SkillFile>): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const pack = new Pack({ gzip: true });
		const chunks: Buffer[] = [];

		pack.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});

		pack.on('end', () => {
			resolve(Buffer.concat(chunks));
		});

		pack.on('error', reject);

		// Sort file paths for deterministic output
		const sortedPaths = Object.keys(files).sort();

		for (const filePath of sortedPaths) {
			const file = files[filePath];
			let content: Buffer;

			if (file.encoding === 'base64') {
				content = Buffer.from(file.content, 'base64');
			} else {
				content = Buffer.from(file.content, 'utf-8');
			}

			const header = new Header({
				path: filePath,
				size: content.length,
				type: 'File',
				mode: 0o644,
				mtime: new Date(0), // Use epoch for deterministic output
			});

			const entry = new ReadEntry(header);
			pack.write(entry);
			entry.write(content);
			entry.end();
		}

		pack.end();
	});
}

/**
 * Creates a content loader for Agent Skills.
 *
 * Skills are loaded from directories containing a `SKILL.md` file.
 * Each skill directory becomes a single entry in the content collection.
 *
 * - Skills with only `SKILL.md` are stored as `type: "skill-md"`
 * - Skills with additional files are stored as `type: "archive"` with a pre-generated tar.gz
 *
 * @example
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content';
 * import { skillsLoader } from 'astro-skills';
 *
 * export const collections = {
 *   skills: defineCollection({
 *     loader: skillsLoader({ base: './skills' }),
 *   }),
 * };
 * ```
 */
export function skillsLoader(options: SkillsLoaderOptions = {}): Loader {
	const base = options.base ?? DEFAULT_BASE;

	// Map from file path to skill ID for efficient lookups during watch
	const fileToSkillMap = new Map<string, string>();

	return {
		name: 'skills-loader',
		schema: skillSchema,
		load: async ({ config, logger, watcher, parseData, store, renderMarkdown }) => {
			const untouchedSkills = new Set(store.keys());

			// Resolve base directory
			const baseDir = new URL(base, config.root);
			if (!baseDir.pathname.endsWith('/')) {
				baseDir.pathname = `${baseDir.pathname}/`;
			}

			const basePath = fileURLToPath(baseDir);
			const relativeBasePath = relative(fileURLToPath(config.root), basePath);

			// Check if base directory exists
			const exists = existsSync(baseDir);
			if (!exists) {
				logger.warn(`Skills directory "${relativeBasePath}" does not exist.`);
				// Don't return - we'll still set up the watcher
			}

			// Find all SKILL.md files
			const skillFiles = exists
				? await tinyglobby('**/SKILL.md', {
					cwd: basePath,
					expandDirectories: false,
				})
				: [];

			if (exists && skillFiles.length === 0) {
				logger.warn(
					`No skills found in "${relativeBasePath}". Skills must contain a SKILL.md file.`,
				);
			}

			/**
			 * Loads a single skill from its directory
			 */
			async function loadSkill(skillMdPath: string, oldId?: string): Promise<void> {
				const skillDir = dirname(skillMdPath);
				const skillId = skillDir === '.' ? skillMdPath.replace('/SKILL.md', '') : skillDir;

				// Validate skill name
				if (!isValidSkillName(skillId)) {
					const error = getSkillNameValidationError(skillId);
					logger.error(`Invalid skill name "${skillId}": ${error}`);
					return;
				}

				// Handle ID changes
				if (oldId && oldId !== skillId) {
					store.delete(oldId);
				}

				untouchedSkills.delete(skillId);

				// Read SKILL.md as raw bytes for digest computation
				const skillMdUrl = new URL(skillMdPath, baseDir);
				const skillMdRawBuffer = await fs.readFile(skillMdUrl).catch((err) => {
					logger.error(`Error reading ${skillMdPath}: ${err.message}`);
					return null;
				});

				if (skillMdRawBuffer === null) {
					return;
				}

				const skillMdContent = skillMdRawBuffer.toString('utf-8');

				// Parse frontmatter
				const { data: frontmatter, content: body } = matter(skillMdContent);

				// Validate required frontmatter fields
				if (!frontmatter.name || typeof frontmatter.name !== 'string') {
					logger.error(
						`Skill "${skillId}" is missing required "name" field in SKILL.md frontmatter`,
					);
					return;
				}
				if (!frontmatter.description || typeof frontmatter.description !== 'string') {
					logger.error(
						`Skill "${skillId}" is missing required "description" field in SKILL.md frontmatter`,
					);
					return;
				}

				// Find all files in the skill directory to determine skill type
				const skillDirUrl = new URL(skillDir + '/', baseDir);
				const skillDirPath = fileURLToPath(skillDirUrl);

				const allFiles = await tinyglobby('**/*', {
					cwd: skillDirPath,
					expandDirectories: false,
					onlyFiles: true,
				});

				// Determine skill type: "skill-md" if only SKILL.md, "archive" if multiple files
				const isArchive = allFiles.length > 1;
				const skillType: SkillType = isArchive ? 'archive' : 'skill-md';

				// Compute digest and optional archive
				let artifactDigest: string;
				let archiveBase64: string | undefined;

				if (isArchive) {
					// Pre-seed with the SKILL.md we already read to avoid reading it twice
					const files: Record<string, SkillFile> = {
						'SKILL.md': { content: skillMdContent, encoding: 'utf-8' },
					};
					const limit = pLimit(10);

					// Track SKILL.md in the watcher map
					fileToSkillMap.set(fileURLToPath(skillMdUrl), skillId);

					await Promise.all(
						allFiles
							.filter((filePath) => normalizeFilePath(filePath) !== 'SKILL.md')
							.map((filePath) =>
								limit(async () => {
									const fileUrl = new URL(filePath, skillDirUrl);
									const fullPath = fileURLToPath(fileUrl);
									const normalizedPath = normalizeFilePath(filePath);

									// Track file -> skill mapping for watcher
									fileToSkillMap.set(fullPath, skillId);

									try {
										const isBinary = isBinaryFile(filePath);

										let content: string;
										let encoding: 'utf-8' | 'base64';

										if (isBinary) {
											const buffer = await fs.readFile(fileUrl);
											content = buffer.toString('base64');
											encoding = 'base64';
										} else {
											content = await fs.readFile(fileUrl, 'utf-8');
											encoding = 'utf-8';
										}

										files[normalizedPath] = {
											content,
											encoding,
										};
									} catch (err: any) {
										logger.warn(`Error reading file ${filePath} in skill ${skillId}: ${err.message}`);
									}
								}),
							),
					);

					// Generate tar.gz and compute digest of the archive
					const archiveBuffer = await generateTarGz(files);
					artifactDigest = sha256(archiveBuffer);
					archiveBase64 = archiveBuffer.toString('base64');
				} else {
					// For skill-md, only need the SKILL.md we already read
					artifactDigest = sha256(skillMdRawBuffer);

					// Still track file -> skill mapping for watcher
					const skillMdFullPath = fileURLToPath(skillMdUrl);
					fileToSkillMap.set(skillMdFullPath, skillId);
				}

				// Use the artifact digest for change detection.
				// This correctly captures all file content changes:
				// - For skill-md: SHA-256 of the SKILL.md raw bytes
				// - For archive: SHA-256 of the tar.gz (derived from all files)
				const existingEntry = store.get(skillId);
				if (existingEntry && existingEntry.digest === artifactDigest) {
					return;
				}

				// Render SKILL.md body
				const rendered = await renderMarkdown(body);

				// Parse and validate data
				const data = await parseData({
					id: skillId,
					data: {
						name: frontmatter.name,
						description: frontmatter.description,
						type: skillType,
						digest: artifactDigest,
						skillMdRaw: skillMdContent,
						archive: archiveBase64,
					},
				});

				// Store the skill
				store.set({
					id: skillId,
					data,
					body,
					digest: artifactDigest,
					rendered,
				});

				logger.debug(`Loaded skill "${skillId}" (type: ${skillType})`);
			}

			// Load all skills
			const limit = pLimit(5);
			await Promise.all(skillFiles.map((skillFile) => limit(() => loadSkill(skillFile))));

			// Remove skills that no longer exist
			for (const id of untouchedSkills) {
				store.delete(id);
			}

			logger.info(`Loaded ${store.keys().length} skill(s) from "${relativeBasePath}"`);

			// Set up file watcher for dev mode
			if (!watcher) {
				return;
			}

			watcher.add(basePath);

			const matchesSkillFile = picomatch('**/SKILL.md');
			const matchesSkillDir = (filePath: string): string | null => {
				const rel = posixRelative(basePath, filePath);
				if (rel.startsWith('..')) return null;

				// Check if this file is within a skill directory
				const parts = rel.split('/');
				if (parts.length >= 2) {
					// Could be in a skill subdirectory
					const potentialSkillDir = parts[0];
					const skillMdPath = `${potentialSkillDir}/SKILL.md`;
					const skillMdFullPath = fileURLToPath(new URL(skillMdPath, baseDir));
					if (existsSync(skillMdFullPath)) {
						return potentialSkillDir;
					}
				}
				return null;
			};

			async function onChange(changedPath: string): Promise<void> {
				const entry = posixRelative(basePath, changedPath);
				if (entry.startsWith('..')) return;

				// Check if a SKILL.md file changed
				if (matchesSkillFile(entry)) {
					const skillId = dirname(entry);
					const oldId = fileToSkillMap.get(changedPath);
					await loadSkill(entry, oldId);
					logger.info(`Reloaded skill "${skillId}"`);
					return;
				}

				// Check if any file in a skill directory changed
				const skillId = matchesSkillDir(changedPath);
				if (skillId) {
					const skillMdPath = `${skillId}/SKILL.md`;
					await loadSkill(skillMdPath);
					logger.info(`Reloaded skill "${skillId}" (file changed: ${entry})`);
				}
			}

			watcher.on('change', onChange);
			watcher.on('add', onChange);

			watcher.on('unlink', async (deletedPath: string) => {
				const entry = posixRelative(basePath, deletedPath);
				if (entry.startsWith('..')) return;

				// If SKILL.md was deleted, remove the skill
				if (matchesSkillFile(entry)) {
					const skillId = dirname(entry);
					store.delete(skillId);
					fileToSkillMap.delete(deletedPath);
					logger.info(`Removed skill "${skillId}" (SKILL.md deleted)`);
					return;
				}

				// If another file was deleted, reload the skill
				const skillId = matchesSkillDir(deletedPath);
				if (skillId) {
					const skillMdPath = `${skillId}/SKILL.md`;
					const skillMdFullPath = fileURLToPath(new URL(skillMdPath, baseDir));
					if (existsSync(skillMdFullPath)) {
						await loadSkill(skillMdPath);
						logger.info(`Reloaded skill "${skillId}" (file deleted: ${entry})`);
					}
				}

				fileToSkillMap.delete(deletedPath);
			});
		},
	};
}
