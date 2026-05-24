# Quantum Learning Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js learning portal in `web/` that renders the quantum workspace GUIDE.md files as a linear learning path, deployable on AWS Amplify with a public URL.

**Architecture:** Next.js 14 App Router with SSR. A server-side content module reads GUIDE.md files from the parent repo at request time. Tailwind CSS for styling with dark/light theme toggle. Landing page shows section overview grid; section pages render markdown with sidebar navigation.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS 3, `next-themes`, `react-markdown`, `remark-gfm`, `rehype-highlight`, TypeScript

---

## File Structure

```
web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local
├── amplify.yml
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (html, body, ThemeProvider, Nav)
│   │   ├── page.tsx              # Landing page (/)
│   │   ├── globals.css           # Tailwind imports + custom styles
│   │   └── learn/
│   │       └── [section]/
│   │           └── page.tsx      # Section page (/learn/[section])
│   ├── components/
│   │   ├── nav.tsx               # Top navigation bar
│   │   ├── theme-toggle.tsx      # Dark/light toggle button
│   │   ├── section-card.tsx      # Card for landing page grid
│   │   ├── sidebar.tsx           # Learning path sidebar
│   │   ├── markdown-renderer.tsx # react-markdown wrapper with plugins
│   │   ├── notebook-link.tsx     # Styled notebook link card
│   │   └── prev-next.tsx         # Previous/Next navigation
│   └── lib/
│       ├── content.ts            # Reads GUIDE.md files, returns metadata
│       └── sections.ts           # Section definitions (slugs, titles, paths)
└── __tests__/
    ├── lib/
    │   ├── content.test.ts
    │   └── sections.test.ts
    └── components/
        └── markdown-renderer.test.tsx
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/src/app/globals.css`
- Create: `web/src/app/layout.tsx`
- Create: `web/src/app/page.tsx`
- Create: `web/.env.local`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum
mkdir -p web && cd web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Select defaults when prompted. This creates the base scaffold.

- [ ] **Step 2: Install additional dependencies**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm install next-themes react-markdown remark-gfm rehype-highlight gray-matter
npm install -D @tailwindcss/typography @types/node jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom ts-jest
```

- [ ] **Step 3: Create `.env.local`**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_GITHUB_REPO=https://github.com/altivum/quantum
EOF
```

- [ ] **Step 4: Update `next.config.ts`**

Replace the generated `next.config.ts` with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 5: Configure Tailwind typography plugin**

In `tailwind.config.ts`, add the typography plugin:

```typescript
import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#7c3aed",
          light: "#8b5cf6",
          dark: "#6d28d9",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};

export default config;
```

- [ ] **Step 6: Set up `globals.css`**

Replace `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100;
  }
}

@layer components {
  .prose pre {
    @apply bg-gray-100 dark:bg-gray-800 rounded-lg;
  }

  .prose code {
    @apply text-accent dark:text-accent-light;
  }
}
```

- [ ] **Step 7: Create `amplify.yml`**

```yaml
version: 1
applications:
  - appRoot: web
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - "**/*"
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
```

- [ ] **Step 8: Verify the scaffold runs**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run dev
```

Expected: Dev server starts at `http://localhost:3000`, shows default Next.js page.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat(web): scaffold Next.js project with Tailwind and dependencies"
```

---

## Task 2: Section Definitions & Content Library

**Files:**
- Create: `web/src/lib/sections.ts`
- Create: `web/src/lib/content.ts`
- Create: `web/__tests__/lib/sections.test.ts`
- Create: `web/__tests__/lib/content.test.ts`

- [ ] **Step 1: Write failing test for sections module**

Create `web/__tests__/lib/sections.test.ts`:

```typescript
import { getSections, getSectionBySlug } from "@/lib/sections";

