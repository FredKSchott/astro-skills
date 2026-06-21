# astro-skills

Let your users do this: `npx skills add https://your-website-here.com/`

Bundle [Agent Skills](https://agentskills.io/) into your Astro site, for others to consume by URL. This integration implements the [Agent Skills Discovery RFC](https://github.com/elithrar/agent-skills-discovery-rfc), allowing AI agents to discover and use skills published on your website. 

- Automatically generates your `/.well-known/agent-skills/index.json` index file.
- Validates your skills, frontmatter, etc. for compliance.
- Designed for Astro [Content Collections](https://docs.astro.build/en/guides/content-collections/).



## Installation

### Automatic Install

```bash
npx astro add astro-skills
```

### Manual Install

```bash
npm install astro-skills
```

Then, add the integration to your `astro.config.mjs` file:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import skills from 'astro-skills';

export default defineConfig({
  integrations: [skills()],
});
```

### Experimental MCP/SEP Skill Resources

To also publish skills as static MCP resource artifacts, enable the experimental MCP mode:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import skills from 'astro-skills';

export default defineConfig({
  integrations: [
    skills({
      mcp: {
        prefix: '/.well-known/mcp/skills',
        resourceBase: 'skill://',
        directoryManifest: true,
        archives: true,
      },
    }),
  ],
});
```

This generates:

- `/.well-known/mcp/skills/index.json`
- `/.well-known/mcp/skills/.tree.json`
- Direct static routes for every file in every skill directory
- `.tar.gz` archive resources for multi-file skills

The existing `/.well-known/agent-skills/index.json` discovery output remains enabled, so one Astro site can support both the Agent Skills well-known discovery proposal and SEP-2640/MCP resource publication at the same time.

The MCP index follows the SEP-2640 draft shape: it uses `skill://.../SKILL.md` resource URLs, includes the raw `SKILL.md` SHA-256 digest when `url` is present, and copies the complete `SKILL.md` frontmatter into each `skills[].frontmatter` entry. Multi-file skills also include `archives[]` alternatives whose digests are computed from the generated archive bytes.

The generated `.tree.json` file is a static-host helper, not part of SEP-2640 itself. It lists directory and file resource metadata so an MCP server can implement `resources/directory/read` without rescanning the filesystem at request time.

During static builds, `astro-skills` also writes an `_headers` block for generated skill artifacts so hosts that support `_headers` serve JSON, Markdown, and archive files with the expected content types.

## Configuration

To get started, create a `skills/` directory in your project root with your skills:

```
skills/
└── pdf-processing/
    ├── SKILL.md           # Required: instructions + metadata
    ├── scripts/           # Optional: executable code
    │   └── extract.py
    ├── references/        # Optional: documentation
    │   └── REFERENCE.md
    └── assets/            # Optional: templates, data files
        └── schema.json
```

Then, register your skills as a new content collection:

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { skillsLoader } from 'astro-skills';

export const collections = {
  skills: defineCollection({
    loader: skillsLoader({ base: './skills' }),
  }),
};
```



## Learn More

- [Agent Skills Specification](https://agentskills.io/specification)
- [Agent Skills Discovery RFC](https://github.com/elithrar/agent-skills-discovery-rfc)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
