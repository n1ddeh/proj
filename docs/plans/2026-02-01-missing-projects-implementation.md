# Missing Projects Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show missing projects in the UI with alert icons, allowing users to delete or relocate them.

**Architecture:** Add `missing` field to EnhancedProject, merge saved settings with discovered projects during load, render missing projects with distinct UI and custom actions.

**Tech Stack:** React, Raycast API (List, Action, Form), TypeScript

---

### Task 1: Fix orphaned custom icons bug

**Files:**
- Modify: `src/projects.tsx:425-453` (handleDelete function)

**Step 1: Add deleteCustomIcon import**

In the imports at top of file, add `deleteCustomIcon` to the settings import:

```typescript
import {
  loadAllSettings,
  saveProjectSettings,
  deleteProjectSettings,
  deleteCustomIcon,
  ProjectSettings,
} from "./settings";
```

**Step 2: Call deleteCustomIcon in handleDelete**

In the `handleDelete` function, add the deleteCustomIcon call before deleteProjectSettings:

```typescript
if (confirmed) {
  try {
    rmSync(project.path, { recursive: true, force: true });
    if (project.settings.customIcon) {
      deleteCustomIcon(project.settings.customIcon);
    }
    deleteProjectSettings(project.path);
```

**Step 3: Test manually**

1. Run `bun run dev`
2. Add a custom icon to a project
3. Delete the project via UI
4. Verify the custom icon file is removed from support directory

**Step 4: Commit**

```bash
git add src/projects.tsx
git commit -m "fix: delete custom icons when deleting projects"
```

---

### Task 2: Add missing field to EnhancedProject

**Files:**
- Modify: `src/types.ts:35-41`

**Step 1: Add missing field to EnhancedProject interface**

```typescript
export interface EnhancedProject extends Project {
  collections: string[];
  lastOpened?: number;
  sourceId?: string;
  detectedLang?: string;
  gitOrg?: string;
  missing?: boolean;
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add missing field to EnhancedProject"
```

---

### Task 3: Add migrateProjectSettings helper

**Files:**
- Modify: `src/settings.ts`

**Step 1: Add migrateProjectSettings function after deleteProjectSettings**

```typescript
export function migrateProjectSettings(
  oldPath: string,
  newPath: string,
): void {
  ensureSettingsDir();
  const store = loadAllSettings();
  const settings = store[oldPath];
  if (settings) {
    store[newPath] = settings;
    delete store[oldPath];
    writeFileSync(SETTINGS_FILE, JSON.stringify(store, null, 2));
  }
}
```