describe("sections", () => {
  it("returns all 6 sections in order", () => {
    const sections = getSections();
    expect(sections).toHaveLength(6);
    expect(sections[0].slug).toBe("00-foundations");
    expect(sections[5].slug).toBe("05-hybrid-jobs");
  });

  it("returns a section by slug", () => {
    const section = getSectionBySlug("02-algorithms");
    expect(section).toBeDefined();
    expect(section!.title).toBe("Quantum Algorithms");
    expect(section!.index).toBe(2);
  });

  it("returns undefined for unknown slug", () => {
    expect(getSectionBySlug("99-unknown")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Configure Jest**

Create `web/jest.config.ts`:

```typescript
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
};

export default config;
```

Add to `web/package.json` scripts: `"test": "jest"`

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/lib/sections.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement sections module**

Create `web/src/lib/sections.ts`:

```typescript
export interface Section {
  slug: string;
  title: string;
  index: number;
  dirName: string;
  notebookCount: number;
}

const sections: Section[] = [
  { slug: "00-foundations", title: "Quantum Computing Foundations", index: 0, dirName: "00-foundations", notebookCount: 5 },
  { slug: "01-hardware", title: "Quantum Hardware on Amazon Braket", index: 1, dirName: "01-hardware", notebookCount: 6 },
  { slug: "02-algorithms", title: "Quantum Algorithms", index: 2, dirName: "02-algorithms", notebookCount: 6 },
  { slug: "03-quantum-ml", title: "Quantum Machine Learning", index: 3, dirName: "03-quantum-ml", notebookCount: 7 },
  { slug: "04-quantum-chemistry", title: "Quantum Chemistry & Biochemistry", index: 4, dirName: "04-quantum-chemistry", notebookCount: 8 },
  { slug: "05-hybrid-jobs", title: "Production Hybrid Quantum-Classical Jobs", index: 5, dirName: "05-hybrid-jobs", notebookCount: 7 },
];

export function getSections(): Section[] {
  return sections;
}

export function getSectionBySlug(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/lib/sections.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Write failing test for content module**

Create `web/__tests__/lib/content.test.ts`:

```typescript
import { getContent, getContentSummary } from "@/lib/content";

describe("content", () => {
  it("reads GUIDE.md for a valid section", async () => {
    const content = await getContent("00-foundations");
    expect(content).toBeDefined();
    expect(content!.markdown).toContain("# Quantum Computing Foundations");
    expect(content!.title).toBe("Quantum Computing Foundations");
    expect(content!.notebooks.length).toBeGreaterThan(0);
  });

  it("returns null for unknown section", async () => {
    const content = await getContent("99-unknown");
    expect(content).toBeNull();
  });

  it("gets summary (first paragraph) for a section", async () => {
    const summary = await getContentSummary("00-foundations");
    expect(summary).toBeDefined();
    expect(summary!.length).toBeGreaterThan(10);
    expect(summary!.length).toBeLessThan(500);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/lib/content.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 8: Implement content module**

Create `web/src/lib/content.ts`:

```typescript
import fs from "fs/promises";
import path from "path";
import { getSectionBySlug } from "./sections";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export interface ContentData {
  markdown: string;
  title: string;
  notebooks: string[];
}

export async function getContent(slug: string): Promise<ContentData | null> {
  const section = getSectionBySlug(slug);
  if (!section) return null;

  const guidePath = path.join(REPO_ROOT, section.dirName, "GUIDE.md");

  try {
    const markdown = await fs.readFile(guidePath, "utf-8");
    const title = extractTitle(markdown);
    const notebooks = await listNotebooks(section.dirName);
    return { markdown, title, notebooks };
  } catch {
    return null;
  }
}

export async function getContentSummary(slug: string): Promise<string | null> {
  const content = await getContent(slug);
  if (!content) return null;

  const lines = content.markdown.split("\n");
  let summary = "";
  let foundHeading = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundHeading = true;
      continue;
    }
    if (foundHeading && line.trim() === "") continue;
    if (foundHeading && line.startsWith("## ")) break;
    if (foundHeading && line.trim()) {
      summary += line.trim() + " ";
    }
  }

  return summary.trim().slice(0, 300) || null;
}

function extractTitle(markdown: string): string {
  const match = markdown.match(/^# (.+)$/m);
  return match ? match[1] : "Untitled";
}

async function listNotebooks(dirName: string): Promise<string[]> {
  const notebooksDir = path.join(REPO_ROOT, dirName, "notebooks");
  try {
    const files = await fs.readdir(notebooksDir);
    return files.filter((f) => f.endsWith(".ipynb")).sort();
  } catch {
    return [];
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/lib/content.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/ web/__tests__/lib/ web/jest.config.ts
git commit -m "feat(web): add sections and content library with tests"
```

---

## Task 3: Theme Provider & Navigation

**Files:**
- Create: `web/src/components/theme-toggle.tsx`
- Create: `web/src/components/nav.tsx`
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Create theme toggle component**

Create `web/src/components/theme-toggle.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create nav component**

Create `web/src/components/nav.tsx`:

```tsx
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold hover:text-accent transition-colors">
          Quantum Workspace
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Update root layout**

Replace `web/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Nav } from "@/components/nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Quantum Computing Workspace",
  description: "A progressive learning path through quantum computing with Amazon Braket",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Nav />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify nav renders**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run dev
```

Open `http://localhost:3000`. Verify: nav bar with "Quantum Workspace" on left, theme toggle on right. Toggle switches between light/dark.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/theme-toggle.tsx web/src/components/nav.tsx web/src/app/layout.tsx
git commit -m "feat(web): add navigation bar with dark/light theme toggle"
```

---

## Task 4: Landing Page

**Files:**
- Create: `web/src/components/section-card.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Create section card component**

Create `web/src/components/section-card.tsx`:

```tsx
import Link from "next/link";

interface SectionCardProps {
  slug: string;
  index: number;
  title: string;
  summary: string;
  notebookCount: number;
}

export function SectionCard({ slug, index, title, summary, notebookCount }: SectionCardProps) {
  return (
    <Link
      href={`/learn/${slug}`}
      className="group block p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-accent dark:hover:border-accent transition-all hover:shadow-lg"
    >
      <div className="flex items-start gap-4">
        <span className="shrink-0 w-10 h-10 rounded-lg bg-accent/10 text-accent font-bold flex items-center justify-center text-sm">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-accent transition-colors">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {summary}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            {notebookCount} {notebookCount === 1 ? "notebook" : "notebooks"}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Build the landing page**

Replace `web/src/app/page.tsx` with:

```tsx
import { getSections } from "@/lib/sections";
import { getContentSummary } from "@/lib/content";
import { SectionCard } from "@/components/section-card";

export default async function HomePage() {
  const sections = getSections();
  const summaries = await Promise.all(
    sections.map((s) => getContentSummary(s.slug))
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <section className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Quantum Computing Workspace
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          A progressive learning path through quantum computing with Amazon Braket,
          from circuit fundamentals to production hybrid workloads.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Amazon Braket", "PennyLane", "OpenFermion"].map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-8">Learning Path</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section, i) => (
            <SectionCard
              key={section.slug}
              slug={section.slug}
              index={section.index}
              title={section.title}
              summary={summaries[i] || ""}
              notebookCount={section.notebookCount}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify landing page renders**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run dev
```

Open `http://localhost:3000`. Verify: hero title, subtitle, tech badges, 6 section cards with titles and summaries from GUIDE.md files.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/section-card.tsx web/src/app/page.tsx
git commit -m "feat(web): add landing page with section overview grid"
```

---

## Task 5: Markdown Renderer & Notebook Links

**Files:**
- Create: `web/src/components/markdown-renderer.tsx`
- Create: `web/src/components/notebook-link.tsx`
- Create: `web/__tests__/components/markdown-renderer.test.tsx`

- [ ] **Step 1: Write failing test for markdown renderer**

Create `web/__tests__/components/markdown-renderer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

jest.mock("rehype-highlight", () => () => {});

describe("MarkdownRenderer", () => {
  it("renders markdown headings", () => {
    render(<MarkdownRenderer content="## Hello World" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Hello World");
  });

  it("renders code blocks", () => {
    render(<MarkdownRenderer content={"```python\nprint('hi')\n```"} />);
    expect(screen.getByText("print('hi')")).toBeInTheDocument();
  });

  it("renders links", () => {
    render(<MarkdownRenderer content="[Click here](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/components/markdown-renderer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement markdown renderer**

Create `web/src/components/markdown-renderer.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <article className="prose prose-gray dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-accent hover:prose-a:text-accent-dark">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm test -- __tests__/components/markdown-renderer.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Create notebook link component**

Create `web/src/components/notebook-link.tsx`:

```tsx
interface NotebookLinkProps {
  filename: string;
  sectionDir: string;
}

export function NotebookLink({ filename, sectionDir }: NotebookLinkProps) {
  const repoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO || "https://github.com/altivum/quantum";
  const href = `${repoUrl}/blob/main/${sectionDir}/notebooks/${filename}`;
  const label = filename.replace(".ipynb", "").replace(/^\d+-/, "").replace(/-/g, " ");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-accent dark:hover:border-accent transition-colors group"
    >
      <svg className="w-5 h-5 text-gray-400 group-hover:text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate">
          {label}
        </p>
        <p className="text-xs text-gray-500 truncate">{filename}</p>
      </div>
    </a>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/markdown-renderer.tsx web/src/components/notebook-link.tsx web/__tests__/components/markdown-renderer.test.tsx
git commit -m "feat(web): add markdown renderer and notebook link components"
```

---

## Task 6: Sidebar Navigation

**Files:**
- Create: `web/src/components/sidebar.tsx`
- Create: `web/src/components/prev-next.tsx`

- [ ] **Step 1: Create sidebar component**

Create `web/src/components/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getSections } from "@/lib/sections";

export function Sidebar() {
  const pathname = usePathname();
  const sections = getSections();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 rounded-full bg-accent text-white shadow-lg"
        aria-label="Toggle navigation"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-16 left-0 z-40 w-72 h-[calc(100vh-4rem)] overflow-y-auto border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
          Learning Path
        </p>
        <nav className="space-y-1">
          {sections.map((section) => {
            const isActive = pathname === `/learn/${section.slug}`;
            return (
              <Link
                key={section.slug}
                href={`/learn/${section.slug}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900"
                }`}
              >
                <span className="shrink-0 w-6 h-6 rounded text-xs font-bold flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  {String(section.index).padStart(2, "0")}
                </span>
                <span className="truncate">{section.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Create prev/next component**

Create `web/src/components/prev-next.tsx`:

```tsx
import Link from "next/link";
import { getSections, type Section } from "@/lib/sections";

interface PrevNextProps {
  currentSlug: string;
}

export function PrevNext({ currentSlug }: PrevNextProps) {
  const sections = getSections();
  const currentIndex = sections.findIndex((s) => s.slug === currentSlug);
  const prev: Section | undefined = sections[currentIndex - 1];
  const next: Section | undefined = sections[currentIndex + 1];

  return (
    <div className="flex items-center justify-between mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
      {prev ? (
        <Link
          href={`/learn/${prev.slug}`}
          className="group flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-accent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>{prev.title}</span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/learn/${next.slug}`}
          className="group flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-accent transition-colors"
        >
          <span>{next.title}</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sidebar.tsx web/src/components/prev-next.tsx
git commit -m "feat(web): add sidebar navigation and prev/next controls"
```

---

## Task 7: Section Page

**Files:**
- Create: `web/src/app/learn/[section]/page.tsx`

- [ ] **Step 1: Create the section page**

Create `web/src/app/learn/[section]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getSections, getSectionBySlug } from "@/lib/sections";
import { getContent } from "@/lib/content";
import { Sidebar } from "@/components/sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { NotebookLink } from "@/components/notebook-link";
import { PrevNext } from "@/components/prev-next";

interface PageProps {
  params: Promise<{ section: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) return { title: "Not Found" };
  return {
    title: `${section.title} — Quantum Workspace`,
    description: `Learn ${section.title.toLowerCase()} with Amazon Braket`,
  };
}

export default async function SectionPage({ params }: PageProps) {
  const { section: slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) notFound();

  const content = await getContent(slug);
  if (!content) notFound();

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 lg:ml-72">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <MarkdownRenderer content={content.markdown} />

          {content.notebooks.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xl font-semibold mb-4">Notebooks</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {content.notebooks.map((nb) => (
                  <NotebookLink
                    key={nb}
                    filename={nb}
                    sectionDir={section.dirName}
                  />
                ))}
              </div>
            </section>
          )}

          <PrevNext currentSlug={slug} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify section page renders**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run dev
```

Open `http://localhost:3000/learn/00-foundations`. Verify: sidebar on left with all 6 sections (00 highlighted), GUIDE.md rendered as markdown in main area, notebook links at bottom, prev/next navigation (only "Next" since this is the first section).

- [ ] **Step 3: Test navigation flow**

Navigate through the full path:
1. `/` — click on "00 Foundations" card → goes to `/learn/00-foundations`
2. Click "Next" → goes to `/learn/01-hardware`
3. Sidebar: click "05 Hybrid Jobs" → jumps to `/learn/05-hybrid-jobs`
4. Verify "Previous" link shows, no "Next" link on last section
5. Click "Quantum Workspace" in nav → returns to `/`

- [ ] **Step 4: Test responsive behavior**

Resize browser to mobile width (~375px). Verify:
- Sidebar is hidden
- Floating menu button appears bottom-right
- Tapping it opens sidebar as overlay
- Tapping outside closes it

- [ ] **Step 5: Commit**

```bash
git add web/src/app/learn/
git commit -m "feat(web): add section pages with markdown rendering and navigation"
```

---

## Task 8: Polish & Deploy Config

**Files:**
- Modify: `web/src/app/globals.css` (add highlight.js theme import)
- Create: `web/public/favicon.ico` (optional, skip if not needed)
- Modify: `web/amplify.yml` (verify final config)
- Modify: `web/.gitignore`

- [ ] **Step 1: Add syntax highlighting CSS**

Add to top of `web/src/app/globals.css` (after tailwind imports):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import "highlight.js/styles/github-dark.css";

@layer base {
  body {
    @apply bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100;
  }
}

@layer components {
  .prose pre {
    @apply bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto;
  }

  .prose code {
    @apply text-accent dark:text-accent-light;
  }

  .prose pre code {
    @apply text-gray-800 dark:text-gray-200;
  }
}
```

- [ ] **Step 2: Add `.gitignore` for web directory**

Create `web/.gitignore`:

```
node_modules/
.next/
.env.local
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run build
```

Expected: Build completes successfully. Output shows static/SSR pages generated.

- [ ] **Step 4: Verify production mode works**

```bash
cd /Users/cperez/Desktop/local/altivum-dev/quantum/web
npm run start
```

Open `http://localhost:3000`. Verify all pages render correctly in production mode.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(web): add syntax highlighting and finalize build config"
```

---

## Task 9: Amplify Deployment

**Files:**
- Verify: `web/amplify.yml`

- [ ] **Step 1: Verify Amplify config is correct**

Read `web/amplify.yml` and confirm it matches:

```yaml
version: 1
applications:
  - appRoot: web
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - "**/*"
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
```

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Deploy via Amplify Console**

1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Connect to the GitHub repository
4. Amplify auto-detects `amplify.yml` and the Next.js framework
5. Set environment variable: `NEXT_PUBLIC_GITHUB_REPO` = your repo URL
6. Deploy

- [ ] **Step 4: Verify deployment**

Once deployed, visit the Amplify-provided URL (e.g., `https://main.d1234abcd.amplifyapp.com`). Verify:
- Landing page loads with all 6 sections
- Section pages render GUIDE.md content
- Theme toggle works
- Notebook links point to correct GitHub URLs
- Mobile responsive behavior works

- [ ] **Step 5: (Optional) Add custom domain**

In Amplify Console → Domain management → Add domain. Follow the DNS verification steps.
