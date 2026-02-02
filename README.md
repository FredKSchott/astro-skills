# astro-skills

Let your users do this: `npx skills add https://your-website-here.com/`

Bundle [Agent Skills](https://agentskills.io/) into your Astro site, for others to consume by URL. This integration implements the [Agent Skills Discovery RFC](https://github.com/elithrar/agent-skills-discovery-rfc), allowing AI agents to discover and use skills published on your website. 

- Automatically generates your `/.well-known/skills/index.json` index file.
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
