# Projects.tsx Refactor Design

## Overview

Break up the 837-line `src/projects.tsx` into a modular folder structure with dedicated hooks and components.

## Folder Structure

```
src/
  projects.tsx                    # Entry point (slim, ~80 lines)
  projects/
    types.ts                      # ProjectWithSettings, GroupingMode, SearchSuggestion, Preferences
    constants.ts                  # LANGUAGE_OPTIONS, isValidIde helper
    hooks/
      useProjects.ts              # State, handlers, derived data
    components/
      ProjectListItem.tsx         # Single project row with ActionPanel
      SearchSuggestionsList.tsx   # Suggestions section when typing filters
      GlobalIdeWarning.tsx        # Warning banner for invalid IDE
```

## Hook API

```typescript
// src/projects/hooks/useProjects.ts

interface UseProjectsReturn {
  // State
  projects: ProjectWithSettings[];
  isLoading: boolean;
  searchText: string;
  setSearchText: (text: string) => void;
  grouping: GroupingMode;
  setGrouping: (mode: GroupingMode) => void;
  isGlobalIdeValid: boolean;

  // Derived data
  filteredProjects: ProjectWithSettings[];
  groupedProjects: GroupedSection[];
  searchSuggestions: SearchSuggestion[];
  collectionMap: Map<string, { name: string; icon?: string; color?: string }>;

  // Handlers
  handleOpen: (project: ProjectWithSettings) => Promise<void>;
  handleDelete: (project: ProjectWithSettings) => Promise<void>;
  handleDeleteFromExtension: (project: ProjectWithSettings) => Promise<void>;
  handleRelocateProject: (project: ProjectWithSettings) => void;
  applySuggestion: (filter: string) => void;
  loadProjects: () => Promise<void>;
}

export function useProjects(): UseProjectsReturn { ... }
```

## Component Props

### ProjectListItem

```typescript
interface ProjectListItemProps {
  project: ProjectWithSettings;
  isAutoGroup: boolean;
  collectionMap: Map<string, { name: string; icon?: string; color?: string }>;
  preferences: Preferences;
  onOpen: (project: ProjectWithSettings) => void;
  onDelete: (project: ProjectWithSettings) => void;
  onDeleteFromExtension: (project: ProjectWithSettings) => void;
  onRelocate: (project: ProjectWithSettings) => void;
  onAddToCollection: (project: ProjectWithSettings) => void;
  onOpenSettings: (project: ProjectWithSettings) => void;
}
```

Renders `List.Item` with accessories and full ActionPanel. Contains `getProjectAccessories` and `getCollectionAccessories` logic internally.

### SearchSuggestionsList

```typescript
interface SearchSuggestionsListProps {
  suggestions: SearchSuggestion[];
  onApply: (filter: string) => void;
}
```

Renders `List.Section` with suggestion items.

### GlobalIdeWarning

```typescript
interface GlobalIdeWarningProps {
  ideName: string;
}
```

Renders warning `List.Section` with "Open Extension Preferences" action.

## Entry Point

```typescript
// src/projects.tsx (after refactor)
import { List, getPreferenceValues } from "@raycast/api";
import { useProjects } from "./projects/hooks/useProjects";
import { ProjectListItem } from "./projects/components/ProjectListItem";
import { SearchSuggestionsList } from "./projects/components/SearchSuggestionsList";
import { GlobalIdeWarning } from "./projects/components/GlobalIdeWarning";
import type { Preferences } from "./projects/types";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const {
    isLoading, searchText, setSearchText,
    grouping, setGrouping, isGlobalIdeValid,
    groupedProjects, searchSuggestions, collectionMap,
    handleOpen, handleDelete, handleDeleteFromExtension,
    handleRelocateProject, applySuggestion,
  } = useProjects();

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search projects... (#collection, lang:, org:)"
      searchBarAccessory={/* dropdown */}
    >
      {searchSuggestions.length > 0 && (
        <SearchSuggestionsList suggestions={searchSuggestions} onApply={applySuggestion} />
      )}
      {!isGlobalIdeValid && <GlobalIdeWarning ideName={preferences.ide.name} />}
      {/* Empty view or grouped sections with ProjectListItem */}
    </List>
  );
}
```

## Migration Notes

- Main `projects.tsx` stays at root (Raycast command entry point)
- Navigation actions (`onAddToCollection`, `onOpenSettings`) use `useNavigation` inside `ProjectListItem`
- `RelocateProjectForm` stays inline in handler (small, tightly coupled)

## File Line Estimates

| File | Lines |
|------|-------|
| `projects.tsx` | ~80 |
| `projects/types.ts` | ~40 |
| `projects/constants.ts` | ~30 |
| `projects/hooks/useProjects.ts` | ~350 |
| `projects/components/ProjectListItem.tsx` | ~200 |
| `projects/components/SearchSuggestionsList.tsx` | ~30 |
| `projects/components/GlobalIdeWarning.tsx` | ~25 |
