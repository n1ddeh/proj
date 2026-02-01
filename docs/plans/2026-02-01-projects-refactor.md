# Projects.tsx Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break up the 837-line `src/projects.tsx` into a modular folder structure with dedicated types, constants, hooks, and components.

**Architecture:** Extract types and constants to dedicated files. Create a `useProjects` hook that encapsulates all state, derived data, and handlers. Extract three presentational components: `ProjectListItem`, `SearchSuggestionsList`, and `GlobalIdeWarning`. The main command file becomes a thin shell (~80 lines) that composes these pieces.

**Tech Stack:** TypeScript, React, Raycast API, Bun for testing

---

### Task 1: Create types.ts

**Files:**
- Create: `src/projects/types.ts`

**Step 1: Create the types file**

```typescript
// src/projects/types.ts
import type { EnhancedProject } from "../types";
import type { ProjectSettings } from "../settings";
import { Icon } from "@raycast/api";

export interface Preferences {
  ide: { path: string; name: string };
  showStaleIndicator: boolean;
}

export interface ProjectWithSettings extends EnhancedProject {
  settings: ProjectSettings;
  missing: boolean;
  hasInvalidIde?: boolean;
}

export type GroupingMode = "collection" | "recency" | "flat";

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  icon: Icon;
  filter: string;
}

export interface GroupedSection {
  title: string;
  projects: ProjectWithSettings[];
  isAuto: boolean;
  collectionIcon?: string;
  collectionColor?: string;
}

export type Accessory = {
  icon?: { source: Icon; tintColor?: string };
  text?: string;
  tooltip?: string;
};
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds (types file is valid)

**Step 3: Commit**

```bash
git add src/projects/types.ts
git commit -m "refactor: extract types to projects/types.ts"
```

---

### Task 2: Create constants.ts

**Files:**
- Create: `src/projects/constants.ts`

**Step 1: Create the constants file**

```typescript
// src/projects/constants.ts
import { existsSync } from "fs";

export function isValidIde(idePath: string | undefined): boolean {
  return !!idePath && existsSync(idePath);
}

export const LANGUAGE_OPTIONS = [
  { name: "TypeScript", value: "typescript", alias: "ts" },
  { name: "JavaScript", value: "javascript", alias: "js" },
  { name: "Python", value: "python", alias: "py" },
  { name: "Rust", value: "rust", alias: "rs" },
  { name: "Go", value: "go", alias: "golang" },
  { name: "Ruby", value: "ruby", alias: "rb" },
  { name: "Java", value: "java" },
  { name: "Kotlin", value: "kotlin", alias: "kt" },
  { name: "Swift", value: "swift" },
  { name: "Dart", value: "dart", alias: "flutter" },
  { name: "PHP", value: "php" },
  { name: "C#", value: "csharp", alias: "cs" },
  { name: "C++", value: "cpp", alias: "c++" },
  { name: "Elixir", value: "elixir", alias: "ex" },
  { name: "Scala", value: "scala", alias: "sc" },
] as const;

