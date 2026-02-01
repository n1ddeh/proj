// src/projects/hooks/useProjects.ts
import { useState, useCallback, useEffect } from "react";
import { showToast, Toast, getPreferenceValues } from "@raycast/api";
import {
  findProjects,
  Project,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
} from "../../utils";
import { loadAllSettings, saveProjectSettings } from "../../settings";
import { loadSources } from "../../sources";
import { isValidIde } from "../constants";
import type { Preferences, ProjectWithSettings, GroupingMode } from "../types";

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
