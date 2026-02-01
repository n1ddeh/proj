# Custom Project Icons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to upload custom image files as project icons, stored persistently in Raycast's support directory.

**Architecture:** Add `customIcon` field to `ProjectSettings`, file copy/delete helpers in `settings.ts`, unified icon resolution in `utils.ts`, and a file picker in `ProjectSettingsForm.tsx`. Custom icons take priority over built-in icons.

**Tech Stack:** TypeScript, React, Raycast API, Node.js fs module

---

### Task 1: Add customIcon field to ProjectSettings

**Files:**
- Modify: `src/settings.ts:10-17`

**Step 1: Update the ProjectSettings interface**

Add `customIcon` field after `icon`:

```typescript
export interface ProjectSettings {
  displayName?: string;
  icon?: string;
  customIcon?: string;
  iconColor?: string;
  ide?: ProjectIDE;
  collections?: string[];
  lastOpened?: number;
}
```

**Step 2: Update hasContent check in saveProjectSettings**

In `saveProjectSettings`, add `customIcon` to the hasContent check:

```typescript
const hasContent =
  settings.displayName ||
  settings.icon ||
  settings.customIcon ||
  settings.iconColor ||
  settings.ide ||
  (settings.collections && settings.collections.length > 0) ||
  settings.lastOpened;
```

**Step 3: Verify build passes**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add customIcon field to ProjectSettings"
```

---

### Task 2: Add custom icon file helpers

**Files:**
- Modify: `src/settings.ts`

**Step 1: Add imports for crypto and path utilities**

At the top of the file, update imports:

```typescript
import { environment } from "@raycast/api";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync } from "fs";
import { join, dirname, extname } from "path";
import { createHash } from "crypto";
```

**Step 2: Add CUSTOM_ICONS_DIR constant**

After `SETTINGS_FILE`:

```typescript
const CUSTOM_ICONS_DIR = join(environment.supportPath, "custom-icons");
```

**Step 3: Add ensureCustomIconsDir helper**

After `ensureSettingsDir`:

```typescript
function ensureCustomIconsDir(): void {
  if (!existsSync(CUSTOM_ICONS_DIR)) {
    mkdirSync(CUSTOM_ICONS_DIR, { recursive: true });
  }
}
```

**Step 4: Add copyCustomIcon function**

After `ensureCustomIconsDir`:

```typescript
export function copyCustomIcon(projectPath: string, sourceFilePath: string): string {
  ensureCustomIconsDir();
  const hash = createHash("md5").update(projectPath).digest("hex").slice(0, 12);
  const ext = extname(sourceFilePath).toLowerCase();
  const destFilename = `${hash}${ext}`;
  const destPath = join(CUSTOM_ICONS_DIR, destFilename);
  copyFileSync(sourceFilePath, destPath);
  return destPath;
}
```

**Step 5: Add deleteCustomIcon function**

After `copyCustomIcon`:

```typescript
export function deleteCustomIcon(iconPath: string): void {
  if (iconPath && existsSync(iconPath) && iconPath.startsWith(CUSTOM_ICONS_DIR)) {
    try {
      unlinkSync(iconPath);
    } catch {
      // Ignore deletion errors
    }
  }
}
```

**Step 6: Verify build passes**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 7: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add custom icon copy/delete helpers"
```

---

### Task 3: Add getProjectIcon helper

**Files:**
- Modify: `src/utils.ts`

**Step 1: Add existsSync import**

Update imports at top of file to include `existsSync`:

```typescript
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
```

(This is already imported, so no change needed)

**Step 2: Add Icon import from Raycast**

Add at top of file:

```typescript
import { Icon, Image } from "@raycast/api";
```

**Step 3: Add ProjectSettings import**

Add at top of file:

```typescript
import type { ProjectSettings } from "./settings";
```

**Step 4: Add getProjectIcon function**

At the end of the file:

```typescript
/**
 * Resolves the icon to display for a project.
 * Priority: customIcon > built-in icon > initials icon
 */
export function getProjectIcon(
  settings: ProjectSettings,
  projectName: string,
): Image.Source {
  // Custom icon takes priority
  if (settings.customIcon && existsSync(settings.customIcon)) {
    return settings.customIcon;
  }

  // Built-in Raycast icon
  if (settings.icon) {
    const builtinIcon = Icon[settings.icon as keyof typeof Icon];
    if (builtinIcon) {
      return builtinIcon;
    }
  }

  // Fallback to initials icon
  return generateInitialsIcon(
    getProjectInitials(settings.displayName || projectName),
    settings.iconColor || "#546E7A",
  );
}
```

