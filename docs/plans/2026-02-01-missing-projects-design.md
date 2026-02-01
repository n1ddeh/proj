# Missing Projects Handling

## Problem

When a project directory is deleted or moved externally, the extension:
1. Silently drops it from the list (no indication to user)
2. Leaves orphaned data in `project-settings.json` and `custom-icons/`
3. Provides no way to relocate a moved project

## Solution

Show missing projects in the UI with a visual indicator and provide options to delete or relocate them.

## Design

### Data Model

Add `missing: boolean` field to `EnhancedProject` in `types.ts`.

### Loading Logic (projects.tsx)

1. Scan filesystem → discovered projects
2. Load all saved settings from `project-settings.json`
3. For each saved path NOT in discovered projects, create a project entry with `missing: true`
4. Merge both lists, preserving collection assignments

### UI for Missing Projects

- **Icon:** Red alert icon (`Icon.ExclamationMark` with `Color.Red`)
- **Accessory:** "Not found" text as hint
- **Location:** Appears in original collection/section (including Uncategorized)

### Actions for Missing Projects

Instead of normal "Open in IDE" action, missing projects show:
1. **Delete from Extension** - Removes settings and custom icon completely
2. **Relocate Project...** - Opens directory picker

### Relocation Flow

1. User selects "Relocate Project..."
2. Directory picker opens
3. User selects new directory
4. Validate with `isProject()`:
   - If invalid: show error toast, abort
   - If valid: migrate settings from old path to new path
5. Delete old path entry from settings
6. Refresh project list

### Bug Fix

Add `deleteCustomIcon(project.settings.customIcon)` call in `handleDelete` to prevent orphaned icons.

## Files to Modify

1. `src/types.ts` - Add `missing` field to `EnhancedProject`
2. `src/settings.ts` - Add `migrateProjectSettings()` helper
3. `src/projects.tsx` - Loading logic, UI rendering, new actions
4. `src/MissingProjectActions.tsx` - New component for missing project dialog (optional, could inline)
