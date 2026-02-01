# Smart Collections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add smart collections to Project Opener for organizing scattered projects with auto-detection and manual tagging.

**Architecture:** Extend existing settings storage with collections and sources. Add new files for collection management, multi-source scanning, and smart search. Modify the main list view to display sectioned results grouped by collection.

**Tech Stack:** TypeScript, React, Raycast API, Bun for testing

---

## Phase 1: Data Model Foundation

### Task 1: Extend Types and Interfaces

**Files:**
- Create: `src/types.ts`
- Modify: `src/settings.ts:10-15`

**Step 1: Write the failing test for new types**

Create `src/types.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type {
  Collection,
  AutoCriteria,
  SourceDirectory,
  EnhancedProject,
} from "./types";

describe("types", () => {
  test("Collection type has required properties", () => {
    const collection: Collection = {
      id: "work",
      name: "Work",
      type: "manual",
    };
    expect(collection.id).toBe("work");
    expect(collection.name).toBe("Work");
    expect(collection.type).toBe("manual");
  });

  test("Collection type supports optional properties", () => {
    const collection: Collection = {
      id: "_recent",
      name: "Recent",
      type: "auto",
      icon: "Clock",
      color: "#1E88E5",
      criteria: { kind: "recent", days: 7 },
    };
    expect(collection.criteria?.kind).toBe("recent");
  });

  test("SourceDirectory type has required properties", () => {
    const source: SourceDirectory = {
      id: "source-1",
      path: "~/projects",
      depth: 2,
    };
    expect(source.id).toBe("source-1");
    expect(source.path).toBe("~/projects");
    expect(source.depth).toBe(2);
  });

  test("EnhancedProject extends base Project", () => {
    const project: EnhancedProject = {
      name: "my-project",
      path: "/Users/me/projects/my-project",
      relativePath: "my-project",
      collections: ["work"],
      lastOpened: Date.now(),
      sourceId: "source-1",
      detectedLang: "typescript",
      gitOrg: "acme-corp",
    };
    expect(project.collections).toContain("work");
    expect(project.sourceId).toBe("source-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/types.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Create types file**

Create `src/types.ts`:

```typescript
import type { Project } from "./utils";
import type { ProjectIDE } from "./settings";

export interface AutoCriteria {
  kind: "recent" | "stale" | "git-org" | "uncategorized";
  days?: number;
  orgName?: string;
}

export interface Collection {
  id: string;
  name: string;
  type: "auto" | "manual";
  icon?: string;
  color?: string;
  criteria?: AutoCriteria;
}

export interface SourceDirectory {
  id: string;
  path: string;
  depth: number;
  defaultCollection?: string;
  defaultIde?: ProjectIDE;
}

export interface EnhancedProject extends Project {
  collections: string[];
  lastOpened?: number;
  sourceId?: string;
  detectedLang?: string;
  gitOrg?: string;
}

export const AUTO_COLLECTIONS: Collection[] = [
  { id: "_recent", name: "Recent", type: "auto", icon: "Clock", criteria: { kind: "recent", days: 7 } },
  { id: "_month", name: "This Month", type: "auto", icon: "Calendar", criteria: { kind: "recent", days: 30 } },
  { id: "_stale", name: "Stale", type: "auto", icon: "ExclamationMark", criteria: { kind: "stale", days: 90 } },
  { id: "_uncategorized", name: "Uncategorized", type: "auto", icon: "QuestionMark", criteria: { kind: "uncategorized" } },
];
```

**Step 4: Run test to verify it passes**

Run: `bun test src/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/types.test.ts
git commit -m "$(cat <<'EOF'
feat: add types for collections and source directories

Introduces Collection, SourceDirectory, EnhancedProject types
for the smart collections feature.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend ProjectSettings with Collections Data

**Files:**
- Modify: `src/settings.ts:10-15`
- Modify: `src/settings.ts:55-65`
- Modify: `src/settings.test.ts`

**Step 1: Write the failing test for extended settings**

Add to `src/settings.test.ts` (after existing tests):

```typescript
describe("extended settings", () => {
  test("saves and loads collections array", () => {
    saveProjectSettings("/project", {
      displayName: "Test",
      collections: ["work", "frontend"],
    });

    const settings = getProjectSettings("/project");
    expect(settings.collections).toEqual(["work", "frontend"]);
  });

  test("saves and loads lastOpened timestamp", () => {
    const now = Date.now();
    saveProjectSettings("/project", {
      lastOpened: now,
    });

    const settings = getProjectSettings("/project");
    expect(settings.lastOpened).toBe(now);
  });

  test("keeps project with only collections", () => {
    saveProjectSettings("/project", {
      collections: ["work"],
    });

    const saved = JSON.parse(readFileSync(TEST_SETTINGS_FILE, "utf-8"));
    expect(saved["/project"]).toBeDefined();
    expect(saved["/project"].collections).toEqual(["work"]);
  });

  test("keeps project with only lastOpened", () => {
    const now = Date.now();
    saveProjectSettings("/project", {
      lastOpened: now,
    });

    const saved = JSON.parse(readFileSync(TEST_SETTINGS_FILE, "utf-8"));
    expect(saved["/project"]).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/settings.test.ts`
Expected: FAIL with "collections" not defined

**Step 3: Update ProjectSettings interface**

In `src/settings.ts`, update the interface:

```typescript
export interface ProjectSettings {
  displayName?: string;
  icon?: string;
  iconColor?: string;
  ide?: ProjectIDE;
  collections?: string[];
  lastOpened?: number;
}
```

**Step 4: Update saveProjectSettings empty check**

In `src/settings.ts`, update the empty check in `saveProjectSettings`:

```typescript
export function saveProjectSettings(
  projectPath: string,
  settings: ProjectSettings,
): void {
  ensureSettingsDir();
  const store = loadAllSettings();

  // Remove empty settings
  const hasContent =
    settings.displayName ||
    settings.icon ||
    settings.iconColor ||
    settings.ide ||
    (settings.collections && settings.collections.length > 0) ||
    settings.lastOpened;

  if (!hasContent) {
    delete store[projectPath];
  } else {
    store[projectPath] = settings;
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(store, null, 2));
}
```

**Step 5: Update test mock to match**

In `src/settings.test.ts`, update the local `ProjectSettings` interface:

```typescript
interface ProjectSettings {
  displayName?: string;
  icon?: string;
  iconColor?: string;
  ide?: ProjectIDE;
  collections?: string[];
  lastOpened?: number;
}
```

And update the local `saveProjectSettings` function empty check:

```typescript
function saveProjectSettings(
  projectPath: string,
  settings: ProjectSettings,
): void {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  const store = loadAllSettings();

  const hasContent =
    settings.displayName ||
    settings.icon ||
    settings.iconColor ||
    settings.ide ||
    (settings.collections && settings.collections.length > 0) ||
    settings.lastOpened;

  if (!hasContent) {
    delete store[projectPath];
  } else {
    store[projectPath] = settings;
  }

  writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(store, null, 2));
}
```

**Step 6: Run test to verify it passes**

Run: `bun test src/settings.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "$(cat <<'EOF'
feat: extend ProjectSettings with collections and lastOpened

Adds collections array and lastOpened timestamp to project
settings for smart collections feature.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Collections Storage

### Task 3: Create Collections Storage Module

**Files:**
- Create: `src/collections.ts`
- Create: `src/collections.test.ts`

**Step 1: Write the failing test**

Create `src/collections.test.ts`:

```typescript
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "project-opener-test-collections");
const TEST_COLLECTIONS_FILE = join(TEST_DIR, "collections.json");