export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/constants.ts
git commit -m "refactor: extract constants to projects/constants.ts"
```

---

### Task 3: Create useProjects hook (Part 1 - State and Loading)

**Files:**
- Create: `src/projects/hooks/useProjects.ts`

**Step 1: Create the hook with state and loading logic**

```typescript
// src/projects/hooks/useProjects.ts
import { useState, useCallback, useEffect, useMemo } from "react";
import { showToast, Toast, getPreferenceValues, useNavigation } from "@raycast/api";
import { rmSync } from "fs";
import {
  findProjects,
  Project,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
  isProject,
} from "../../utils";
import {
  loadAllSettings,
  saveProjectSettings,
  deleteProjectSettings,
  deleteCustomIcon,
  migrateProjectSettings,
  clearProjectIde,
} from "../../settings";
import { loadSources } from "../../sources";
import { getAllCollections } from "../../collections";
import { parseSearchQuery, matchesSearch } from "../../search";
import { updateLastOpened, isRecentProject } from "../../recency";
import { isValidIde } from "../constants";
import type {
  Preferences,
  ProjectWithSettings,
  GroupingMode,
  SearchSuggestion,
  GroupedSection,
} from "../types";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectWithSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [grouping, setGrouping] = useState<GroupingMode>("collection");
  const [isGlobalIdeValid, setIsGlobalIdeValid] = useState(true);

  const preferences = getPreferenceValues<Preferences>();

  const loadProjects = useCallback(async () => {
    try {
      setIsGlobalIdeValid(isValidIde(preferences.ide.path));

      const sources = loadSources();
      const allSettings = loadAllSettings();

      const seenPaths = new Set<string>();
      const foundProjects: Project[] = [];

      for (const source of sources) {
        const scanned = findProjects(source.path, source.depth);
        for (const project of scanned) {
          if (!seenPaths.has(project.path)) {
            seenPaths.add(project.path);
            foundProjects.push(project);
          }
        }
      }
      foundProjects.sort((a, b) => a.name.localeCompare(b.name));

      const discoveredPaths = new Set(foundProjects.map((p) => p.path));

      const projectsWithSettings: ProjectWithSettings[] = foundProjects.map(
        (project) => {
          const existingSettings = allSettings[project.path] || {};

          if (!existingSettings.iconColor) {
            const newColor = getRandomIconColor();
            const updatedSettings = {
              ...existingSettings,
              iconColor: newColor,
            };
            saveProjectSettings(project.path, updatedSettings);
            return {
              ...project,
              collections: existingSettings.collections || [],
              lastOpened: existingSettings.lastOpened,
              detectedLang: detectLanguage(project.path),
              gitOrg: extractGitOrg(project.path),
              missing: false,
              hasInvalidIde: existingSettings.ide?.path
                ? !isValidIde(existingSettings.ide.path)
                : false,
              settings: updatedSettings,
            };
          }

          return {
            ...project,
            collections: existingSettings.collections || [],
            lastOpened: existingSettings.lastOpened,
            detectedLang: detectLanguage(project.path),
            gitOrg: extractGitOrg(project.path),
            missing: false,
            hasInvalidIde: existingSettings.ide?.path
              ? !isValidIde(existingSettings.ide.path)
              : false,
            settings: existingSettings,
          };
        },
      );

      for (const [savedPath, savedSettings] of Object.entries(allSettings)) {
        if (!discoveredPaths.has(savedPath)) {
          const pathParts = savedPath.split("/");
          const projectName = pathParts[pathParts.length - 1] || savedPath;

          projectsWithSettings.push({
            name: projectName,
            path: savedPath,
            relativePath: savedPath,
            collections: savedSettings.collections || [],
            lastOpened: savedSettings.lastOpened,
            missing: true,
            hasInvalidIde: savedSettings.ide?.path
              ? !isValidIde(savedSettings.ide.path)
              : false,
            settings: savedSettings,
          });
        }
      }

      projectsWithSettings.sort((a, b) => {
        if (a.missing !== b.missing) {
          return a.missing ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });

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
  }, [preferences.ide.path]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Continued in Part 2...
  return {
    projects,
    isLoading,
    searchText,
    setSearchText,
    grouping,
    setGrouping,
    isGlobalIdeValid,
    preferences,
    loadProjects,
  };
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/hooks/useProjects.ts
git commit -m "refactor: create useProjects hook with state and loading"
```

---

### Task 4: Add derived data to useProjects (filteredProjects, collectionMap, groupedProjects, searchSuggestions)

**Files:**
- Modify: `src/projects/hooks/useProjects.ts`

**Step 1: Add the derived data memos**

Add before the return statement in useProjects:

```typescript
  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;
    const query = parseSearchQuery(searchText);
    return projects.filter((p) => matchesSearch(p, query));
  }, [projects, searchText]);

  const collectionMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; icon?: string; color?: string }
    >();
    getAllCollections()
      .filter((c) => c.type === "manual")
      .forEach((c) =>
        map.set(c.id, { name: c.name, icon: c.icon, color: c.color }),
      );
    return map;
  }, []);

  const searchSuggestions = useMemo((): SearchSuggestion[] => {
    if (!searchText) return [];

    const tokens = searchText.split(/\s+/);
    const lastToken = tokens[tokens.length - 1] || "";
    const prefix = tokens.slice(0, -1).join(" ");
    const prefixWithSpace = prefix ? prefix + " " : "";

    if (lastToken.startsWith("#") && lastToken.length >= 1) {
      const partial = lastToken.slice(1).toLowerCase();
      const collections = getAllCollections();
      const suggestions: SearchSuggestion[] = [];

      const specials = [
        { name: "recent", label: "Recent", icon: Icon.Clock },
        { name: "stale", label: "Stale", icon: Icon.ExclamationMark },
        { name: "month", label: "This Month", icon: Icon.Calendar },
        {
          name: "uncategorized",
          label: "Uncategorized",
          icon: Icon.QuestionMark,
        },
      ];

      for (const s of specials) {
        if (
          s.name.includes(partial) ||
          s.label.toLowerCase().includes(partial)
        ) {
          suggestions.push({
            id: `suggestion-#${s.name}`,
            title: `#${s.name}`,
            subtitle: s.label,
            icon: s.icon,
            filter: `${prefixWithSpace}#${s.name}`,
          });
        }
      }

      for (const c of collections.filter((c) => c.type === "manual")) {
        if (c.name.toLowerCase().includes(partial)) {
          suggestions.push({
            id: `suggestion-#${c.name}`,
            title: `#${c.name.toLowerCase().replace(/\s+/g, "-")}`,
            subtitle: c.name,
            icon: c.icon
              ? (Icon[c.icon as keyof typeof Icon] as Icon)
              : Icon.Folder,
            filter: `${prefixWithSpace}#${c.name.toLowerCase().replace(/\s+/g, "-")}`,
          });
        }
      }

      return suggestions.slice(0, 5);
    }

    if (lastToken.startsWith("lang:")) {
      const partial = lastToken.slice(5).toLowerCase();
      const suggestions: SearchSuggestion[] = [];

      for (const lang of LANGUAGE_OPTIONS) {
        if (
          lang.name.toLowerCase().includes(partial) ||
          lang.value.includes(partial) ||
          lang.alias?.includes(partial)
        ) {
          suggestions.push({
            id: `suggestion-lang:${lang.value}`,
            title: `lang:${lang.value}`,
            subtitle: lang.name + (lang.alias ? ` (${lang.alias})` : ""),
            icon: Icon.Code,
            filter: `${prefixWithSpace}lang:${lang.value}`,
          });
        }
      }

      return suggestions.slice(0, 5);
    }

    if (lastToken.startsWith("org:")) {
      const partial = lastToken.slice(4).toLowerCase();
      const orgs = new Set<string>();
      for (const p of projects) {
        if (p.gitOrg && p.gitOrg.toLowerCase().includes(partial)) {
          orgs.add(p.gitOrg);
        }
      }

      return Array.from(orgs)
        .slice(0, 5)
        .map((org) => ({
          id: `suggestion-org:${org}`,
          title: `org:${org}`,
          subtitle: "Git organization",
          icon: Icon.Person,
          filter: `${prefixWithSpace}org:${org}`,
        }));
    }

    return [];
  }, [searchText, projects]);

  const groupedProjects = useMemo((): GroupedSection[] => {
    if (grouping === "flat") {
      return [
        { title: "All Projects", projects: filteredProjects, isAuto: true },
      ];
    }

    if (grouping === "recency") {
      const recent = filteredProjects.filter((p) =>
        isRecentProject(p.lastOpened),
      );
      const rest = filteredProjects.filter(
        (p) => !isRecentProject(p.lastOpened),
      );

      return [
        { title: "Recent", projects: recent, isAuto: true },
        { title: "Other", projects: rest, isAuto: true },
      ].filter((g) => g.projects.length > 0);
    }

    const collections = getAllCollections();
    const manualCollections = collections.filter((c) => c.type === "manual");

    const groups: GroupedSection[] = [];
    const assigned = new Set<string>();

    const recentProjects = filteredProjects.filter((p) =>
      isRecentProject(p.lastOpened),
    );
    if (recentProjects.length > 0) {
      groups.push({ title: "Recent", projects: recentProjects, isAuto: true });
      recentProjects.forEach((p) => assigned.add(p.path));
    }

    for (const collection of manualCollections) {
      const collProjects = filteredProjects.filter(
        (p) => !assigned.has(p.path) && p.collections?.includes(collection.id),
      );
      if (collProjects.length > 0) {
        groups.push({
          title: collection.name,
          projects: collProjects,
          isAuto: false,
          collectionIcon: collection.icon,
          collectionColor: collection.color,
        });
        collProjects.forEach((p) => assigned.add(p.path));
      }
    }

    const uncategorized = filteredProjects.filter((p) => !assigned.has(p.path));
    if (uncategorized.length > 0) {
      groups.push({
        title: "Uncategorized",
        projects: uncategorized,
        isAuto: true,
      });
    }

    return groups;
  }, [filteredProjects, grouping]);
