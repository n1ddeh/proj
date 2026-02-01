# Custom Project Icons Design

## Overview

Allow users to upload custom image files as project icons, stored persistently in Raycast's support directory.

## Data Model

**Changes to `ProjectSettings` interface in `settings.ts`:**

```typescript
interface ProjectSettings {
  displayName?: string;
  icon?: string;           // Built-in Raycast icon name (existing)
  customIcon?: string;     // Path to copied custom icon file (new)
  iconColor?: string;
  ide?: ProjectIDE;
  collections?: string[];
  lastOpened?: number;
}
```

## Storage

- Custom icons copied to `{environment.supportPath}/custom-icons/`
- Filename: hash of project path + original extension (e.g., `a1b2c3d4.png`)
- Supported formats: PNG, JPG, JPEG, SVG, WEBP

## Icon Priority

When rendering a project's icon:
1. If `customIcon` exists and file is valid → use it
2. Else if `icon` is set → use built-in Raycast icon
3. Else → use default folder icon with initials

## UI Changes

In `ProjectSettingsForm.tsx`, add a file picker between icon dropdown and icon color:

```
Icon Dropdown      → [Folder ▼]           (built-in icons)
Custom Icon        → [Choose File...]     (new file picker)
Icon Color         → [Blue ▼]             (for initials fallback)
```

File picker configuration:
- Single file selection
- Filter to image types
- Info: "Upload a custom image (overrides icon selection above)"

## New Functions

### `copyCustomIcon(projectPath: string, filePath: string): string`
- Copies selected file to support directory
- Returns path to copied file
- Uses hash of project path for unique filename

### `deleteCustomIcon(iconPath: string): void`
- Removes icon file from support directory
- Called when custom icon is cleared or changed

### `getProjectIcon(settings: ProjectSettings, projectName: string): Image.Source`
- Unified icon resolution following priority rules
- Used wherever project icons are displayed

## Cleanup Behavior

- When custom icon is cleared: delete file, remove `customIcon` from settings
- When custom icon is changed: delete old file, copy new file
- Prevents orphaned files in support directory

## Files to Modify

1. `src/settings.ts` - Add `customIcon` field, copy/delete helpers
2. `src/ProjectSettingsForm.tsx` - Add custom icon file picker
3. `src/utils.ts` - Add `getProjectIcon()` helper
4. `src/open-project.tsx` - Use `getProjectIcon()` for icon rendering
