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
