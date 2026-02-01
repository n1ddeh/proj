# Orphaned Collection References Cleanup

## Problem

When a collection is deleted via `deleteCollection()`, the collection is removed from `collections.json` but project settings in `project-settings.json` retain stale references to the deleted collection ID. This leaves orphaned collection IDs in `settings.collections[]` arrays.

## Solution

Clean up all project references immediately when a collection is deleted.

## Implementation

### 1. Add helper function to settings.ts

```typescript
export function removeCollectionFromAllProjects(collectionId: string): number {
  const store = loadAllSettings();
  let cleanedCount = 0;

  for (const [path, settings] of Object.entries(store)) {
    if (settings.collections?.includes(collectionId)) {
      settings.collections = settings.collections.filter(id => id !== collectionId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    writeFileSync(SETTINGS_FILE, JSON.stringify(store, null, 2));
  }

  return cleanedCount;
}
```

### 2. Modify deleteCollection in collections.ts

```typescript
import { removeCollectionFromAllProjects } from "./settings";

export function deleteCollection(id: string): boolean {
  const collections = loadCollections();
  const filtered = collections.filter((c) => c.id !== id);
  if (filtered.length === collections.length) return false;

  saveCollections(filtered);
  removeCollectionFromAllProjects(id);  // Clean up references
  return true;
}
```

## Files Changed

- `src/settings.ts` - Add `removeCollectionFromAllProjects()` function
- `src/collections.ts` - Import and call cleanup function in `deleteCollection()`

## Testing

1. Create a collection
2. Add projects to the collection
3. Delete the collection
4. Verify project settings no longer contain the deleted collection ID
