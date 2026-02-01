# Invalid IDE Path Handling

**Date:** 2026-02-01
**Status:** Approved

## Problem

When a configured IDE application is uninstalled, calling `open()` fails with a system error. This applies to both the global IDE preference and per-project IDE overrides.

## Solution

Proactively detect invalid IDE paths and provide clear visual indicators with recovery options.

## Design

### IDE Validation Logic

**Where:** In `projects.tsx` during project loading, after settings are merged.

**What gets validated:**
- Global IDE preference (`preferences.ide.path`) - checked once on load
- Per-project IDE overrides (`project.settings.ide.path`) - checked for each project

**How:**
```typescript
function isValidIde(idePath: string | undefined): boolean {
  return !!idePath && existsSync(idePath);
}
```

**State tracking:**
- `isGlobalIdeValid: boolean` state for global IDE status
- `hasInvalidIde?: boolean` on `ProjectWithSettings` for per-project tracking

### Visual Indicators

**Global IDE missing - Top banner:**
- `List.Item` at the top of the project list
- Title: "Default IDE Not Found"
- Subtitle: The missing IDE name
- Icon: `Icon.Warning` with `Color.Yellow`
- Action: `Action.OpenExtensionPreferences`

**Per-project invalid IDE - Warning accessory:**
- Added to project's accessories array
- Icon: `Icon.ExclamationMark` with `Color.Orange`
- Tooltip: "IDE not found: {ide name}"

### Auto-Prompt Dialog on Open

**Trigger:** User opens a project with an invalid per-project IDE override.

**Dialog:**
```typescript
const choice = await confirmAlert({
  title: "IDE Not Found",
  message: `"${ideName}" is no longer installed.\n\nPath: ${idePath}`,
  primaryAction: {
    title: "Use Default IDE",
  },
  dismissAction: {
    title: "Choose New IDE",
  },
});
```

**Actions:**
- "Use Default IDE" - Clears per-project override, opens with global preference
- "Choose New IDE" - Navigates to `ProjectSettingsForm`

**Edge case:** If global IDE is also invalid, only show "Choose New IDE" option.

## Implementation

### Files to Modify

1. **src/projects.tsx**
   - Add `isGlobalIdeValid` state
   - Add `hasInvalidIde` flag to `ProjectWithSettings`
   - Render global IDE warning banner
   - Add warning accessory to affected projects
   - Update `handleOpen` with validation and dialog

2. **src/settings.ts**
   - Add `clearProjectIde(projectPath)` helper to remove IDE override while preserving other settings