**Step 2: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add migrateProjectSettings helper"
```

---

### Task 4: Load missing projects from saved settings

**Files:**
- Modify: `src/projects.tsx` (loadProjects function)

**Step 1: Update loadProjects to include missing projects**

After building `projectsWithSettings` from found projects, add logic to include missing projects from saved settings. Replace the section after `foundProjects.sort(...)` through to `setProjects(projectsWithSettings)`:

```typescript
      foundProjects.sort((a, b) => a.name.localeCompare(b.name));

      // Build set of discovered paths
      const discoveredPaths = new Set(foundProjects.map((p) => p.path));

      const projectsWithSettings: ProjectWithSettings[] = foundProjects.map(
        (project) => {
          const existingSettings = allSettings[project.path] || {};

          // Assign random color if none exists
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
            settings: existingSettings,
          };
        },
      );

      // Add missing projects from saved settings
      for (const [savedPath, savedSettings] of Object.entries(allSettings)) {
        if (!discoveredPaths.has(savedPath)) {
          // Extract project name from path
          const pathParts = savedPath.split("/");
          const projectName = pathParts[pathParts.length - 1] || savedPath;

          projectsWithSettings.push({
            name: projectName,
            path: savedPath,
            relativePath: savedPath,
            collections: savedSettings.collections || [],
            lastOpened: savedSettings.lastOpened,
            missing: true,
            settings: savedSettings,
          });
        }
      }

      // Sort with missing projects at the end of each group
      projectsWithSettings.sort((a, b) => {
        if (a.missing !== b.missing) {
          return a.missing ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });

      setProjects(projectsWithSettings);
```

**Step 2: Update ProjectWithSettings interface to include missing**

Near the top of the file, update the interface:

```typescript
interface ProjectWithSettings extends EnhancedProject {
  settings: ProjectSettings;
  missing: boolean;
}
```

**Step 3: Commit**

```bash
git add src/projects.tsx
git commit -m "feat: load missing projects from saved settings"
```

---

### Task 5: Render missing projects with alert icon

**Files:**
- Modify: `src/projects.tsx` (List.Item rendering)

**Step 1: Update the List.Item icon logic**

In the `groupedProjects.map` section where List.Item is rendered, update the icon prop:

```typescript
icon={
  project.missing
    ? { source: Icon.ExclamationMark, tintColor: Color.Red }
    : getProjectIcon(
        project.settings,
        project.settings.displayName || project.name,
      )
}
```

**Step 2: Add "Not found" accessory for missing projects**

Update the accessories array to include a "Not found" indicator:

```typescript
accessories={[
  ...(project.missing
    ? [{ text: "Not found", icon: { source: Icon.Warning, tintColor: Color.Red } }]
    : []),
  ...collectionAccessories,
  ...(showDivider ? [{ text: "|" }] : []),
  ...(!project.missing && relativeTime ? [{ text: relativeTime }] : []),
]}
```

**Step 3: Test manually**

1. Run `bun run dev`
2. Move or delete a project directory externally
3. Refresh the extension
4. Verify the project shows with red alert icon and "Not found" text

**Step 4: Commit**

```bash
git add src/projects.tsx
git commit -m "feat: render missing projects with alert icon"
```

---

### Task 6: Add actions for missing projects

**Files:**
- Modify: `src/projects.tsx` (ActionPanel section)
- Modify: `src/settings.ts` (add import for migrateProjectSettings)

**Step 1: Add imports for Form components at top of projects.tsx**

Update the Raycast import:

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
  confirmAlert,
  Alert,
  Form,
} from "@raycast/api";
```

**Step 2: Add migrateProjectSettings to settings import**

```typescript
import {
  loadAllSettings,
  saveProjectSettings,
  deleteProjectSettings,
  deleteCustomIcon,
  migrateProjectSettings,
  ProjectSettings,
} from "./settings";
```

**Step 3: Add isProject import from utils**

```typescript
import {
  findProjects,
  Project,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
  getProjectIcon,
  isProject,
} from "./utils";
```

**Step 4: Add handleDeleteFromExtension function after handleDelete**

```typescript
const handleDeleteFromExtension = async (project: ProjectWithSettings) => {
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
};
```

**Step 5: Add handleRelocateProject function after handleDeleteFromExtension**

```typescript
const handleRelocateProject = (project: ProjectWithSettings) => {
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
              loadProjects();
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
    </Form>
  );
};
```

**Step 6: Update ActionPanel to show different actions for missing projects**

Replace the entire `actions` prop in the List.Item with conditional logic:

```typescript
actions={
  project.missing ? (
    <ActionPanel>
      <ActionPanel.Section>
        <Action
          title="Relocate Project…"
          icon={Icon.Folder}
          onAction={() => handleRelocateProject(project)}
        />
        <Action
          title="Remove from Extension"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          onAction={() => handleDeleteFromExtension(project)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard
          title="Copy Original Path"
          content={project.path}
        />
      </ActionPanel.Section>
    </ActionPanel>
  ) : (
    <ActionPanel>
      <ActionPanel.Section>
        <Action
          title={`Open in ${project.settings.ide?.name || preferences.ide.name}`}
          icon={Icon.ArrowRight}
          onAction={() => handleOpen(project)}
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
      <ActionPanel.Section>
        <Action
          title="Delete Project"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={() => handleDelete(project)}
        />
      </ActionPanel.Section>
    </ActionPanel>
  )
}
```

**Step 7: Test manually**

1. Run `bun run dev`
2. Move a project directory externally
3. Verify the missing project shows with correct actions
4. Test "Relocate Project" - select the new location
5. Test "Remove from Extension" - verify settings are deleted

**Step 8: Commit**

```bash
git add src/projects.tsx src/settings.ts
git commit -m "feat: add relocate and remove actions for missing projects"
```

---

### Task 7: Final testing and cleanup

**Step 1: Run linter**

```bash
bun run lint
```

Fix any issues found.

**Step 2: Run build**

```bash
bun run build
```

Ensure no TypeScript errors.

**Step 3: Full manual test**

1. Create a test project, add custom icon, add to collection
2. Move project externally → verify shows as missing
3. Relocate → verify settings migrated
4. Create another test, delete externally
5. Remove from extension → verify settings and icon cleaned up

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and cleanup"
```