**Step 5: Verify build passes**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add src/utils.ts
git commit -m "feat: add getProjectIcon helper for unified icon resolution"
```

---

### Task 4: Add custom icon file picker to ProjectSettingsForm

**Files:**
- Modify: `src/ProjectSettingsForm.tsx`

**Step 1: Add imports for custom icon helpers**

Update the settings import:

```typescript
import {
  getProjectSettings,
  saveProjectSettings,
  copyCustomIcon,
  deleteCustomIcon,
  ProjectIDE,
} from "./settings";
```

**Step 2: Add SUPPORTED_IMAGE_TYPES constant**

After the imports, add:

```typescript
const SUPPORTED_IMAGE_TYPES = ["png", "jpg", "jpeg", "svg", "webp"];
```

**Step 3: Add customIcon state**

After the existing state declarations (around line 91):

```typescript
const [customIcon, setCustomIcon] = useState<string[]>(
  existingSettings.customIcon ? [existingSettings.customIcon] : [],
);
```

**Step 4: Add existsSync import**

At top of file:

```typescript
import { existsSync } from "fs";
import { extname } from "path";
```

**Step 5: Update handleSubmit to process custom icon**

Replace the handleSubmit function:

```typescript
async function handleSubmit() {
  let ide: ProjectIDE | undefined;
  if (ideApp.length > 0 && ideApp[0]) {
    ide = {
      path: ideApp[0],
      name: getAppName(ideApp[0]),
    };
  }

  // Handle custom icon
  let customIconPath: string | undefined = existingSettings.customIcon;

  if (customIcon.length > 0 && customIcon[0]) {
    const selectedFile = customIcon[0];
    const ext = extname(selectedFile).slice(1).toLowerCase();

    if (!SUPPORTED_IMAGE_TYPES.includes(ext)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid image format",
        message: `Supported formats: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
      });
      return;
    }

    // Only copy if it's a new file (not already in our custom-icons dir)
    if (selectedFile !== existingSettings.customIcon) {
      // Delete old custom icon if exists
      if (existingSettings.customIcon) {
        deleteCustomIcon(existingSettings.customIcon);
      }
      customIconPath = copyCustomIcon(projectPath, selectedFile);
    }
  } else if (existingSettings.customIcon) {
    // Custom icon was cleared
    deleteCustomIcon(existingSettings.customIcon);
    customIconPath = undefined;
  }

  saveProjectSettings(projectPath, {
    displayName: displayName.trim() || undefined,
    icon: icon || undefined,
    customIcon: customIconPath,
    iconColor: iconColor || undefined,
    ide,
    collections: collections.length > 0 ? collections : undefined,
    lastOpened: existingSettings.lastOpened,
  });

  await showToast({
    style: Toast.Style.Success,
    title: "Settings saved",
  });

  onSave();
  pop();
}
```

**Step 6: Add Form.FilePicker for custom icon**

After the Icon dropdown (around line 156), add:

```typescript
<Form.FilePicker
  id="customIcon"
  title="Custom Icon"
  info="Upload a custom image (overrides icon selection above)"
  allowMultipleSelection={false}
  canChooseDirectories={false}
  canChooseFiles={true}
  value={customIcon}
  onChange={setCustomIcon}
/>
```

**Step 7: Verify build passes**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 8: Commit**

```bash
git add src/ProjectSettingsForm.tsx
git commit -m "feat: add custom icon file picker to project settings"
```

---

### Task 5: Use getProjectIcon in open-project.tsx

**Files:**
- Modify: `src/open-project.tsx`

**Step 1: Update utils import**

Add `getProjectIcon` to the imports from utils:

```typescript
import {
  findProjects,
  Project,
  getProjectInitials,
  generateInitialsIcon,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
  getProjectIcon,
} from "./utils";
```

**Step 2: Replace icon rendering in List.Item**

Find the `icon` prop in the List.Item (around line 522-530) and replace:

```typescript
icon={
  iconFromString(project.settings.icon) ||
  generateInitialsIcon(
    getProjectInitials(
      project.settings.displayName || project.name,
    ),
    project.settings.iconColor || "#546E7A",
  )
}
```

With:

```typescript
icon={getProjectIcon(
  project.settings,
  project.settings.displayName || project.name,
)}
```

**Step 3: Remove unused iconFromString import**

The `iconFromString` function is no longer needed in this file. Update the import:

```typescript
import ProjectSettingsForm from "./ProjectSettingsForm";
```

**Step 4: Verify build passes**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds with no errors

**Step 5: Manual test**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run dev`

1. Open Proj extension
2. Select a project → Project Settings
3. Upload a custom icon image
4. Save and verify the custom icon appears in the project list
5. Edit settings again, clear the custom icon
6. Verify it falls back to the built-in/initials icon

**Step 6: Commit**

```bash
git add src/open-project.tsx
git commit -m "feat: use getProjectIcon for unified icon rendering"
```

---

### Task 6: Final verification and cleanup

**Step 1: Run linting**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run lint`
Expected: No linting errors

**Step 2: Fix any lint issues**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run fix-lint`

**Step 3: Run build**

Run: `cd /Users/markminkoff/Documents/projects/other/raycast-extensions/proj && bun run build`
Expected: Build succeeds

**Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "chore: fix linting issues"
```
