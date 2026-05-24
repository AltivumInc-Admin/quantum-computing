# Quantum Learning Portal — Design Spec

## Overview

A web-based learning portal for the Quantum Computing Workspace, deployed on AWS Amplify with a public URL. Serves as both a personal/team learning tool and a public portfolio piece demonstrating quantum computing expertise with Amazon Braket.

## Architecture

- **Framework:** Next.js 14+ with App Router, server-side rendered
- **Deployment:** AWS Amplify (SSR mode via Lambda@Edge)
- **Content source:** Server-side API route reads GUIDE.md files from the filesystem at request time
- **Styling:** Tailwind CSS with custom design system, dark/light theme toggle via `next-themes`
- **Markdown rendering:** `react-markdown` + `remark-gfm` + `rehype-highlight`
- **Location:** `web/` subdirectory within this repo. Amplify builds from that directory.

## Pages

### Landing Page (`/`)

- Top nav: site title (left), theme toggle (right)
- Hero: "Quantum Computing Workspace" title, one-line subtitle about Amazon Braket, tech stack badges (Braket SDK, PennyLane, OpenFermion)
- Section grid: 6 cards (2x3 or 3x2), each showing section number, title, brief description (first paragraph of GUIDE.md), notebook count. Cards link to `/learn/[section]`

### Section Pages (`/learn/[section]`)

- Same top nav
- Left sidebar (fixed desktop, drawer on mobile): all 6 sections listed, current highlighted
- Main content: rendered GUIDE.md with heading hierarchy, syntax-highlighted code blocks
- Notebook links: styled link cards pointing to `.ipynb` files on GitHub (repo URL configurable via environment variable `NEXT_PUBLIC_GITHUB_REPO`)
- Bottom: prev/next navigation

### API Route (`/api/content/[section]`)

- Reads GUIDE.md from corresponding directory (e.g., `00-foundations/GUIDE.md`)
- Returns parsed markdown content + metadata (title, notebook list, section index)
- Cached with `Cache-Control` headers

## Layout

Linear learning path with sidebar navigation. Sequential progression through sections 00-05 with prev/next controls.

## Design System

- Clean, modern aesthetic with generous whitespace
- System font stack (Inter or similar sans-serif via `next/font`)
- Dark/light toggle, respects `prefers-color-scheme` by default
- Accent color: blue or violet (quantum/physics association)
- Code blocks: syntax-highlighted with distinct background
- Responsive: sidebar collapses to hamburger drawer on mobile

## Amplify Deployment

- Amplify auto-detects Next.js SSR, provisions Lambda@Edge
- Build settings: `baseDirectory: web`, `buildCommand: npm run build`
- Auto-deploy on push to `main`
- Custom domain addable via Amplify console

## Dependencies

- `next`, `react`, `react-dom`
- `tailwindcss`, `@tailwindcss/typography`
- `next-themes`
- `react-markdown`, `remark-gfm`, `rehype-highlight`
- `gray-matter` (for potential future frontmatter support)

## Out of Scope

- No authentication or gating
- No notebook rendering (links to GitHub only)
- No search
- No analytics
- No CMS — content lives as markdown in the repo
