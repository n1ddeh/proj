import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "project-opener-test-migration");
const TEST_SOURCES_FILE = join(TEST_DIR, "sources.json");
const TEST_MIGRATION_FILE = join(TEST_DIR, "migration-done");

import type { SourceDirectory } from "./types";

interface LegacyPreferences {
  projectsDirectory: string;
  searchDepth: string;
}

function needsMigration(): boolean {
  return !existsSync(TEST_MIGRATION_FILE) && !existsSync(TEST_SOURCES_FILE);
}

function migrateLegacyPreferences(prefs: LegacyPreferences): SourceDirectory {
  const source: SourceDirectory = {
    id: "src_migrated",
    path: prefs.projectsDirectory,
    depth: parseInt(prefs.searchDepth || "2", 10),
  };

  // Save the source
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  writeFileSync(TEST_SOURCES_FILE, JSON.stringify([source], null, 2));

  // Mark migration as done
  writeFileSync(TEST_MIGRATION_FILE, new Date().toISOString());

  return source;
}

describe("migration", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("needsMigration", () => {
    test("returns true when no sources file exists", () => {
      expect(needsMigration()).toBe(true);
    });

    test("returns false when sources file exists", () => {
      writeFileSync(TEST_SOURCES_FILE, "[]");
      expect(needsMigration()).toBe(false);
    });

    test("returns false when migration marker exists", () => {
      writeFileSync(TEST_MIGRATION_FILE, "done");
      expect(needsMigration()).toBe(false);
    });
  });

  describe("migrateLegacyPreferences", () => {
    test("creates source from legacy preferences", () => {
      const source = migrateLegacyPreferences({
        projectsDirectory: "~/Documents/projects",
        searchDepth: "3",
      });

      expect(source.path).toBe("~/Documents/projects");
      expect(source.depth).toBe(3);
    });

    test("saves source to file", () => {
      migrateLegacyPreferences({
        projectsDirectory: "~/work",
        searchDepth: "2",
      });

      const saved = JSON.parse(readFileSync(TEST_SOURCES_FILE, "utf-8"));
      expect(saved).toHaveLength(1);
      expect(saved[0].path).toBe("~/work");
    });

    test("creates migration marker", () => {
      migrateLegacyPreferences({
        projectsDirectory: "~/projects",
        searchDepth: "2",
      });

      expect(existsSync(TEST_MIGRATION_FILE)).toBe(true);
    });

    test("uses default depth when not specified", () => {
      const source = migrateLegacyPreferences({
        projectsDirectory: "~/projects",
        searchDepth: "",
      });

      expect(source.depth).toBe(2);
    });
  });
});
