import type {
	ResolvedSkillsMcpOptions,
	Skill,
	SkillData,
	SkillsMcpIndex,
	SkillsMcpIndexEntry,
	SkillsMcpOptions,
	SkillsMcpTree,
	SkillsMcpTreeDirectoryEntry,
	SkillsMcpTreeFileEntry,
} from './types.js';

const DEFAULT_MCP_PREFIX = '/.well-known/mcp/skills';
const DEFAULT_RESOURCE_BASE = 'skill://';
const ARCHIVE_MIME_TYPE = 'application/gzip';

export interface SkillsMcpFileArtifact {
	kind: 'file';
	publicPath: string;
	content: string;
	encoding: 'utf-8' | 'base64';
	mimeType: string;
	digest: string;
	size: number;
}

export interface SkillsMcpArchiveArtifact {
	kind: 'archive';
	publicPath: string;
	content: string;
	encoding: 'base64';
	mimeType: typeof ARCHIVE_MIME_TYPE;
	digest: string;
}

export interface SkillsMcpPublication {
	index: SkillsMcpIndex;
	tree: SkillsMcpTree;
	files: SkillsMcpFileArtifact[];
	archives: SkillsMcpArchiveArtifact[];
}

type SkillLike = Pick<Skill, 'id'> & {
	data: SkillData;
};

export function resolveSkillsMcpOptions(
	options: boolean | SkillsMcpOptions | undefined,
): ResolvedSkillsMcpOptions | null {
	if (!options) return null;

	const mcpOptions = options === true ? {} : options;
	return {
		prefix: normalizeRoutePrefix(mcpOptions.prefix ?? DEFAULT_MCP_PREFIX),
		resourceBase: mcpOptions.resourceBase ?? DEFAULT_RESOURCE_BASE,
		directoryManifest: mcpOptions.directoryManifest ?? true,
		archives: mcpOptions.archives ?? true,
	};
}

export function createSkillsMcpPublication(
	skills: SkillLike[],
	options: Pick<ResolvedSkillsMcpOptions, 'resourceBase' | 'archives'>,
): SkillsMcpPublication {
	const sortedSkills = [...skills].sort((a, b) => a.id.localeCompare(b.id));
	const files = sortedSkills.flatMap((skill) =>
		skill.data.files.map((file): SkillsMcpFileArtifact => ({
			kind: 'file',
			publicPath: `${skill.id}/${file.path}`,
			content: file.content,
			encoding: file.encoding,
			mimeType: file.mimeType,
			digest: file.digest,
			size: file.size,
		})),
	);
	const archives = options.archives
		? sortedSkills.flatMap((skill): SkillsMcpArchiveArtifact[] => {
			if (!skill.data.archive || !skill.data.archiveDigest) return [];

			return [
				{
					kind: 'archive',
					publicPath: `${skill.id}.tar.gz`,
					content: skill.data.archive,
					encoding: 'base64',
					mimeType: ARCHIVE_MIME_TYPE,
					digest: skill.data.archiveDigest,
				},
			];
		})
		: [];

	return {
		index: createIndex(sortedSkills, archives, options.resourceBase),
		tree: createTree(sortedSkills, files, options.resourceBase),
		files,
		archives,
	};
}

function createIndex(
	skills: SkillLike[],
	archives: SkillsMcpArchiveArtifact[],
	resourceBase: string,
): SkillsMcpIndex {
	const archiveByPublicPath = new Map(
		archives.map((archive) => [archive.publicPath, archive] as const),
	);
	const entries: SkillsMcpIndexEntry[] = skills.map((skill) => {
		const entry: SkillsMcpIndexEntry = {
			frontmatter: skill.data.frontmatter,
			url: joinResourceUri(resourceBase, `${skill.id}/SKILL.md`),
			digest: skill.data.skillMdDigest,
		};
		const archive = archiveByPublicPath.get(`${skill.id}.tar.gz`);

		if (archive) {
			entry.archives = [
				{
					url: joinResourceUri(resourceBase, archive.publicPath),
					mimeType: ARCHIVE_MIME_TYPE,
					digest: archive.digest,
				},
			];
		}

		return entry;
	});

	return { skills: entries };
}

function createTree(
	skills: SkillLike[],
	files: SkillsMcpFileArtifact[],
	resourceBase: string,
): SkillsMcpTree {
	const skillById = new Map(skills.map((skill) => [skill.id, skill] as const));
	const directoryEntries = createDirectoryEntries(files, resourceBase);
	const fileEntries = files.map((file) => createTreeFileEntry(file, skillById, resourceBase));

	return {
		entries: [...directoryEntries, ...fileEntries].sort((a, b) => a.path.localeCompare(b.path)),
	};
}

function createDirectoryEntries(
	files: SkillsMcpFileArtifact[],
	resourceBase: string,
): SkillsMcpTreeDirectoryEntry[] {
	const directories = new Set<string>();

	for (const file of files) {
		const parts = file.publicPath.split('/');
		for (let index = 1; index < parts.length; index++) {
			directories.add(parts.slice(0, index).join('/'));
		}
	}

	return [...directories]
		.sort((a, b) => a.localeCompare(b))
		.map((path) => ({
			type: 'directory',
			name: lastPathSegment(path),
			path,
			uri: joinResourceUri(resourceBase, path),
			mimeType: 'inode/directory',
		}));
}

function createTreeFileEntry(
	file: SkillsMcpFileArtifact,
	skillById: Map<string, SkillLike>,
	resourceBase: string,
): SkillsMcpTreeFileEntry {
	const skill = findOwningSkill(file.publicPath, skillById);
	const isSkillMd = skill && file.publicPath === `${skill.id}/SKILL.md`;

	return {
		type: 'file',
		name: isSkillMd ? skill.data.frontmatter.name : lastPathSegment(file.publicPath),
		path: file.publicPath,
		uri: joinResourceUri(resourceBase, file.publicPath),
		mimeType: file.mimeType,
		digest: file.digest,
		size: file.size,
		...(isSkillMd
			? {
				description: skill.data.frontmatter.description,
				_meta: {
					'io.modelcontextprotocol.skills/frontmatter': skill.data.frontmatter,
				},
			}
			: {}),
	};
}

function findOwningSkill(
	publicPath: string,
	skillById: Map<string, SkillLike>,
): SkillLike | undefined {
	const matchingSkillIds = [...skillById.keys()]
		.filter((skillId) => publicPath === skillId || publicPath.startsWith(`${skillId}/`))
		.sort((a, b) => b.length - a.length);

	return matchingSkillIds.length > 0 ? skillById.get(matchingSkillIds[0]) : undefined;
}

function joinResourceUri(resourceBase: string, path: string): string {
	const base = resourceBase.trim() || DEFAULT_RESOURCE_BASE;
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');

	if (base.endsWith('://') || base.endsWith('/')) {
		return `${base}${encodedPath}`;
	}

	return `${base}/${encodedPath}`;
}

function normalizeRoutePrefix(prefix: string): string {
	const trimmed = prefix.trim();
	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');

	return withoutTrailingSlash || DEFAULT_MCP_PREFIX;
}

function lastPathSegment(path: string): string {
	const segments = path.split('/');
	return segments[segments.length - 1] ?? path;
}