```

Also add the import for Icon and LANGUAGE_OPTIONS at the top:

```typescript
import { Icon } from "@raycast/api";
import { LANGUAGE_OPTIONS } from "../constants";
```

Update the return to include the new values:

```typescript
  return {
    projects,
    isLoading,
    searchText,
    setSearchText,
    grouping,
    setGrouping,
    isGlobalIdeValid,
    preferences,
    loadProjects,
    filteredProjects,
    collectionMap,
    searchSuggestions,
    groupedProjects,
  };
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/hooks/useProjects.ts
git commit -m "refactor: add derived data memos to useProjects"
```

---

### Task 5: Add handlers to useProjects

**Files:**
- Modify: `src/projects/hooks/useProjects.ts`

**Step 1: Add the handler functions**

Add these functions inside useProjects, before the return:

```typescript
  const { push } = useNavigation();

  const handleOpen = useCallback(
    async (project: ProjectWithSettings) => {
      if (project.hasInvalidIde && project.settings.ide) {
        const ideName = project.settings.ide.name;
        const idePath = project.settings.ide.path;

        if (!isGlobalIdeValid) {
          await confirmAlert({
            title: "IDE Not Found",
            message: `"${ideName}" is no longer installed.\n\nPath: ${idePath}\n\nThe default IDE is also not available. Please configure a new IDE in project settings.`,
            primaryAction: {
              title: "Open Project Settings",
            },
          });
          return { action: "openSettings" as const, project };
        }

        const useDefault = await confirmAlert({
          title: "IDE Not Found",
          message: `"${ideName}" is no longer installed.\n\nPath: ${idePath}`,
          primaryAction: {
            title: "Use Default IDE",
          },
          dismissAction: {
            title: "Choose New IDE",
          },
        });

        if (useDefault) {
          clearProjectIde(project.path);
          await updateLastOpened(project.path);
          await open(project.path, preferences.ide.path);
          loadProjects();
          return { action: "opened" as const };
        } else {
          return { action: "openSettings" as const, project };
        }
      }

      const idePath = project.settings.ide?.path || preferences.ide.path;
      await updateLastOpened(project.path);
      await open(project.path, idePath);
      loadProjects();
      return { action: "opened" as const };
    },
    [isGlobalIdeValid, preferences.ide.path, loadProjects],
  );

  const handleDelete = useCallback(
    async (project: ProjectWithSettings) => {
      const confirmed = await confirmAlert({
        title: "Delete Project",
        message: `Are you sure you want to permanently delete "${project.settings.displayName || project.name}"?\n\nThis will delete the entire folder:\n${project.path}\n\nThis action cannot be undone.`,
        primaryAction: {
          title: "Delete",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (confirmed) {
        try {
          rmSync(project.path, { recursive: true, force: true });
          if (project.settings.customIcon) {
            deleteCustomIcon(project.settings.customIcon);
          }
          deleteProjectSettings(project.path);
          await showToast({
            style: Toast.Style.Success,
            title: "Project deleted",
            message: project.settings.displayName || project.name,
          });
          loadProjects();
        } catch (error) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to delete project",
            message: String(error),
          });
        }
      }
    },
    [loadProjects],
  );

  const handleDeleteFromExtension = useCallback(
    async (project: ProjectWithSettings) => {
      const confirmed = await confirmAlert({
        title: "Remove from Extension",
        message: `Remove "${project.settings.displayName || project.name}" from the extension?\n\nThis only removes the saved settings. The project folder (if it exists elsewhere) will not be affected.`,
        primaryAction: {
          title: "Remove",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (confirmed) {
        if (project.settings.customIcon) {
          deleteCustomIcon(project.settings.customIcon);
        }
        deleteProjectSettings(project.path);
        await showToast({
          style: Toast.Style.Success,
          title: "Removed from extension",
          message: project.settings.displayName || project.name,
        });
        loadProjects();
      }
    },
    [loadProjects],
  );

  const handleRelocateProject = useCallback(
    (project: ProjectWithSettings) => {
      return { action: "relocate" as const, project };
    },
    [],
  );

  const applySuggestion = useCallback((filter: string) => {
    setSearchText(filter + " ");
  }, []);
```

Add these imports at the top:

```typescript
import { confirmAlert, Alert, open } from "@raycast/api";
```

Update the return:

```typescript
  return {
    projects,
    isLoading,
    searchText,
    setSearchText,
    grouping,
    setGrouping,
    isGlobalIdeValid,
    preferences,
    loadProjects,
    filteredProjects,
    collectionMap,
    searchSuggestions,
    groupedProjects,
    handleOpen,
    handleDelete,
    handleDeleteFromExtension,
    handleRelocateProject,
    applySuggestion,
  };
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/hooks/useProjects.ts
git commit -m "refactor: add handlers to useProjects"
```

---

### Task 6: Create GlobalIdeWarning component

**Files:**
- Create: `src/projects/components/GlobalIdeWarning.tsx`

**Step 1: Create the component**

```typescript
// src/projects/components/GlobalIdeWarning.tsx
import { List, ActionPanel, Action, Icon, Color, openExtensionPreferences } from "@raycast/api";

interface GlobalIdeWarningProps {
  ideName: string;
}

export function GlobalIdeWarning({ ideName }: GlobalIdeWarningProps) {
  return (
    <List.Section title="Warning">
      <List.Item
        key="global-ide-warning"
        title="Default IDE Not Found"
        subtitle={ideName}
        icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
        actions={
          <ActionPanel>
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
    </List.Section>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/components/GlobalIdeWarning.tsx
git commit -m "refactor: extract GlobalIdeWarning component"
```

---

### Task 7: Create SearchSuggestionsList component

**Files:**
- Create: `src/projects/components/SearchSuggestionsList.tsx`

**Step 1: Create the component**

```typescript
// src/projects/components/SearchSuggestionsList.tsx
import { List, ActionPanel, Action, Icon, Color } from "@raycast/api";
import type { SearchSuggestion } from "../types";

interface SearchSuggestionsListProps {
  suggestions: SearchSuggestion[];
  onApply: (filter: string) => void;
}

export function SearchSuggestionsList({ suggestions, onApply }: SearchSuggestionsListProps) {
  return (
    <List.Section title="Suggestions" subtitle="Tab or Enter to apply">
      {suggestions.map((suggestion) => (
        <List.Item
          key={suggestion.id}
          title={suggestion.title}
          subtitle={suggestion.subtitle}
          icon={{ source: suggestion.icon, tintColor: Color.SecondaryText }}
          actions={
            <ActionPanel>
              <Action
                title="Apply Filter"
                icon={Icon.Filter}
                onAction={() => onApply(suggestion.filter)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List.Section>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/components/SearchSuggestionsList.tsx
git commit -m "refactor: extract SearchSuggestionsList component"
```

---

### Task 8: Create ProjectListItem component

**Files:**
- Create: `src/projects/components/ProjectListItem.tsx`

**Step 1: Create the component**

```typescript
// src/projects/components/ProjectListItem.tsx
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  useNavigation,
  Form,
  showToast,
  Toast,
} from "@raycast/api";
import { getProjectIcon } from "../../utils";
import { migrateProjectSettings } from "../../settings";
import { isProject } from "../../utils";
import { formatRelativeTime } from "../../recency";
import ProjectSettingsForm from "../../ProjectSettingsForm";
import AddToCollectionForm from "../../AddToCollectionForm";
import type { ProjectWithSettings, Preferences, Accessory } from "../types";

interface ProjectListItemProps {
  project: ProjectWithSettings;
  isAutoGroup: boolean;
  collectionMap: Map<string, { name: string; icon?: string; color?: string }>;
  preferences: Preferences;
  onOpen: (project: ProjectWithSettings) => Promise<{ action: string; project?: ProjectWithSettings }>;
  onDelete: (project: ProjectWithSettings) => Promise<void>;
  onDeleteFromExtension: (project: ProjectWithSettings) => Promise<void>;
  onReload: () => void;
}

function getCollectionAccessories(
  project: ProjectWithSettings,
  collectionMap: Map<string, { name: string; icon?: string; color?: string }>,
): Accessory[] {
  if (!project.collections || project.collections.length === 0) return [];
  const accessories: Accessory[] = [];

  for (const id of project.collections) {
    const coll = collectionMap.get(id);
    if (!coll) continue;
    if (coll.icon) {
      const iconSource = Icon[coll.icon as keyof typeof Icon];
      accessories.push({
        icon: { source: iconSource, tintColor: coll.color },
        text: coll.name,
        tooltip: coll.name,
      });
    } else {
      accessories.push({ text: coll.name, tooltip: coll.name });
    }
  }
  return accessories;
}

function getProjectAccessories(
  project: ProjectWithSettings,
  isAutoGroup: boolean,
  collectionMap: Map<string, { name: string; icon?: string; color?: string }>,
): Accessory[] {
  const accessories: Accessory[] = [];

  if (isAutoGroup) {
    accessories.push(...getCollectionAccessories(project, collectionMap));
  }

  const relativeTime = formatRelativeTime(project.lastOpened);

  if (!project.missing && relativeTime) {
    accessories.push({ text: relativeTime });
  }

  if (project.missing) {
    accessories.push({
      text: "Not found",
      icon: { source: Icon.Warning, tintColor: Color.Red },
    });
  }

  if (!project.missing && project.hasInvalidIde) {
    accessories.push({
      icon: { source: Icon.ExclamationMark, tintColor: Color.Orange },
      tooltip: `IDE not found: ${project.settings.ide?.name || "Unknown"}`,
    });
  }

  return accessories;
}

export function ProjectListItem({
  project,
  isAutoGroup,
  collectionMap,
  preferences,
  onOpen,
  onDelete,
  onDeleteFromExtension,
  onReload,
}: ProjectListItemProps) {
  const { push } = useNavigation();

  const handleOpen = async () => {
    const result = await onOpen(project);
    if (result.action === "openSettings" && result.project) {
      push(
        <ProjectSettingsForm
          projectPath={result.project.path}
          projectName={result.project.name}
          onSave={onReload}
        />,
      );
    }
  };

  const handleRelocate = () => {
    push(
      <Form
        navigationTitle="Relocate Project"
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Relocate"
              onSubmit={async (values: { newPath: string[] }) => {
                const newPath = values.newPath?.[0];
                if (!newPath) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "No directory selected",
                  });
                  return;
                }

                if (!isProject(newPath)) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Invalid project directory",
                    message: "Selected folder is not a recognized project",
                  });
                  return;
                }

                migrateProjectSettings(project.path, newPath);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Project relocated",
                  message: `Moved settings to ${newPath}`,
                });
                onReload();
              }}
            />
          </ActionPanel>
        }
      >
        <Form.Description
          title="Missing Project"
          text={`The project "${project.settings.displayName || project.name}" was not found at:\n${project.path}\n\nSelect the new location:`}
        />
        <Form.FilePicker
          id="newPath"
          title="New Location"
          allowMultipleSelection={false}
          canChooseDirectories={true}
          canChooseFiles={false}
        />
      </Form>,
    );
  };

  if (project.missing) {
    return (
      <List.Item
        key={project.path}
        title={project.settings.displayName || project.name}
        accessories={getProjectAccessories(project, isAutoGroup, collectionMap)}
        icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
        keywords={[project.name, project.settings.displayName || ""].filter(Boolean)}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action
                title="Relocate Project…"
                icon={Icon.Folder}
                onAction={handleRelocate}
              />
              <Action
                title="Remove from Extension"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => onDeleteFromExtension(project)}
              />
            </ActionPanel.Section>
            <ActionPanel.Section>
              <Action.CopyToClipboard
                title="Copy Original Path"
                content={project.path}
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List.Item
      key={project.path}
      title={project.settings.displayName || project.name}
      accessories={getProjectAccessories(project, isAutoGroup, collectionMap)}
      icon={getProjectIcon(
        project.settings,
        project.settings.displayName || project.name,
      )}
      keywords={[project.name, project.settings.displayName || ""].filter(Boolean)}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title={`Open in ${project.settings.ide?.name || preferences.ide.name}`}
              icon={Icon.ArrowRight}
              onAction={handleOpen}
            />
            <Action.ShowInFinder path={project.path} />
            <Action.CopyToClipboard
              title="Copy Path"
              content={project.path}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Add to Collection…"
              icon={Icon.Tag}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              onAction={() =>
                push(
                  <AddToCollectionForm
                    projectPath={project.path}
                    currentCollections={project.collections}
                    onSave={onReload}
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
                    onSave={onReload}
                  />,
                )
              }
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Delete Project"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => onDelete(project)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/components/ProjectListItem.tsx
git commit -m "refactor: extract ProjectListItem component"
```

---

### Task 9: Create index barrel file

**Files:**
- Create: `src/projects/index.ts`

**Step 1: Create barrel exports**

```typescript
// src/projects/index.ts
export * from "./types";
export * from "./constants";
export { useProjects } from "./hooks/useProjects";
export { GlobalIdeWarning } from "./components/GlobalIdeWarning";
export { SearchSuggestionsList } from "./components/SearchSuggestionsList";
export { ProjectListItem } from "./components/ProjectListItem";
```

**Step 2: Verify file compiles**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/projects/index.ts
git commit -m "refactor: add barrel exports for projects module"
```

---

### Task 10: Rewrite projects.tsx to use extracted modules

**Files:**
- Modify: `src/projects.tsx`

**Step 1: Replace entire file contents**

```typescript
// src/projects.tsx
import { List } from "@raycast/api";
import {
  useProjects,
  GlobalIdeWarning,
  SearchSuggestionsList,
  ProjectListItem,
  GroupingMode,
} from "./projects";

export default function Command() {
  const {
    isLoading,
    searchText,
    setSearchText,
    grouping,
    setGrouping,
    isGlobalIdeValid,
    preferences,
    groupedProjects,
    searchSuggestions,
    collectionMap,
    handleOpen,
    handleDelete,
    handleDeleteFromExtension,
    applySuggestion,
    loadProjects,
  } = useProjects();

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
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
      {searchSuggestions.length > 0 && (
        <SearchSuggestionsList
          suggestions={searchSuggestions}
          onApply={applySuggestion}
        />
      )}
      {!isGlobalIdeValid && (
        <GlobalIdeWarning ideName={preferences.ide.name} />
      )}
      {groupedProjects.length === 0 &&
      searchSuggestions.length === 0 &&
      !isLoading ? (
        <List.EmptyView
          title="No projects found"
          description="No projects match your search"
        />
      ) : (
        groupedProjects.map((group) => (
          <List.Section
            key={group.title}
            title={`${group.title} · ${group.projects.length}`}
          >
            {group.projects.map((project) => (
              <ProjectListItem
                key={project.path}
                project={project}
                isAutoGroup={group.isAuto}
                collectionMap={collectionMap}
                preferences={preferences}
                onOpen={handleOpen}
                onDelete={handleDelete}
                onDeleteFromExtension={handleDeleteFromExtension}
                onReload={loadProjects}
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}
```

**Step 2: Verify build succeeds**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 3: Verify dev mode works**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run dev`
Expected: Extension loads in Raycast without errors

**Step 4: Commit**

```bash
git add src/projects.tsx
git commit -m "refactor: slim down projects.tsx using extracted modules"
```

---

### Task 11: Verify all tests pass

**Step 1: Run test suite**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun test`
Expected: All tests pass

**Step 2: Run lint**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run lint`
Expected: No lint errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "refactor: complete projects.tsx modularization

Extracted:
- src/projects/types.ts - Type definitions
- src/projects/constants.ts - LANGUAGE_OPTIONS, isValidIde
- src/projects/hooks/useProjects.ts - All state, handlers, derived data
- src/projects/components/GlobalIdeWarning.tsx
- src/projects/components/SearchSuggestionsList.tsx
- src/projects/components/ProjectListItem.tsx

Main projects.tsx reduced from 837 lines to ~80 lines."
```

---

## Summary

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/projects.tsx` | Thin command entry point | 80 |
| `src/projects/types.ts` | Type definitions | 40 |
| `src/projects/constants.ts` | Constants and helpers | 30 |
| `src/projects/hooks/useProjects.ts` | State, derived data, handlers | 350 |
| `src/projects/components/ProjectListItem.tsx` | Project row with ActionPanel | 200 |
| `src/projects/components/SearchSuggestionsList.tsx` | Suggestions section | 30 |
| `src/projects/components/GlobalIdeWarning.tsx` | Warning banner | 25 |
| `src/projects/index.ts` | Barrel exports | 10 |
