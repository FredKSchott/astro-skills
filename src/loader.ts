import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import matter from 'gray-matter';
import pLimit from 'p-limit';
import picomatch from 'picomatch';
import { Header, Pack, ReadEntry } from 'tar';
import { glob as tinyglobby } from 'tinyglobby';
import { skillSchema } from './schema.js';
import type { SkillFileData, SkillFrontmatter, SkillsLoaderOptions, SkillType } from './types.js';
import {
	getMimeType,
	getSkillNameValidationError,
	getSkillPathValidationError,
	isTextFile,
	normalizeFilePath,
} from './utils.js';

/**
 * Represents a single file while preparing tar archives.
 */
type ArchiveFile = Pick<SkillFileData, 'content' | 'encoding'>;

/**
 * Represents a single file as loaded from disk.
 */
interface LoadedSkillFile extends SkillFileData {
	/** File content (UTF-8 string or base64-encoded for non-text files) */
	content: string;
	/** Encoding used for the content */
	encoding: 'utf-8' | 'base64';
	/** Raw bytes for digest and archive generation */
	buffer: Buffer;
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
async function generateTarGz(files: Record<string, ArchiveFile>): Promise<Buffer> {
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

function hasCurrentSkillDataShape(data: unknown, skillType: SkillType): boolean {
	if (!isRecord(data)) return false;
	if (typeof data.skillMdDigest !== 'string') return false;
	if (!isRecord(data.frontmatter)) return false;
	if (typeof data.frontmatter.name !== 'string') return false;
	if (typeof data.frontmatter.description !== 'string') return false;
	if (!Array.isArray(data.files)) return false;
	if (!data.files.some((file) => isSkillFileDataLike(file) && file.path === 'SKILL.md')) {
		return false;
	}
	if (!data.files.every(isSkillFileDataLike)) return false;
	if (skillType === 'archive' && typeof data.archiveDigest !== 'string') return false;

	return true;
}

function isSkillFileDataLike(value: unknown): value is SkillFileData {
	if (!isRecord(value)) return false;

	return (
		typeof value.path === 'string' &&
		typeof value.content === 'string' &&
		(value.encoding === 'utf-8' || value.encoding === 'base64') &&
		typeof value.mimeType === 'string' &&
		typeof value.digest === 'string' &&
		typeof value.size === 'number'
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
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

			const skillDirs = skillFiles.map((skillFile) => normalizeFilePath(dirname(skillFile)));
			const invalidNestedSkillDirs = new Set<string>();
			for (const skillDir of skillDirs) {
				for (const otherSkillDir of skillDirs) {
					if (skillDir !== otherSkillDir && otherSkillDir.startsWith(`${skillDir}/`)) {
						invalidNestedSkillDirs.add(skillDir);
						invalidNestedSkillDirs.add(otherSkillDir);
						logger.error(
							`Nested skills are not supported: "${otherSkillDir}" is inside "${skillDir}".`,
						);
					}
				}
			}

			/**
			 * Loads a single skill from its directory
			 */
			async function loadSkill(skillMdPath: string, oldId?: string): Promise<void> {
				const skillDir = normalizeFilePath(dirname(skillMdPath));
				if (skillDir === '.') {
					logger.error('SKILL.md must live inside a skill directory.');
					return;
				}
				const skillId = skillDir;
				if (invalidNestedSkillDirs.has(skillId)) {
					return;
				}

				// Validate skill path. Prefix segments may organize skills, but the
				// final segment must satisfy Agent Skills naming rules.
				const skillPathError = getSkillPathValidationError(skillId);
				if (skillPathError) {
					logger.error(`Invalid skill path "${skillId}": ${skillPathError}`);
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

				const skillName = basename(skillId);
				if (frontmatter.name !== skillName) {
					logger.error(
						`Skill "${skillId}" frontmatter name "${frontmatter.name}" must match final path segment "${skillName}"`,
					);
					return;
				}

				const skillNameError = getSkillNameValidationError(frontmatter.name);
				if (skillNameError) {
					logger.error(`Invalid skill name "${frontmatter.name}": ${skillNameError}`);
					return;
				}
				const skillFrontmatter = frontmatter as SkillFrontmatter;

				// Find all files in the skill directory to determine skill type
				const skillDirUrl = new URL(skillDir + '/', baseDir);
				const skillDirPath = fileURLToPath(skillDirUrl);

				const allFiles = (
					await tinyglobby('**/*', {
						cwd: skillDirPath,
						expandDirectories: false,
						onlyFiles: true,
					})
				)
					.map(normalizeFilePath)
					.sort((a, b) => a.localeCompare(b));

				const limit = pLimit(10);
				const loadedFiles = await Promise.all(
					allFiles.map((filePath) =>
						limit(async (): Promise<LoadedSkillFile | null> => {
							const fileUrl = new URL(filePath, skillDirUrl);
							const fullPath = fileURLToPath(fileUrl);

							fileToSkillMap.set(fullPath, skillId);

							try {
								const buffer =
									normalizeFilePath(filePath) === 'SKILL.md'
										? skillMdRawBuffer
										: await fs.readFile(fileUrl);
								const isText = isTextFile(filePath);
								const encoding = isText ? 'utf-8' : 'base64';
								const content = isText ? buffer.toString('utf-8') : buffer.toString('base64');

								return {
									path: filePath,
									content,
									encoding,
									mimeType: getMimeType(filePath),
									digest: sha256(buffer),
									size: buffer.byteLength,
									buffer,
								};
							} catch (err: any) {
								logger.warn(`Error reading file ${filePath} in skill ${skillId}: ${err.message}`);
								return null;
							}
						}),
					),
				);

				const files = loadedFiles.filter((file): file is LoadedSkillFile => file !== null);
				const skillMdFile = files.find((file) => file.path === 'SKILL.md');
				if (!skillMdFile) {
					logger.error(`Skill "${skillId}" is missing SKILL.md`);
					return;
				}

				// Determine skill type: "skill-md" if only SKILL.md, "archive" if multiple files
				const isArchive = files.length > 1;
				const skillType: SkillType = isArchive ? 'archive' : 'skill-md';

				// Compute digest and optional archive
				let artifactDigest: string;
				let archiveBase64: string | undefined;
				let archiveDigest: string | undefined;

				if (isArchive) {
					const archiveFiles: Record<string, ArchiveFile> = Object.fromEntries(
						files.map((file) => [
							file.path,
							{
								content: file.content,
								encoding: file.encoding,
							},
						]),
					);

					// Generate tar.gz and compute digest of the archive
					const archiveBuffer = await generateTarGz(archiveFiles);
					archiveDigest = sha256(archiveBuffer);
					artifactDigest = archiveDigest;
					archiveBase64 = archiveBuffer.toString('base64');
				} else {
					// For skill-md, only need the SKILL.md we already read
					artifactDigest = skillMdFile.digest;
				}

				// Use the artifact digest for change detection.
				// This correctly captures all file content changes:
				// - For skill-md: SHA-256 of the SKILL.md raw bytes
				// - For archive: SHA-256 of the tar.gz (derived from all files)
				const existingEntry = store.get(skillId);
				if (
					existingEntry &&
					existingEntry.digest === artifactDigest &&
					hasCurrentSkillDataShape(existingEntry.data, skillType)
				) {
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
						skillMdDigest: skillMdFile.digest,
						skillMdRaw: skillMdContent,
						frontmatter: skillFrontmatter,
						files: files.map(({ path, content, encoding, mimeType, digest, size }) => ({
							path,
							content,
							encoding,
							mimeType,
							digest,
							size,
						})),
						archive: archiveBase64,
						archiveDigest,
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
			const findContainingSkill = (filePath: string): string | null => {
				const rel = normalizeFilePath(posixRelative(basePath, filePath));
				if (rel.startsWith('..')) return null;

				const mappedSkillId = fileToSkillMap.get(filePath);
				if (mappedSkillId) return mappedSkillId;

				const parts = rel.split('/');
				for (let index = parts.length - 1; index > 0; index--) {
					const potentialSkillDir = parts.slice(0, index).join('/');
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
					const skillId = normalizeFilePath(dirname(entry));
					const oldId = fileToSkillMap.get(changedPath);
					await loadSkill(entry, oldId);
					logger.info(`Reloaded skill "${skillId}"`);
					return;
				}

				// Check if any file in a skill directory changed
				const skillId = findContainingSkill(changedPath);
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
					const skillId = normalizeFilePath(dirname(entry));
					store.delete(skillId);
					fileToSkillMap.delete(deletedPath);
					logger.info(`Removed skill "${skillId}" (SKILL.md deleted)`);
					return;
				}

				// If another file was deleted, reload the skill
				const skillId = findContainingSkill(deletedPath);
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