import type { Collection } from "./types";

// Replicate functions with test path
function loadCollections(): Collection[] {
  try {
    if (existsSync(TEST_COLLECTIONS_FILE)) {
      const data = readFileSync(TEST_COLLECTIONS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    return [];
  }
  return [];
}

function saveCollections(collections: Collection[]): void {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  writeFileSync(TEST_COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
}

function createCollection(collection: Omit<Collection, "id">): Collection {
  const id = `coll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newCollection: Collection = { ...collection, id };
  const collections = loadCollections();
  collections.push(newCollection);
  saveCollections(collections);
  return newCollection;
}

function updateCollection(id: string, updates: Partial<Omit<Collection, "id" | "type">>): Collection | null {
  const collections = loadCollections();
  const index = collections.findIndex((c) => c.id === id);
  if (index === -1) return null;
  collections[index] = { ...collections[index], ...updates };
  saveCollections(collections);
  return collections[index];
}

function deleteCollection(id: string): boolean {
  const collections = loadCollections();
  const filtered = collections.filter((c) => c.id !== id);
  if (filtered.length === collections.length) return false;
  saveCollections(filtered);
  return true;
}

describe("collections storage", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(TEST_COLLECTIONS_FILE)) {
      rmSync(TEST_COLLECTIONS_FILE);
    }
  });

  describe("loadCollections", () => {
    test("returns empty array when no file exists", () => {
      const collections = loadCollections();
      expect(collections).toEqual([]);
    });

    test("loads collections from file", () => {
      const testCollections: Collection[] = [
        { id: "work", name: "Work", type: "manual" },
      ];
      writeFileSync(TEST_COLLECTIONS_FILE, JSON.stringify(testCollections));

      const collections = loadCollections();
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe("Work");
    });
  });

  describe("createCollection", () => {
    test("creates collection with generated id", () => {
      const collection = createCollection({ name: "Personal", type: "manual" });
      expect(collection.id).toMatch(/^coll_/);
      expect(collection.name).toBe("Personal");
    });

    test("persists collection to file", () => {
      createCollection({ name: "Work", type: "manual" });
      const loaded = loadCollections();
      expect(loaded).toHaveLength(1);
    });
  });

  describe("updateCollection", () => {
    test("updates existing collection", () => {
      const created = createCollection({ name: "Old Name", type: "manual" });
      const updated = updateCollection(created.id, { name: "New Name" });
      expect(updated?.name).toBe("New Name");
    });

    test("returns null for non-existent collection", () => {
      const result = updateCollection("non-existent", { name: "Test" });
      expect(result).toBeNull();
    });
  });

  describe("deleteCollection", () => {
    test("deletes existing collection", () => {
      const created = createCollection({ name: "To Delete", type: "manual" });
      const result = deleteCollection(created.id);
      expect(result).toBe(true);
      expect(loadCollections()).toHaveLength(0);
    });

    test("returns false for non-existent collection", () => {
      const result = deleteCollection("non-existent");
      expect(result).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/collections.test.ts`
Expected: PASS (tests use local implementations)

**Step 3: Create collections module**

Create `src/collections.ts`:

```typescript
import { environment } from "@raycast/api";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { Collection, EnhancedProject, AUTO_COLLECTIONS } from "./types";
import { AUTO_COLLECTIONS as DEFAULT_AUTO_COLLECTIONS } from "./types";

const COLLECTIONS_FILE = join(environment.supportPath, "collections.json");

function ensureCollectionsDir(): void {
  const dir = dirname(COLLECTIONS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadCollections(): Collection[] {
  try {
    if (existsSync(COLLECTIONS_FILE)) {
      const data = readFileSync(COLLECTIONS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    return [];
  }
  return [];
}

export function saveCollections(collections: Collection[]): void {
  ensureCollectionsDir();
  writeFileSync(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
}

export function createCollection(
  collection: Omit<Collection, "id">,
): Collection {
  const id = `coll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newCollection: Collection = { ...collection, id };
  const collections = loadCollections();
  collections.push(newCollection);
  saveCollections(collections);
  return newCollection;
}

export function updateCollection(
  id: string,
  updates: Partial<Omit<Collection, "id" | "type">>,
): Collection | null {
  const collections = loadCollections();
  const index = collections.findIndex((c) => c.id === id);
  if (index === -1) return null;
  collections[index] = { ...collections[index], ...updates };
  saveCollections(collections);
  return collections[index];
}

export function deleteCollection(id: string): boolean {
  const collections = loadCollections();
  const filtered = collections.filter((c) => c.id !== id);
  if (filtered.length === collections.length) return false;
  saveCollections(filtered);
  return true;
}

export function getAllCollections(): Collection[] {
  const manual = loadCollections();
  return [...manual, ...DEFAULT_AUTO_COLLECTIONS];
}

export function getCollectionById(id: string): Collection | undefined {
  return getAllCollections().find((c) => c.id === id);
}

export function isAutoCollection(id: string): boolean {
  return id.startsWith("_");
}

export function matchesAutoCollection(
  project: EnhancedProject,
  collection: Collection,
): boolean {
  if (collection.type !== "auto" || !collection.criteria) return false;

  const now = Date.now();
  const days = collection.criteria.days || 0;
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  switch (collection.criteria.kind) {
    case "recent":
      return (project.lastOpened || 0) >= cutoff;
    case "stale":
      return project.lastOpened !== undefined && project.lastOpened < cutoff;
    case "git-org":
      return project.gitOrg === collection.criteria.orgName;
    case "uncategorized":
      return !project.collections || project.collections.length === 0;
    default:
      return false;
  }
}
```

**Step 4: Run all tests**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/collections.ts src/collections.test.ts
git commit -m "$(cat <<'EOF'
feat: add collections storage and CRUD operations

Implements collection storage with create, update, delete
operations. Includes auto-collection matching logic.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Multi-Source Directory Support

### Task 4: Create Sources Storage Module

**Files:**
- Create: `src/sources.ts`
- Create: `src/sources.test.ts`

**Step 1: Write the failing test**

Create `src/sources.test.ts`:

```typescript
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "project-opener-test-sources");
const TEST_SOURCES_FILE = join(TEST_DIR, "sources.json");

import type { SourceDirectory } from "./types";

function loadSources(): SourceDirectory[] {
  try {
    if (existsSync(TEST_SOURCES_FILE)) {
      const data = readFileSync(TEST_SOURCES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    return [];
  }
  return [];
}

function saveSources(sources: SourceDirectory[]): void {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  writeFileSync(TEST_SOURCES_FILE, JSON.stringify(sources, null, 2));
}

function addSource(source: Omit<SourceDirectory, "id">): SourceDirectory {
  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newSource: SourceDirectory = { ...source, id };
  const sources = loadSources();
  sources.push(newSource);
  saveSources(sources);
  return newSource;
}

function updateSource(
  id: string,
  updates: Partial<Omit<SourceDirectory, "id">>,
): SourceDirectory | null {
  const sources = loadSources();
  const index = sources.findIndex((s) => s.id === id);
  if (index === -1) return null;
  sources[index] = { ...sources[index], ...updates };
  saveSources(sources);
  return sources[index];
}

function deleteSource(id: string): boolean {
  const sources = loadSources();
  const filtered = sources.filter((s) => s.id !== id);
  if (filtered.length === sources.length) return false;
  saveSources(filtered);
  return true;
}

describe("sources storage", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(TEST_SOURCES_FILE)) {
      rmSync(TEST_SOURCES_FILE);
    }
  });

  describe("loadSources", () => {
    test("returns empty array when no file exists", () => {
      expect(loadSources()).toEqual([]);
    });

    test("loads sources from file", () => {
      const testSources: SourceDirectory[] = [
        { id: "src-1", path: "~/projects", depth: 2 },
      ];
      writeFileSync(TEST_SOURCES_FILE, JSON.stringify(testSources));
      expect(loadSources()).toHaveLength(1);
    });
  });

  describe("addSource", () => {
    test("creates source with generated id", () => {
      const source = addSource({ path: "~/work", depth: 1 });
      expect(source.id).toMatch(/^src_/);
      expect(source.path).toBe("~/work");
    });

    test("includes optional properties", () => {
      const source = addSource({
        path: "~/clients",
        depth: 2,
        defaultCollection: "clients",
      });
      expect(source.defaultCollection).toBe("clients");
    });
  });

  describe("updateSource", () => {
    test("updates existing source", () => {
      const created = addSource({ path: "~/old", depth: 1 });
      const updated = updateSource(created.id, { depth: 3 });
      expect(updated?.depth).toBe(3);
    });

    test("returns null for non-existent source", () => {
      expect(updateSource("fake", { depth: 2 })).toBeNull();
    });
  });

  describe("deleteSource", () => {
    test("deletes existing source", () => {
      const created = addSource({ path: "~/temp", depth: 1 });
      expect(deleteSource(created.id)).toBe(true);
      expect(loadSources()).toHaveLength(0);
    });

    test("returns false for non-existent source", () => {
      expect(deleteSource("fake")).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/sources.test.ts`
Expected: PASS (uses local implementations)

**Step 3: Create sources module**

Create `src/sources.ts`:

```typescript
import { environment } from "@raycast/api";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { SourceDirectory, EnhancedProject } from "./types";
import { findProjects, expandPath } from "./utils";

const SOURCES_FILE = join(environment.supportPath, "sources.json");

function ensureSourcesDir(): void {
  const dir = dirname(SOURCES_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadSources(): SourceDirectory[] {
  try {
    if (existsSync(SOURCES_FILE)) {
      const data = readFileSync(SOURCES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    return [];
  }
  return [];
}

export function saveSources(sources: SourceDirectory[]): void {
  ensureSourcesDir();
  writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2));
}

export function addSource(
  source: Omit<SourceDirectory, "id">,
): SourceDirectory {
  const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newSource: SourceDirectory = { ...source, id };
  const sources = loadSources();
  sources.push(newSource);
  saveSources(sources);
  return newSource;
}

export function updateSource(
  id: string,
  updates: Partial<Omit<SourceDirectory, "id">>,
): SourceDirectory | null {
  const sources = loadSources();
  const index = sources.findIndex((s) => s.id === id);
  if (index === -1) return null;
  sources[index] = { ...sources[index], ...updates };
  saveSources(sources);
  return sources[index];
}

export function deleteSource(id: string): boolean {
  const sources = loadSources();
  const filtered = sources.filter((s) => s.id !== id);
  if (filtered.length === sources.length) return false;
  saveSources(filtered);
  return true;
}

export function getSourceById(id: string): SourceDirectory | undefined {
  return loadSources().find((s) => s.id === id);
}

export function findProjectsFromAllSources(): EnhancedProject[] {
  const sources = loadSources();
  const seenPaths = new Set<string>();
  const projects: EnhancedProject[] = [];

  for (const source of sources) {
    const found = findProjects(source.path, source.depth);

    for (const project of found) {
      const normalizedPath = expandPath(project.path);
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      projects.push({
        ...project,
        collections: source.defaultCollection ? [source.defaultCollection] : [],
        sourceId: source.id,
      });
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}
```

**Step 4: Run all tests**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sources.ts src/sources.test.ts
git commit -m "$(cat <<'EOF'
feat: add multi-source directory storage

Implements source directory storage with CRUD operations
and findProjectsFromAllSources for scanning multiple directories.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Language Detection and Git Org Extraction

### Task 5: Add Language Detection

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/utils.test.ts`

**Step 1: Write the failing test**

Add to `src/utils.test.ts`:

```typescript
describe("detectLanguage", () => {
  const testDir = join(tmpdir(), "project-opener-test-detectLang");

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("detects typescript from package.json", () => {
    const projectDir = join(testDir, "ts-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "package.json"), "{}");
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    expect(detectLanguage(projectDir)).toBe("typescript");
  });

  test("detects javascript from package.json only", () => {
    const projectDir = join(testDir, "js-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "package.json"), "{}");
    expect(detectLanguage(projectDir)).toBe("javascript");
  });

  test("detects rust from Cargo.toml", () => {
    const projectDir = join(testDir, "rust-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "Cargo.toml"), "");
    expect(detectLanguage(projectDir)).toBe("rust");
  });

  test("detects go from go.mod", () => {
    const projectDir = join(testDir, "go-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "go.mod"), "");
    expect(detectLanguage(projectDir)).toBe("go");
  });

  test("detects python from pyproject.toml", () => {
    const projectDir = join(testDir, "py-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "pyproject.toml"), "");
    expect(detectLanguage(projectDir)).toBe("python");
  });

  test("returns undefined for unknown project type", () => {
    const projectDir = join(testDir, "unknown-project");
    mkdirSync(projectDir, { recursive: true });
    expect(detectLanguage(projectDir)).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/utils.test.ts`
Expected: FAIL with "detectLanguage is not defined"

**Step 3: Implement detectLanguage**

Add to `src/utils.ts`:

```typescript
export function detectLanguage(dirPath: string): string | undefined {
  // Order matters: more specific checks first
  if (existsSync(join(dirPath, "Cargo.toml"))) return "rust";
  if (existsSync(join(dirPath, "go.mod"))) return "go";
  if (existsSync(join(dirPath, "pyproject.toml"))) return "python";
  if (existsSync(join(dirPath, "pom.xml"))) return "java";
  if (existsSync(join(dirPath, "build.gradle"))) return "kotlin";
  if (existsSync(join(dirPath, "CMakeLists.txt"))) return "cpp";

  // Check for TypeScript vs JavaScript
  if (existsSync(join(dirPath, "package.json"))) {
    if (existsSync(join(dirPath, "tsconfig.json"))) return "typescript";
    return "javascript";
  }

  return undefined;
}
```

**Step 4: Add import to test file**

Update import in `src/utils.test.ts`:

```typescript
import {
  expandPath,
  isProject,
  findProjects,
  detectLanguage,
  PROJECT_MARKERS,
  EXCLUDED_DIRS,
} from "./utils";
```

**Step 5: Run test to verify it passes**

Run: `bun test src/utils.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils.ts src/utils.test.ts
git commit -m "$(cat <<'EOF'
feat: add language detection from marker files

Detects project language (typescript, javascript, rust, go,
python, java, kotlin, cpp) based on config file presence.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add Git Org Extraction

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/utils.test.ts`

**Step 1: Write the failing test**

Add to `src/utils.test.ts`:

```typescript
describe("extractGitOrg", () => {
  const testDir = join(tmpdir(), "project-opener-test-gitorg");

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("extracts org from github https URL", () => {
    const projectDir = join(testDir, "github-https");
    mkdirSync(join(projectDir, ".git"), { recursive: true });
    writeFileSync(
      join(projectDir, ".git", "config"),
      `[remote "origin"]
	url = https://github.com/acme-corp/my-project.git
	fetch = +refs/heads/*:refs/remotes/origin/*`,
    );
    expect(extractGitOrg(projectDir)).toBe("acme-corp");
  });

  test("extracts org from github ssh URL", () => {
    const projectDir = join(testDir, "github-ssh");
    mkdirSync(join(projectDir, ".git"), { recursive: true });
    writeFileSync(
      join(projectDir, ".git", "config"),
      `[remote "origin"]
	url = git@github.com:my-org/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*`,
    );
    expect(extractGitOrg(projectDir)).toBe("my-org");
  });

  test("extracts org from gitlab URL", () => {
    const projectDir = join(testDir, "gitlab");
    mkdirSync(join(projectDir, ".git"), { recursive: true });
    writeFileSync(
      join(projectDir, ".git", "config"),
      `[remote "origin"]
	url = https://gitlab.com/company/project.git`,
    );
    expect(extractGitOrg(projectDir)).toBe("company");
  });

  test("returns undefined for non-git directory", () => {
    const projectDir = join(testDir, "no-git");
    mkdirSync(projectDir, { recursive: true });
    expect(extractGitOrg(projectDir)).toBeUndefined();
  });

  test("returns undefined for git dir without remote", () => {
    const projectDir = join(testDir, "no-remote");
    mkdirSync(join(projectDir, ".git"), { recursive: true });
    writeFileSync(join(projectDir, ".git", "config"), "[core]\n\tbare = false");
    expect(extractGitOrg(projectDir)).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/utils.test.ts`
Expected: FAIL with "extractGitOrg is not defined"

**Step 3: Implement extractGitOrg**

Add to `src/utils.ts`:

```typescript
export function extractGitOrg(dirPath: string): string | undefined {
  const gitConfigPath = join(dirPath, ".git", "config");
  if (!existsSync(gitConfigPath)) return undefined;

  try {
    const config = readFileSync(gitConfigPath, "utf-8");

    // Match remote origin URL
    const urlMatch = config.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (!urlMatch) return undefined;

    const url = urlMatch[1].trim();

    // Handle SSH format: git@github.com:org/repo.git
    const sshMatch = url.match(/git@[^:]+:([^/]+)\//);
    if (sshMatch) return sshMatch[1];

    // Handle HTTPS format: https://github.com/org/repo.git
    const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+)\//);
    if (httpsMatch) return httpsMatch[1];

    return undefined;
  } catch {
    return undefined;
  }
}
```

Add `readFileSync` to existing imports if not present.

**Step 4: Update test imports**

```typescript
import {
  expandPath,
  isProject,
  findProjects,
  detectLanguage,
  extractGitOrg,
  PROJECT_MARKERS,
  EXCLUDED_DIRS,
} from "./utils";
```

**Step 5: Run test to verify it passes**

Run: `bun test src/utils.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/utils.ts src/utils.test.ts
git commit -m "$(cat <<'EOF'
feat: add git org extraction from remote URL

Parses .git/config to extract organization name from
github/gitlab remote URLs (both SSH and HTTPS formats).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Smart Search

### Task 7: Create Search Parser

**Files:**
- Create: `src/search.ts`
- Create: `src/search.test.ts`

**Step 1: Write the failing test**

Create `src/search.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { parseSearchQuery, matchesSearch } from "./search";
import type { EnhancedProject } from "./types";

describe("parseSearchQuery", () => {
  test("parses plain text", () => {
    const result = parseSearchQuery("my project");
    expect(result.text).toBe("my project");
    expect(result.filters).toEqual({});
  });

  test("parses collection filter", () => {
    const result = parseSearchQuery("#work");
    expect(result.text).toBe("");
    expect(result.filters.collection).toBe("work");
  });

  test("parses language filter", () => {
    const result = parseSearchQuery("lang:typescript");
    expect(result.filters.lang).toBe("typescript");
  });

  test("parses org filter", () => {
    const result = parseSearchQuery("org:acme");
    expect(result.filters.org).toBe("acme");
  });

  test("parses in: path filter", () => {
    const result = parseSearchQuery("in:~/work");
    expect(result.filters.inPath).toBe("~/work");
  });

  test("parses special collection filters", () => {
    expect(parseSearchQuery("#recent").filters.collection).toBe("_recent");
    expect(parseSearchQuery("#stale").filters.collection).toBe("_stale");
  });

  test("parses combined filters and text", () => {
    const result = parseSearchQuery("#work lang:typescript api");
    expect(result.text).toBe("api");
    expect(result.filters.collection).toBe("work");
    expect(result.filters.lang).toBe("typescript");
  });
});

describe("matchesSearch", () => {
  const baseProject: EnhancedProject = {
    name: "my-api",
    path: "/Users/me/work/my-api",
    relativePath: "my-api",
    collections: ["work"],
    lastOpened: Date.now(),
    detectedLang: "typescript",
    gitOrg: "acme-corp",
  };

  test("matches text in project name", () => {
    const query = parseSearchQuery("api");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("does not match non-matching text", () => {
    const query = parseSearchQuery("frontend");
    expect(matchesSearch(baseProject, query)).toBe(false);
  });

  test("matches collection filter", () => {
    const query = parseSearchQuery("#work");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("does not match wrong collection", () => {
    const query = parseSearchQuery("#personal");
    expect(matchesSearch(baseProject, query)).toBe(false);
  });

  test("matches language filter", () => {
    const query = parseSearchQuery("lang:typescript");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("matches org filter", () => {
    const query = parseSearchQuery("org:acme");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("matches path filter", () => {
    const query = parseSearchQuery("in:/Users/me/work");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("matches combined filters", () => {
    const query = parseSearchQuery("#work lang:typescript api");
    expect(matchesSearch(baseProject, query)).toBe(true);
  });

  test("fails if any filter does not match", () => {
    const query = parseSearchQuery("#personal lang:typescript");
    expect(matchesSearch(baseProject, query)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/search.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement search module**

Create `src/search.ts`:

```typescript
import type { EnhancedProject } from "./types";
import { expandPath } from "./utils";

export interface SearchFilters {
  collection?: string;
  lang?: string;
  org?: string;
  inPath?: string;
}

export interface ParsedSearch {
  text: string;
  filters: SearchFilters;
}

const SPECIAL_COLLECTIONS: Record<string, string> = {
  recent: "_recent",
  stale: "_stale",
  month: "_month",
  uncategorized: "_uncategorized",
};

export function parseSearchQuery(query: string): ParsedSearch {
  const filters: SearchFilters = {};
  const textParts: string[] = [];

  const tokens = query.trim().split(/\s+/);

  for (const token of tokens) {
    if (token.startsWith("#")) {
      const collName = token.slice(1).toLowerCase();
      filters.collection = SPECIAL_COLLECTIONS[collName] || collName;
    } else if (token.startsWith("lang:")) {
      filters.lang = token.slice(5).toLowerCase();
    } else if (token.startsWith("org:")) {
      filters.org = token.slice(4).toLowerCase();
    } else if (token.startsWith("in:")) {
      filters.inPath = token.slice(3);
    } else if (token) {
      textParts.push(token);
    }
  }

  return {
    text: textParts.join(" "),
    filters,
  };
}

export function matchesSearch(
  project: EnhancedProject,
  query: ParsedSearch,
): boolean {
  // Check text match
  if (query.text) {
    const searchText = query.text.toLowerCase();
    const projectName = project.name.toLowerCase();
    if (!projectName.includes(searchText)) {
      return false;
    }
  }

  // Check collection filter
  if (query.filters.collection) {
    const hasCollection = project.collections?.includes(query.filters.collection);
    if (!hasCollection) return false;
  }

  // Check language filter
  if (query.filters.lang) {
    if (project.detectedLang?.toLowerCase() !== query.filters.lang) {
      return false;
    }
  }

  // Check org filter
  if (query.filters.org) {
    if (!project.gitOrg?.toLowerCase().includes(query.filters.org)) {
      return false;
    }
  }

  // Check path filter
  if (query.filters.inPath) {
    const expandedFilter = expandPath(query.filters.inPath);
    if (!project.path.startsWith(expandedFilter)) {
      return false;
    }
  }

  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/search.ts src/search.test.ts
git commit -m "$(cat <<'EOF'
feat: add smart search with filter syntax

Implements search parser supporting #collection, lang:,
org:, and in: filters with text matching.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Recency Tracking

### Task 8: Add Recency Utilities

**Files:**
- Create: `src/recency.ts`
- Create: `src/recency.test.ts`

**Step 1: Write the failing test**

Create `src/recency.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  formatRelativeTime,
  getRecencyIndicator,
  isRecentProject,
  isStaleProject,
} from "./recency";

describe("formatRelativeTime", () => {
  test("returns 'just now' for recent timestamps", () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  test("returns minutes ago", () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 minutes ago");
  });

  test("returns hours ago", () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    expect(formatRelativeTime(twoHoursAgo)).toBe("2 hours ago");
  });

  test("returns days ago", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(threeDaysAgo)).toBe("3 days ago");
  });

  test("returns weeks ago", () => {
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(twoWeeksAgo)).toBe("2 weeks ago");
  });

  test("returns months ago", () => {
    const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(threeMonthsAgo)).toBe("3 months ago");
  });

  test("returns undefined for no timestamp", () => {
    expect(formatRelativeTime(undefined)).toBeUndefined();
  });
});

describe("getRecencyIndicator", () => {
  test("returns blue for today", () => {
    const now = Date.now();
    expect(getRecencyIndicator(now)).toBe("blue");
  });

  test("returns undefined for normal recency", () => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(getRecencyIndicator(weekAgo)).toBeUndefined();
  });

  test("returns red for stale (90+ days)", () => {
    const stale = Date.now() - 100 * 24 * 60 * 60 * 1000;
    expect(getRecencyIndicator(stale)).toBe("red");
  });
});

describe("isRecentProject", () => {
  test("returns true for projects opened in last 7 days", () => {
    const recent = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(isRecentProject(recent)).toBe(true);
  });

  test("returns false for older projects", () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    expect(isRecentProject(old)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isRecentProject(undefined)).toBe(false);
  });
});

describe("isStaleProject", () => {
  test("returns true for projects not opened in 90+ days", () => {
    const stale = Date.now() - 100 * 24 * 60 * 60 * 1000;
    expect(isStaleProject(stale)).toBe(true);
  });

  test("returns false for recent projects", () => {
    const recent = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(isStaleProject(recent)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isStaleProject(undefined)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/recency.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement recency module**

Create `src/recency.ts`:

```typescript
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

const RECENT_DAYS = 7;
const STALE_DAYS = 90;

export function formatRelativeTime(timestamp: number | undefined): string | undefined {
  if (timestamp === undefined) return undefined;

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(diff / MONTH);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function getRecencyIndicator(
  timestamp: number | undefined,
): "blue" | "red" | undefined {
  if (timestamp === undefined) return undefined;

  const now = Date.now();
  const diff = now - timestamp;

  // Opened today
  if (diff < DAY) return "blue";

  // Stale (90+ days)
  if (diff >= STALE_DAYS * DAY) return "red";

  return undefined;
}

export function isRecentProject(timestamp: number | undefined): boolean {
  if (timestamp === undefined) return false;
  return Date.now() - timestamp < RECENT_DAYS * DAY;
}

export function isStaleProject(timestamp: number | undefined): boolean {
  if (timestamp === undefined) return false;
  return Date.now() - timestamp >= STALE_DAYS * DAY;
}

export function updateLastOpened(projectPath: string): void {
  // Import here to avoid circular dependency
  const { getProjectSettings, saveProjectSettings } = require("./settings");
  const settings = getProjectSettings(projectPath);
  saveProjectSettings(projectPath, {
    ...settings,
    lastOpened: Date.now(),
  });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/recency.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/recency.ts src/recency.test.ts
git commit -m "$(cat <<'EOF'
feat: add recency tracking utilities

Implements relative time formatting, recency indicators,
and helpers for recent/stale project detection.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Migration

### Task 9: Add Migration Logic

**Files:**
- Create: `src/migration.ts`
- Create: `src/migration.test.ts`

**Step 1: Write the failing test**

Create `src/migration.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "project-opener-test-migration");
const TEST_SOURCES_FILE = join(TEST_DIR, "sources.json");
const TEST_MIGRATION_FILE = join(TEST_DIR, "migration-done");

import type { SourceDirectory } from "./types";

interface LegacyPreferences {
  projectsDirectory: string;
  searchDepth: string;
}

function needsMigration(): boolean {
  return !existsSync(TEST_MIGRATION_FILE) && !existsSync(TEST_SOURCES_FILE);
}

function migrateLegacyPreferences(prefs: LegacyPreferences): SourceDirectory {
  const source: SourceDirectory = {
    id: "src_migrated",
    path: prefs.projectsDirectory,
    depth: parseInt(prefs.searchDepth || "2", 10),
  };

  // Save the source
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  writeFileSync(TEST_SOURCES_FILE, JSON.stringify([source], null, 2));

  // Mark migration as done
  writeFileSync(TEST_MIGRATION_FILE, new Date().toISOString());

  return source;
}

describe("migration", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("needsMigration", () => {
    test("returns true when no sources file exists", () => {
      expect(needsMigration()).toBe(true);
    });

    test("returns false when sources file exists", () => {
      writeFileSync(TEST_SOURCES_FILE, "[]");
      expect(needsMigration()).toBe(false);
    });

    test("returns false when migration marker exists", () => {
      writeFileSync(TEST_MIGRATION_FILE, "done");
      expect(needsMigration()).toBe(false);
    });
  });

  describe("migrateLegacyPreferences", () => {
    test("creates source from legacy preferences", () => {
      const source = migrateLegacyPreferences({
        projectsDirectory: "~/Documents/projects",
        searchDepth: "3",
      });

      expect(source.path).toBe("~/Documents/projects");
      expect(source.depth).toBe(3);
    });

    test("saves source to file", () => {
      migrateLegacyPreferences({
        projectsDirectory: "~/work",
        searchDepth: "2",
      });

      const saved = JSON.parse(readFileSync(TEST_SOURCES_FILE, "utf-8"));
      expect(saved).toHaveLength(1);
      expect(saved[0].path).toBe("~/work");
    });

    test("creates migration marker", () => {
      migrateLegacyPreferences({
        projectsDirectory: "~/projects",
        searchDepth: "2",
      });

      expect(existsSync(TEST_MIGRATION_FILE)).toBe(true);
    });

    test("uses default depth when not specified", () => {
      const source = migrateLegacyPreferences({
        projectsDirectory: "~/projects",
        searchDepth: "",
      });

      expect(source.depth).toBe(2);
    });
  });
});
```

**Step 2: Run test to verify it passes** (uses local implementations)

Run: `bun test src/migration.test.ts`
Expected: PASS

**Step 3: Implement migration module**

Create `src/migration.ts`:

```typescript
import { environment, showToast, Toast } from "@raycast/api";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { addSource, loadSources } from "./sources";
import type { SourceDirectory } from "./types";

const MIGRATION_MARKER = join(environment.supportPath, "migration-v2-done");

export function needsMigration(): boolean {
  if (existsSync(MIGRATION_MARKER)) return false;

  const sources = loadSources();
  return sources.length === 0;
}

export interface LegacyPreferences {
  projectsDirectory: string;
  searchDepth: string;
}

export function migrateLegacyPreferences(
  prefs: LegacyPreferences,
): SourceDirectory {
  const source = addSource({
    path: prefs.projectsDirectory,
    depth: parseInt(prefs.searchDepth || "2", 10),
  });

  // Mark migration as done
  writeFileSync(MIGRATION_MARKER, new Date().toISOString());

  return source;
}

export async function runMigrationIfNeeded(
  prefs: LegacyPreferences,
): Promise<void> {
  if (!needsMigration()) return;

  migrateLegacyPreferences(prefs);

  await showToast({
    style: Toast.Style.Success,
    title: "Project Opener Updated",
    message: "Now supports multiple directories and collections!",
  });
}
```

**Step 4: Run all tests**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/migration.ts src/migration.test.ts
git commit -m "$(cat <<'EOF'
feat: add migration from legacy single-directory config

Migrates existing projectsDirectory preference to new
multi-source system on first run.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Update Package Configuration

### Task 10: Add New Command and Preferences

**Files:**
- Modify: `package.json`

**Step 1: Review current package.json**

Read current structure to understand what needs to change.

**Step 2: Update package.json**

Update the commands and preferences:

```json
{
  "name": "project-opener",
  "title": "Project Opener",
  "description": "Quickly open projects from your projects directory in your preferred IDE",
  "icon": "icon.png",
  "author": "mark_minkoff",
  "license": "MIT",
  "commands": [
    {
      "name": "open-project",
      "title": "Open Project",
      "description": "Browse and open projects in your IDE",
      "mode": "view"
    },
    {
      "name": "manage-collections",
      "title": "Manage Collections",
      "description": "Create, edit, and organize project collections",
      "mode": "view"
    }
  ],
  "preferences": [
    {
      "name": "ide",
      "title": "IDE Application",
      "description": "The application to open projects with",
      "type": "appPicker",
      "required": true
    },
    {
      "name": "projectsDirectory",
      "title": "Projects Directory (Legacy)",
      "description": "Used for migration only. Configure sources in the extension.",
      "type": "directory",
      "required": false,
      "default": "~/Documents/projects"
    },
    {
      "name": "searchDepth",
      "title": "Search Depth (Legacy)",
      "description": "Used for migration only. Configure per-source depth in the extension.",
      "type": "dropdown",
      "required": false,
      "default": "2",
      "data": [
        { "title": "1 level", "value": "1" },
        { "title": "2 levels", "value": "2" },
        { "title": "3 levels", "value": "3" },
        { "title": "4 levels", "value": "4" }
      ]
    },
    {
      "name": "showStaleIndicator",
      "title": "Show Stale Indicator",
      "description": "Show red dot for projects not opened in 90+ days",
      "type": "checkbox",
      "required": false,
      "default": true,
      "label": "Enabled"
    },
    {
      "name": "staleDays",
      "title": "Stale Threshold (Days)",
      "description": "Number of days before a project is considered stale",
      "type": "textfield",
      "required": false,
      "default": "90"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.104.3"
  },
  "devDependencies": {
    "@raycast/eslint-config": "^2.1.1",
    "@types/bun": "^1.3.8",
    "@types/node": "^25.1.0",
    "@types/react": "^19.2.10",
    "eslint": "^9.39.2",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3"
  },
  "scripts": {
    "build": "ray build -e dist",
    "dev": "ray develop",
    "fix-lint": "ray lint --fix",
    "lint": "ray lint",
    "publish": "npx @raycast/api@latest publish",
    "test": "bun test"
  }
}
```

**Step 3: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
feat: add manage-collections command and new preferences

Adds new command for collection management and preferences
for stale indicator configuration.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: UI Components

### Task 11: Create Manage Collections Command

**Files:**
- Create: `src/manage-collections.tsx`

**Step 1: Create the manage collections component**

Create `src/manage-collections.tsx`:

```typescript
import {
  ActionPanel,
  Action,
  List,
  Icon,
  Color,
  useNavigation,
  confirmAlert,
  Alert,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import {
  loadCollections,
  deleteCollection,
  getAllCollections,
  isAutoCollection,
} from "./collections";
import type { Collection } from "./types";
import { AUTO_COLLECTIONS } from "./types";
import CollectionForm from "./CollectionForm";

export default function ManageCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const refresh = useCallback(() => {
    const all = getAllCollections();
    setCollections(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (collection: Collection) => {
    const confirmed = await confirmAlert({
      title: "Delete Collection",
      message: `Are you sure you want to delete "${collection.name}"? Projects will not be deleted.`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      deleteCollection(collection.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Collection deleted",
      });
      refresh();
    }
  };

  const manualCollections = collections.filter((c) => c.type === "manual");
  const autoCollections = collections.filter((c) => c.type === "auto");

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search collections...">
      <List.Section title="Manual Collections">
        {manualCollections.length === 0 ? (
          <List.Item
            title="No collections yet"
            subtitle="Create your first collection"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                <Action
                  title="Create Collection"
                  icon={Icon.Plus}
                  onAction={() => push(<CollectionForm onSave={refresh} />)}
                />
              </ActionPanel>
            }
          />
        ) : (
          manualCollections.map((collection) => (
            <List.Item
              key={collection.id}
              title={collection.name}
              icon={{
                source: Icon[collection.icon as keyof typeof Icon] || Icon.Folder,
                tintColor: collection.color || Color.PrimaryText,
              }}
              actions={
                <ActionPanel>
                  <Action
                    title="Edit Collection"
                    icon={Icon.Pencil}
                    onAction={() =>
                      push(<CollectionForm collection={collection} onSave={refresh} />)
                    }
                  />
                  <Action
                    title="Delete Collection"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => handleDelete(collection)}
                  />
                  <Action
                    title="Create Collection"
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["cmd"], key: "n" }}
                    onAction={() => push(<CollectionForm onSave={refresh} />)}
                  />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>

      <List.Section title="Auto Collections">
        {autoCollections.map((collection) => (
          <List.Item
            key={collection.id}
            title={collection.name}
            subtitle="Auto-generated"
            icon={{
              source: Icon[collection.icon as keyof typeof Icon] || Icon.Folder,
              tintColor: Color.SecondaryText,
            }}
            accessories={[{ tag: "auto" }]}
          />
        ))}
      </List.Section>
    </List>
  );
}
```

**Step 2: Commit**

```bash
git add src/manage-collections.tsx
git commit -m "$(cat <<'EOF'
feat: add manage collections command UI

Implements collection list view with create, edit, and
delete actions for manual collections.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Create Collection Form Component

**Files:**
- Create: `src/CollectionForm.tsx`

**Step 1: Create the collection form component**

Create `src/CollectionForm.tsx`:

```typescript
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useMemo } from "react";
import { createCollection, updateCollection } from "./collections";
import { ICON_COLORS } from "./utils";
import type { Collection } from "./types";

interface CollectionFormProps {
  collection?: Collection;
  onSave: () => void;
}

function getAvailableIcons(): { value: string; title: string; icon: Icon }[] {
  const icons: { value: string; title: string; icon: Icon }[] = [];

  for (const key of Object.keys(Icon)) {
    if (!isNaN(Number(key))) continue;
    const iconValue = Icon[key as keyof typeof Icon];
    if (typeof iconValue === "string" || typeof iconValue === "symbol") {
      icons.push({
        value: key,
        title: key.replace(/([A-Z])/g, " $1").trim(),
        icon: iconValue as Icon,
      });
    }
  }

  return icons.sort((a, b) => a.title.localeCompare(b.title));
}

export default function CollectionForm({
  collection,
  onSave,
}: CollectionFormProps) {
  const { pop } = useNavigation();
  const isEditing = !!collection;

  const [name, setName] = useState(collection?.name || "");
  const [icon, setIcon] = useState(collection?.icon || "Folder");
  const [color, setColor] = useState(collection?.color || ICON_COLORS[0].value);

  const availableIcons = useMemo(() => getAvailableIcons(), []);

  async function handleSubmit() {
    if (!name.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    if (isEditing && collection) {
      updateCollection(collection.id, { name: name.trim(), icon, color });
    } else {
      createCollection({ name: name.trim(), type: "manual", icon, color });
    }

    await showToast({
      style: Toast.Style.Success,
      title: isEditing ? "Collection updated" : "Collection created",
    });

    onSave();
    pop();
  }

  return (
    <Form
      navigationTitle={isEditing ? `Edit: ${collection.name}` : "New Collection"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isEditing ? "Save Changes" : "Create Collection"}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="e.g., Work, Personal, Archived"
        value={name}
        onChange={setName}
      />

      <Form.Dropdown id="icon" title="Icon" value={icon} onChange={setIcon}>
        {availableIcons.map((item) => (
          <Form.Dropdown.Item
            key={item.value}
            value={item.value}
            title={item.title}
            icon={item.icon}
          />
        ))}
      </Form.Dropdown>

      <Form.Dropdown id="color" title="Color" value={color} onChange={setColor}>
        {ICON_COLORS.map((c) => (
          <Form.Dropdown.Item
            key={c.value}
            value={c.value}
            title={c.name}
            icon={{ source: Icon.Circle, tintColor: c.value }}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
```

**Step 2: Commit**

```bash
git add src/CollectionForm.tsx
git commit -m "$(cat <<'EOF'
feat: add collection form for create/edit

Implements form component for creating and editing
manual collections with name, icon, and color.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Update Main Open Project Command

**Files:**
- Modify: `src/open-project.tsx`

**Step 1: Update open-project.tsx with sectioned list**

Replace the entire `src/open-project.tsx` with:

```typescript
import {
  ActionPanel,
  Action,
  List,
  Icon,
  Color,
  getPreferenceValues,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  findProjects,
  Project,
  getProjectInitials,
  generateInitialsIcon,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
} from "./utils";
import {
  loadAllSettings,
  saveProjectSettings,
  ProjectSettings,
} from "./settings";
import { loadSources } from "./sources";
import { loadCollections, getAllCollections, matchesAutoCollection } from "./collections";
import { parseSearchQuery, matchesSearch } from "./search";
import {
  formatRelativeTime,
  getRecencyIndicator,
  updateLastOpened,
  isRecentProject,
} from "./recency";
import { runMigrationIfNeeded } from "./migration";
import type { EnhancedProject, Collection } from "./types";
import { AUTO_COLLECTIONS } from "./types";
import ProjectSettingsForm, { iconFromString } from "./ProjectSettingsForm";
import AddToCollectionForm from "./AddToCollectionForm";

interface Preferences {
  ide: { path: string; name: string };
  projectsDirectory: string;
  searchDepth: string;
  showStaleIndicator: boolean;
}

interface ProjectWithSettings extends EnhancedProject {
  settings: ProjectSettings;
}

type GroupingMode = "collection" | "recency" | "flat";

export default function Command() {
  const [projects, setProjects] = useState<ProjectWithSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [grouping, setGrouping] = useState<GroupingMode>("collection");
  const { push } = useNavigation();

  const preferences = getPreferenceValues<Preferences>();

  const loadProjects = useCallback(async () => {
    try {
      // Run migration if needed
      await runMigrationIfNeeded({
        projectsDirectory: preferences.projectsDirectory,
        searchDepth: preferences.searchDepth,
      });

      const sources = loadSources();
      const allSettings = loadAllSettings();

      // If no sources, fall back to legacy preferences
      let foundProjects: Project[];
      if (sources.length === 0) {
        const searchDepth = parseInt(preferences.searchDepth || "2", 10);
        foundProjects = findProjects(preferences.projectsDirectory, searchDepth);
      } else {
        // Scan all sources
        const seenPaths = new Set<string>();
        foundProjects = [];

        for (const source of sources) {
          const projects = findProjects(source.path, source.depth);
          for (const project of projects) {
            if (!seenPaths.has(project.path)) {
              seenPaths.add(project.path);
              foundProjects.push(project);
            }
          }
        }
        foundProjects.sort((a, b) => a.name.localeCompare(b.name));
      }

      const projectsWithSettings: ProjectWithSettings[] = foundProjects.map(
        (project) => {
          const existingSettings = allSettings[project.path] || {};

          // Assign random color if none exists
          if (!existingSettings.iconColor) {
            const newColor = getRandomIconColor();
            const updatedSettings = { ...existingSettings, iconColor: newColor };
            saveProjectSettings(project.path, updatedSettings);
            return {
              ...project,
              collections: existingSettings.collections || [],
              lastOpened: existingSettings.lastOpened,
              detectedLang: detectLanguage(project.path),
              gitOrg: extractGitOrg(project.path),
              settings: updatedSettings,
            };
          }

          return {
            ...project,
            collections: existingSettings.collections || [],
            lastOpened: existingSettings.lastOpened,
            detectedLang: detectLanguage(project.path),
            gitOrg: extractGitOrg(project.path),
            settings: existingSettings,
          };
        },
      );

      setProjects(projectsWithSettings);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to scan projects",
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [preferences.projectsDirectory, preferences.searchDepth]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;

    const query = parseSearchQuery(searchText);
    return projects.filter((p) => matchesSearch(p, query));
  }, [projects, searchText]);

  const groupedProjects = useMemo(() => {
    if (grouping === "flat") {
      return [{ title: "All Projects", projects: filteredProjects }];
    }

    if (grouping === "recency") {
      const recent = filteredProjects.filter((p) => isRecentProject(p.lastOpened));
      const rest = filteredProjects.filter((p) => !isRecentProject(p.lastOpened));

      return [
        { title: "Recent", projects: recent },
        { title: "Other", projects: rest },
      ].filter((g) => g.projects.length > 0);
    }

    // Group by collection
    const collections = getAllCollections();
    const manualCollections = collections.filter((c) => c.type === "manual");

    const groups: { title: string; icon?: string; projects: ProjectWithSettings[] }[] = [];
    const assigned = new Set<string>();

    // Recent section (auto)
    const recentProjects = filteredProjects.filter((p) => isRecentProject(p.lastOpened));
    if (recentProjects.length > 0) {
      groups.push({ title: "Recent", icon: "Clock", projects: recentProjects });
      recentProjects.forEach((p) => assigned.add(p.path));
    }

    // Manual collections
    for (const collection of manualCollections) {
      const collProjects = filteredProjects.filter(
        (p) => !assigned.has(p.path) && p.collections?.includes(collection.id),
      );
      if (collProjects.length > 0) {
        groups.push({
          title: collection.name,
          icon: collection.icon,
          projects: collProjects,
        });
        collProjects.forEach((p) => assigned.add(p.path));
      }
    }

    // Uncategorized
    const uncategorized = filteredProjects.filter((p) => !assigned.has(p.path));
    if (uncategorized.length > 0) {
      groups.push({ title: "Uncategorized", icon: "QuestionMark", projects: uncategorized });
    }

    return groups;
  }, [filteredProjects, grouping]);

  const handleOpen = async (project: ProjectWithSettings) => {
    const idePath = project.settings.ide?.path || preferences.ide.path;
    updateLastOpened(project.path);
    await open(project.path, idePath);
    loadProjects(); // Refresh to update recency
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search projects... (#collection, lang:, org:)"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Grouping"
          value={grouping}
          onChange={(value) => setGrouping(value as GroupingMode)}
        >
          <List.Dropdown.Item title="By Collection" value="collection" />
          <List.Dropdown.Item title="By Recency" value="recency" />
          <List.Dropdown.Item title="Flat List" value="flat" />
        </List.Dropdown>
      }
    >
      {groupedProjects.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No projects found"
          description={`No projects match your search`}
        />
      ) : (
        groupedProjects.map((group) => (
          <List.Section key={group.title} title={group.title}>
            {group.projects.map((project) => {
              const indicator = getRecencyIndicator(project.lastOpened);
              const relativeTime = formatRelativeTime(project.lastOpened);

              return (
                <List.Item
                  key={project.path}
                  title={project.settings.displayName || project.name}
                  subtitle={project.relativePath !== project.name ? project.relativePath : undefined}
                  accessories={[
                    ...(indicator === "blue"
                      ? [{ icon: { source: Icon.Dot, tintColor: Color.Blue } }]
                      : indicator === "red" && preferences.showStaleIndicator
                        ? [{ icon: { source: Icon.Dot, tintColor: Color.Red } }]
                        : []),
                    ...(relativeTime ? [{ text: relativeTime }] : []),
                  ]}
                  icon={
                    iconFromString(project.settings.icon) ||
                    generateInitialsIcon(
                      getProjectInitials(project.settings.displayName || project.name),
                      project.settings.iconColor || "#546E7A",
                    )
                  }
                  keywords={[project.name, project.settings.displayName || ""].filter(Boolean)}
                  actions={
                    <ActionPanel>
                      <ActionPanel.Section>
                        <Action
                          title={`Open in ${project.settings.ide?.name || preferences.ide.name}`}
                          icon={Icon.ArrowRight}
                          onAction={() => handleOpen(project)}
                        />
                        <Action.ShowInFinder path={project.path} />
                        <Action.CopyToClipboard title="Copy Path" content={project.path} />
                      </ActionPanel.Section>
                      <ActionPanel.Section>
                        <Action
                          title="Add to Collection..."
                          icon={Icon.Tag}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                          onAction={() =>
                            push(
                              <AddToCollectionForm
                                projectPath={project.path}
                                currentCollections={project.collections}
                                onSave={loadProjects}
                              />,
                            )
                          }
                        />
                        <Action
                          title="Project Settings"
                          icon={Icon.Gear}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
                          onAction={() =>
                            push(
                              <ProjectSettingsForm
                                projectPath={project.path}
                                projectName={project.name}
                                onSave={loadProjects}
                              />,
                            )
                          }
                        />
                      </ActionPanel.Section>
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}
```

**Step 2: Commit**

```bash
git add src/open-project.tsx
git commit -m "$(cat <<'EOF'
feat: update open-project with collections and smart search

Adds sectioned list grouped by collection, smart search
with filter syntax, and recency tracking display.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Create Add to Collection Form

**Files:**
- Create: `src/AddToCollectionForm.tsx`

**Step 1: Create the add to collection form**

Create `src/AddToCollectionForm.tsx`:

```typescript
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useMemo } from "react";
import { loadCollections, createCollection } from "./collections";
import { getProjectSettings, saveProjectSettings } from "./settings";
import type { Collection } from "./types";

interface AddToCollectionFormProps {
  projectPath: string;
  currentCollections: string[];
  onSave: () => void;
}

export default function AddToCollectionForm({
  projectPath,
  currentCollections,
  onSave,
}: AddToCollectionFormProps) {
  const { pop } = useNavigation();
  const allCollections = loadCollections();

  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollections || [],
  );
  const [newCollectionName, setNewCollectionName] = useState("");

  async function handleSubmit() {
    let finalCollections = [...selectedCollections];

    // Create new collection if name provided
    if (newCollectionName.trim()) {
      const newColl = createCollection({
        name: newCollectionName.trim(),
        type: "manual",
      });
      finalCollections.push(newColl.id);
    }

    // Save to project settings
    const settings = getProjectSettings(projectPath);
    saveProjectSettings(projectPath, {
      ...settings,
      collections: finalCollections,
    });

    await showToast({
      style: Toast.Style.Success,
      title: "Collections updated",
    });

    onSave();
    pop();
  }

  return (
    <Form
      navigationTitle="Add to Collection"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TagPicker
        id="collections"
        title="Collections"
        value={selectedCollections}
        onChange={setSelectedCollections}
      >
        {allCollections.map((coll) => (
          <Form.TagPicker.Item
            key={coll.id}
            value={coll.id}
            title={coll.name}
            icon={Icon[coll.icon as keyof typeof Icon] || Icon.Folder}
          />
        ))}
      </Form.TagPicker>

      <Form.TextField
        id="newCollection"
        title="Create New Collection"
        placeholder="Enter name to create new..."
        value={newCollectionName}
        onChange={setNewCollectionName}
      />
    </Form>
  );
}
```

**Step 2: Commit**

```bash
git add src/AddToCollectionForm.tsx
git commit -m "$(cat <<'EOF'
feat: add form for assigning projects to collections

Implements tag picker for selecting existing collections
and option to create new collection inline.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: Final Integration and Testing

### Task 15: Run Full Test Suite and Lint

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 2: Run linter**

Run: `bun run lint`
Expected: No errors (or fix them)

**Step 3: Fix any lint errors**

Run: `bun run fix-lint`

**Step 4: Build**

Run: `bun run build`
Expected: Build succeeds

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: fix lint errors and finalize integration

Ensures all files pass linting and build successfully.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Manual Testing Checklist

Test the following in Raycast:

1. **Migration**: Remove `sources.json`, run extension, verify legacy preferences migrate
2. **Collections**: Create, edit, delete manual collections
3. **Add to Collection**: Assign project to collection, verify it appears in section
4. **Smart Search**: Test `#collection`, `lang:typescript`, `org:github-org`
5. **Recency**: Open a project, verify "just now" appears, blue dot shows
6. **Grouping**: Switch between Collection, Recency, Flat modes
7. **Stale Indicator**: Set a project's lastOpened to 100 days ago, verify red dot

---

## Summary

This implementation plan adds smart collections to Project Opener in 16 tasks across 10 phases:

1. **Data Model** (Tasks 1-2): Types and extended settings
2. **Collections Storage** (Task 3): CRUD for collections
3. **Multi-Source** (Task 4): Multiple directory scanning
4. **Detection** (Tasks 5-6): Language and git org extraction
5. **Smart Search** (Task 7): Filter syntax parsing
6. **Recency** (Task 8): Time tracking utilities
7. **Migration** (Task 9): Legacy preference conversion
8. **Package Config** (Task 10): New command and preferences
9. **UI Components** (Tasks 11-14): All new React components
10. **Final Testing** (Tasks 15-16): Integration and manual verification

Each task follows TDD with failing test → implementation → passing test → commit.
