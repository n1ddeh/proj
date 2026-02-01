# Smart Collections Design

## Overview

Enhance Project Opener with a collections system for organizing scattered projects. Combines auto-detection with manual tagging, multiple directory scanning, and smart search.

## Goals

- Scan multiple project directories with per-source settings
- Auto-detect project metadata (recency, git org, language)
- Allow manual collection assignment for flexible organization
- Display projects in sections grouped by collection
- Provide smart search with filter syntax

---

## Data Model

### Project (enhanced)

Existing properties remain. New additions:

```typescript
interface Project {
  // existing
  name: string;
  path: string;
  relativePath: string;
  settings: ProjectSettings;

  // new
  collections: string[];      // collection IDs
  lastOpened?: number;        // timestamp, updated on open
  sourceId?: string;          // which source directory found it
  detectedLang?: string;      // inferred from marker files
  gitOrg?: string;            // extracted from git remote
}
```

### Collection

```typescript
interface Collection {
  id: string;
  name: string;
  type: "auto" | "manual";
  icon?: string;              // Raycast icon name
  color?: string;             // hex color
  criteria?: AutoCriteria;    // for auto-collections
}

interface AutoCriteria {
  kind: "recent" | "stale" | "git-org" | "uncategorized";
  days?: number;              // for recent/stale
  orgName?: string;           // for git-org
}
```

### Source Directory

```typescript
interface SourceDirectory {
  id: string;
  path: string;
  depth: number;              // 1-4
  defaultCollection?: string; // auto-assign to this collection
  defaultIde?: ProjectIDE;    // override IDE for this source
}
```

### Auto-Collections (system-defined)

| ID | Name | Criteria |
|----|------|----------|
| `_recent` | Recent | Opened in last 7 days |
| `_month` | This Month | Opened in last 30 days |
| `_stale` | Stale | Not opened in 90+ days |
| `_uncategorized` | Uncategorized | No manual collections assigned |
| `_org:{name}` | {OrgName} | Git remote contains org name |

---

## UI Design

### Main List (Open Project command)

```
┌─────────────────────────────────────────┐
│ 🔍 Search projects...        [Group ▾] │
├─────────────────────────────────────────┤
│ ⏱️ Recent                               │
│   ├─ 🔵 project-opener     2 hours ago │
│   └─ 🔵 client-dashboard   today       │
├─────────────────────────────────────────┤
│ 💼 Work                                 │
│   ├─ api-gateway           3 days ago  │
│   └─ internal-tools        last week   │
├─────────────────────────────────────────┤
│ 🏠 Personal                             │
│   └─ dotfiles              2 weeks ago │
├─────────────────────────────────────────┤
│ 📦 Uncategorized                        │
│   └─ 🔴 random-experiment  6 months    │
└─────────────────────────────────────────┘
```

**Visual indicators**:
- 🔵 Blue dot: Opened today
- No dot: Normal
- 🔴 Red dot: Stale (90+ days)

**Section order**:
1. Recent (if non-empty)
2. Manual collections (user-defined order)
3. Auto git-org collections
4. Stale
5. Uncategorized

**Project appears in one section only** (priority: Recent > Manual > Auto > Uncategorized)

**Grouping dropdown**: "By Collection" (default), "By Recency", "All (flat list)"

### Project Actions

```
┌─────────────────────────────────┐
│ Open in VS Code                 │
│ Show in Finder                  │
│ Copy Path                       │
├─────────────────────────────────┤
│ Add to Collection...        ⌘⇧C │
│ Project Details             ⌘D  │
│ Project Settings            ⌘⇧, │
└─────────────────────────────────┘
```

### Add to Collection Submenu

```
┌─────────────────────────────────┐
│ Work                        ✓   │
│ Personal                        │
│ Archived                        │
├─────────────────────────────────┤
│ + Create New Collection...      │
└─────────────────────────────────┘
```

### Project Details View (⌘D)

Shows:
- Full path
- Collections membership
- Last opened timestamp
- Detected language/tech
- Git remote URL
- Source directory

