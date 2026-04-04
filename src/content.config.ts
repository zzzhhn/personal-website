import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    tagline: z.string().max(120),
    description: z.string().max(300),
    date: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    status: z.enum(["completed", "in-progress", "archived"]),
    featured: z.boolean().default(false),
    techStack: z.array(z.string()),
    links: z.object({
      live: z.string().url().optional(),
      github: z.string().url().optional(),
    }),
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
