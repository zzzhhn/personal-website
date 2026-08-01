import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    titleZh: z.string(),
    slug: z.string(),
    tagline: z.string().max(120),
    taglineZh: z.string().max(120),
    description: z.string().max(300),
    descriptionZh: z.string().max(300),
    date: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    maturity: z.enum([
      "stable-release",
      "functional-prototype",
      "research-preview",
      "completed-case-study",
    ]),
    maintenance: z.enum(["actively-maintained", "completed", "archived"]),
    featured: z.boolean().default(false),
    techStack: z.array(z.string()),
    links: z.object({
      live: z.string().url().optional(),
      github: z.string().url().optional(),
    }),
    thumbnail: z.string().optional(),
    thumbnailLight: z.string().optional(),
    thumbnailDark: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    highlightsZh: z.array(z.string()).optional(),
    order: z.number().int().default(0),
  }),
});

const experiences = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/experiences" }),
  schema: z.object({
    role: z.string(),
    organization: z.string(),
    location: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    type: z.enum(["full-time", "internship", "part-time", "research"]),
    highlights: z.array(z.string()).min(1).max(5),
    techStack: z.array(z.string()).default([]),
    order: z.number().int(),
  }),
});

const about = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/about" }),
  schema: z.object({
    headline: z.string(),
    techCategories: z.array(
      z.object({
        label: z.string(),
        items: z.array(z.string()),
      })
    ),
  }),
});

export const collections = { projects, experiences, about };