---

## Smart Search

### Filter Syntax

| Prefix | Example | Matches |
|--------|---------|---------|
| `#` | `#work` | Projects in "Work" collection |
| `#recent` | `#recent` | Opened in last 7 days |
| `#stale` | `#stale` | Not opened in 90+ days |
| `lang:` | `lang:rust` | Projects with Cargo.toml |
| `in:` | `in:~/work` | Projects under that directory |
| `org:` | `org:acme` | Git remote contains "acme" |

### Combinations

`#work lang:typescript` — TypeScript projects in Work collection

### Language Detection

Uses existing marker files:
- `package.json` → javascript/typescript
- `Cargo.toml` → rust
- `go.mod` → go
- `pyproject.toml` → python
- `pom.xml` → java
- `build.gradle` → java/kotlin
- `CMakeLists.txt` → cpp

---

## Multiple Source Directories

### Preferences UI

```
Source Directories:
┌────────────────────────────────────────────────────┐
│ ~/Documents/projects    depth: 2    [Edit] [✕]    │
│ ~/work                  depth: 1    [Edit] [✕]    │
│ ~/clients               depth: 2    [Edit] [✕]    │
│                                                    │
│ [+ Add Directory]                                  │
└────────────────────────────────────────────────────┘
```

### Per-Source Settings

- `path`: Directory to scan
- `depth`: Scan depth (1-4)
- `defaultCollection`: Auto-assign found projects
- `defaultIde`: Override IDE for all projects in this source

### Duplicate Handling

If same project appears in multiple sources (symlinks, nested), show once using first-matched source.

---

## Manage Collections Command

Separate Raycast command for collection CRUD.

```
┌─────────────────────────────────────────┐
│ 🔍 Search collections...                │
├─────────────────────────────────────────┤
│ 💼 Work                    5 projects   │
│ 🏠 Personal                3 projects   │
│ 📁 Archived                12 projects  │
├─────────────────────────────────────────┤
│ ⏱️ Recent (auto)           4 projects   │
│ 🔴 Stale (auto)            8 projects   │
│ 🐙 acme-corp (auto)        6 projects   │
└─────────────────────────────────────────┘
```

**Actions**:
- Edit (manual only): name, icon, color
- Delete (manual only)
- Reorder (manual only)
- View projects in collection

---

## Recency Tracking

### Storage

Add `lastOpened` to project settings, updated when:
- User opens project via "Open in IDE" action
- User opens project via "Show in Finder" (optional)

### Forgotten Projects Surfacing

- Toast on first scan after adding new source: "Found 12 new projects — 4 haven't been opened in 6+ months"
- Optional periodic prompt: "You have 8 stale projects. Archive them?"

---

## New Files

| File | Purpose |
|------|---------|
| `src/collections.ts` | Collection types, storage, auto-collection logic |
| `src/sources.ts` | Multi-directory scanning, source management |
| `src/search.ts` | Smart search parser and filtering |
| `src/ManageCollections.tsx` | New command UI |
| `src/ProjectDetails.tsx` | Project detail view component |
| `src/recency.ts` | Last-opened tracking utilities |

## Modified Files

| File | Changes |
|------|---------|
| `src/open-project.tsx` | Sectioned list, collection grouping, recency display |
| `src/settings.ts` | Add collections, lastOpened to ProjectSettings |
| `src/utils.ts` | Language detection, git org extraction |
| `package.json` | New command, updated preferences |

---

## Preferences Changes

### Remove
- `projectsDirectory` (single) — replaced by sources
- `searchDepth` (single) — per-source now

### Add
- `sources`: Array of SourceDirectory
- `showStaleIndicator`: boolean (default true)
- `staleDays`: number (default 90)
- `archiveHidesProjects`: boolean (default false)

---

## Migration

On first launch after update:
1. Read existing `projectsDirectory` and `searchDepth`
2. Create single source with those values
3. Preserve all existing project settings
4. Show welcome toast: "Project Opener now supports multiple directories and collections!"
