// src/projects/hooks/useProjects.ts
import { useState, useCallback, useEffect, useMemo } from "react";
import { showToast, Toast, getPreferenceValues, Icon } from "@raycast/api";
import {
  findProjects,
  Project,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
} from "../../utils";
import { loadAllSettings, saveProjectSettings } from "../../settings";
import { loadSources } from "../../sources";
import { getAllCollections } from "../../collections";
import { parseSearchQuery, matchesSearch } from "../../search";
import { isRecentProject } from "../../recency";
import { isValidIde, LANGUAGE_OPTIONS } from "../constants";
import type {
  Preferences,
  ProjectWithSettings,
  GroupingMode,
  SearchSuggestion,
  GroupedSection,
} from "../types";

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

  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;
    const query = parseSearchQuery(searchText);
    return projects.filter((p) => matchesSearch(p, query));
  }, [projects, searchText]);

  const collectionMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; icon?: string; color?: string }
    >();
    getAllCollections()
      .filter((c) => c.type === "manual")
      .forEach((c) =>
        map.set(c.id, { name: c.name, icon: c.icon, color: c.color }),
      );
    return map;
  }, []);

  const searchSuggestions = useMemo((): SearchSuggestion[] => {
    if (!searchText) return [];

    const tokens = searchText.split(/\s+/);
    const lastToken = tokens[tokens.length - 1] || "";
    const prefix = tokens.slice(0, -1).join(" ");
    const prefixWithSpace = prefix ? prefix + " " : "";

    if (lastToken.startsWith("#") && lastToken.length >= 1) {
      const partial = lastToken.slice(1).toLowerCase();
      const collections = getAllCollections();
      const suggestions: SearchSuggestion[] = [];

      const specials = [
        { name: "recent", label: "Recent", icon: Icon.Clock },
        { name: "stale", label: "Stale", icon: Icon.ExclamationMark },
        { name: "month", label: "This Month", icon: Icon.Calendar },
        {
          name: "uncategorized",
          label: "Uncategorized",
          icon: Icon.QuestionMark,
        },
      ];

      for (const s of specials) {
        if (
          s.name.includes(partial) ||
          s.label.toLowerCase().includes(partial)
        ) {
          suggestions.push({
            id: `suggestion-#${s.name}`,
            title: `#${s.name}`,
            subtitle: s.label,
            icon: s.icon,
            filter: `${prefixWithSpace}#${s.name}`,
          });
        }
      }

      for (const c of collections.filter((c) => c.type === "manual")) {
        if (c.name.toLowerCase().includes(partial)) {
          suggestions.push({
            id: `suggestion-#${c.name}`,
            title: `#${c.name.toLowerCase().replace(/\s+/g, "-")}`,
            subtitle: c.name,
            icon: c.icon
              ? (Icon[c.icon as keyof typeof Icon] as Icon)
              : Icon.Folder,
            filter: `${prefixWithSpace}#${c.name.toLowerCase().replace(/\s+/g, "-")}`,
          });
        }
      }

      return suggestions.slice(0, 5);
    }

    if (lastToken.startsWith("lang:")) {
      const partial = lastToken.slice(5).toLowerCase();
      const suggestions: SearchSuggestion[] = [];

      for (const lang of LANGUAGE_OPTIONS) {
        const alias = "alias" in lang ? lang.alias : undefined;
        if (
          lang.name.toLowerCase().includes(partial) ||
          lang.value.includes(partial) ||
          alias?.includes(partial)
        ) {
          suggestions.push({
            id: `suggestion-lang:${lang.value}`,
            title: `lang:${lang.value}`,
            subtitle: lang.name + (alias ? ` (${alias})` : ""),
            icon: Icon.Code,
            filter: `${prefixWithSpace}lang:${lang.value}`,
          });
        }
      }

      return suggestions.slice(0, 5);
    }

    if (lastToken.startsWith("org:")) {
      const partial = lastToken.slice(4).toLowerCase();
      const orgs = new Set<string>();
      for (const p of projects) {
        if (p.gitOrg && p.gitOrg.toLowerCase().includes(partial)) {
          orgs.add(p.gitOrg);
        }
      }

      return Array.from(orgs)
        .slice(0, 5)
        .map((org) => ({
          id: `suggestion-org:${org}`,
          title: `org:${org}`,
          subtitle: "Git organization",
          icon: Icon.Person,
          filter: `${prefixWithSpace}org:${org}`,
        }));
    }

    return [];
  }, [searchText, projects]);

  const groupedProjects = useMemo((): GroupedSection[] => {
    if (grouping === "flat") {
      return [
        { title: "All Projects", projects: filteredProjects, isAuto: true },
      ];
    }

    if (grouping === "recency") {
      const recent = filteredProjects.filter((p) =>
        isRecentProject(p.lastOpened),
      );
      const rest = filteredProjects.filter(
        (p) => !isRecentProject(p.lastOpened),
      );

      return [
        { title: "Recent", projects: recent, isAuto: true },
        { title: "Other", projects: rest, isAuto: true },
      ].filter((g) => g.projects.length > 0);
    }

    const collections = getAllCollections();
    const manualCollections = collections.filter((c) => c.type === "manual");

    const groups: GroupedSection[] = [];
    const assigned = new Set<string>();

    const recentProjects = filteredProjects.filter((p) =>
      isRecentProject(p.lastOpened),
    );
    if (recentProjects.length > 0) {
      groups.push({ title: "Recent", projects: recentProjects, isAuto: true });
      recentProjects.forEach((p) => assigned.add(p.path));
    }

    for (const collection of manualCollections) {
      const collProjects = filteredProjects.filter(
        (p) => !assigned.has(p.path) && p.collections?.includes(collection.id),
      );
      if (collProjects.length > 0) {
        groups.push({
          title: collection.name,
          projects: collProjects,
          isAuto: false,
          collectionIcon: collection.icon,
          collectionColor: collection.color,
        });
        collProjects.forEach((p) => assigned.add(p.path));
      }
    }

    const uncategorized = filteredProjects.filter((p) => !assigned.has(p.path));
    if (uncategorized.length > 0) {
      groups.push({
        title: "Uncategorized",
        projects: uncategorized,
        isAuto: true,
      });
    }

    return groups;
  }, [filteredProjects, grouping]);

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
    filteredProjects,
    collectionMap,
    searchSuggestions,
    groupedProjects,
  };
}
