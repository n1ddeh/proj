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
} from "@raycast/api";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  findProjects,
  Project,
  getProjectInitials,
  generateInitialsIcon,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
} from "./utils";
import {
  loadAllSettings,
  saveProjectSettings,
  ProjectSettings,
} from "./settings";
import { loadSources } from "./sources";
import { getAllCollections } from "./collections";
import { parseSearchQuery, matchesSearch } from "./search";
import {
  formatRelativeTime,
  getRecencyIndicator,
  updateLastOpened,
  isRecentProject,
} from "./recency";
import { runMigrationIfNeeded } from "./migration";
import type { EnhancedProject } from "./types";
import ProjectSettingsForm, { iconFromString } from "./ProjectSettingsForm";
import AddToCollectionForm from "./AddToCollectionForm";

interface Preferences {
  ide: { path: string; name: string };
  projectsDirectory: string;
  searchDepth: string;
  showStaleIndicator: boolean;
}

interface ProjectWithSettings extends EnhancedProject {
  settings: ProjectSettings;
}

type GroupingMode = "collection" | "recency" | "flat";

export default function Command() {
  const [projects, setProjects] = useState<ProjectWithSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [grouping, setGrouping] = useState<GroupingMode>("collection");
  const { push } = useNavigation();

  const preferences = getPreferenceValues<Preferences>();

  const loadProjects = useCallback(async () => {
    try {
      // Run migration if needed
      await runMigrationIfNeeded({
        projectsDirectory: preferences.projectsDirectory,
        searchDepth: preferences.searchDepth,
      });

      const sources = loadSources();
      const allSettings = loadAllSettings();

      // If no sources, fall back to legacy preferences
      let foundProjects: Project[];
      if (sources.length === 0) {
        const searchDepth = parseInt(preferences.searchDepth || "2", 10);
        foundProjects = findProjects(
          preferences.projectsDirectory,
          searchDepth,
        );
      } else {
        // Scan all sources
        const seenPaths = new Set<string>();
        foundProjects = [];

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
      }

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
              settings: updatedSettings,
            };
          }

          return {
            ...project,
            collections: existingSettings.collections || [],
            lastOpened: existingSettings.lastOpened,
            detectedLang: detectLanguage(project.path),
            gitOrg: extractGitOrg(project.path),
            settings: existingSettings,
          };
        },
      );

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
  }, [preferences.projectsDirectory, preferences.searchDepth]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;

    const query = parseSearchQuery(searchText);
    return projects.filter((p) => matchesSearch(p, query));
  }, [projects, searchText]);

  // Build a map of collection IDs to names for subtitle display
  const collectionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    getAllCollections()
      .filter((c) => c.type === "manual")
      .forEach((c) => map.set(c.id, c.name));
    return map;
  }, []);

  const getCollectionNames = (project: ProjectWithSettings): string => {
    if (!project.collections || project.collections.length === 0) return "";
    return project.collections
      .map((id) => collectionNameMap.get(id))
      .filter(Boolean)
      .join(", ");
  };

  const groupedProjects = useMemo(() => {
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

    // Group by collection
    const collections = getAllCollections();
    const manualCollections = collections.filter((c) => c.type === "manual");

    const groups: {
      title: string;
      projects: ProjectWithSettings[];
      isAuto: boolean;
    }[] = [];
    const assigned = new Set<string>();

    // Recent section (auto)
    const recentProjects = filteredProjects.filter((p) =>
      isRecentProject(p.lastOpened),
    );
    if (recentProjects.length > 0) {
      groups.push({ title: "Recent", projects: recentProjects, isAuto: true });
      recentProjects.forEach((p) => assigned.add(p.path));
    }

    // Manual collections
    for (const collection of manualCollections) {
      const collProjects = filteredProjects.filter(
        (p) => !assigned.has(p.path) && p.collections?.includes(collection.id),
      );
      if (collProjects.length > 0) {
        groups.push({
          title: collection.name,
          projects: collProjects,
          isAuto: false,
        });
        collProjects.forEach((p) => assigned.add(p.path));
      }
    }

    // Uncategorized
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

  const handleOpen = async (project: ProjectWithSettings) => {
    const idePath = project.settings.ide?.path || preferences.ide.path;
    await updateLastOpened(project.path);
    await open(project.path, idePath);
    loadProjects(); // Refresh to update recency
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search projects\u2026 (#collection, lang:, org:)"
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Grouping"
          value={grouping}
          onChange={(value) => setGrouping(value as GroupingMode)}
        >
          <List.Dropdown.Item title="By Collection" value="collection" />
          <List.Dropdown.Item title="By Recency" value="recency" />
          <List.Dropdown.Item title="Flat List" value="flat" />
        </List.Dropdown>
      }
    >
      {groupedProjects.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No projects found"
          description="No projects match your search"
        />
      ) : (
        groupedProjects.map((group) => (
          <List.Section key={group.title} title={group.title}>
            {group.projects.map((project) => {
              const indicator = getRecencyIndicator(project.lastOpened);
              const relativeTime = formatRelativeTime(project.lastOpened);
              // Show collection names when in auto groups (Recent, Uncategorized, flat)
              const subtitle = group.isAuto
                ? getCollectionNames(project)
                : undefined;

              return (
                <List.Item
                  key={project.path}
                  title={project.settings.displayName || project.name}
                  subtitle={subtitle || undefined}
                  accessories={[
                    ...(indicator === "blue"
                      ? [{ icon: { source: Icon.Dot, tintColor: Color.Blue } }]
                      : indicator === "red" && preferences.showStaleIndicator
                        ? [{ icon: { source: Icon.Dot, tintColor: Color.Red } }]
                        : []),
                    ...(relativeTime ? [{ text: relativeTime }] : []),
                  ]}
                  icon={
                    iconFromString(project.settings.icon) ||
                    generateInitialsIcon(
                      getProjectInitials(
                        project.settings.displayName || project.name,
                      ),
                      project.settings.iconColor || "#546E7A",
                    )
                  }
                  keywords={[
                    project.name,
                    project.settings.displayName || "",
                  ].filter(Boolean)}
                  actions={
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
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}
