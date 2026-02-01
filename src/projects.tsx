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
  confirmAlert,
  Alert,
  Form,
} from "@raycast/api";
import { rmSync } from "fs";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  findProjects,
  Project,
  getRandomIconColor,
  detectLanguage,
  extractGitOrg,
  getProjectIcon,
  isProject,
} from "./utils";
import {
  loadAllSettings,
  saveProjectSettings,
  deleteProjectSettings,
  deleteCustomIcon,
  migrateProjectSettings,
  ProjectSettings,
} from "./settings";
import { loadSources } from "./sources";
import { getAllCollections } from "./collections";
import { parseSearchQuery, matchesSearch } from "./search";
import {
  formatRelativeTime,
  updateLastOpened,
  isRecentProject,
} from "./recency";
import { runMigrationIfNeeded } from "./migration";
import type { EnhancedProject } from "./types";
import ProjectSettingsForm from "./ProjectSettingsForm";
import AddToCollectionForm from "./AddToCollectionForm";

interface Preferences {
  ide: { path: string; name: string };
  projectsDirectory: string;
  searchDepth: string;
  showStaleIndicator: boolean;
}

interface ProjectWithSettings extends EnhancedProject {
  settings: ProjectSettings;
  missing: boolean;
}

type GroupingMode = "collection" | "recency" | "flat";

interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  icon: Icon;
  filter: string;
}

const LANGUAGE_OPTIONS = [
  { name: "TypeScript", value: "typescript", alias: "ts" },
  { name: "JavaScript", value: "javascript", alias: "js" },
  { name: "Python", value: "python", alias: "py" },
  { name: "Rust", value: "rust", alias: "rs" },
  { name: "Go", value: "go", alias: "golang" },
  { name: "Ruby", value: "ruby", alias: "rb" },
  { name: "Java", value: "java" },
  { name: "Kotlin", value: "kotlin", alias: "kt" },
  { name: "Swift", value: "swift" },
  { name: "Dart", value: "dart", alias: "flutter" },
  { name: "PHP", value: "php" },
  { name: "C#", value: "csharp", alias: "cs" },
  { name: "C++", value: "cpp", alias: "c++" },
  { name: "Elixir", value: "elixir", alias: "ex" },
  { name: "Scala", value: "scala", alias: "sc" },
];

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

      // Build set of discovered paths
      const discoveredPaths = new Set(foundProjects.map((p) => p.path));

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
              missing: false,
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
            settings: existingSettings,
          };
        },
      );

      // Add missing projects from saved settings
      for (const [savedPath, savedSettings] of Object.entries(allSettings)) {
        if (!discoveredPaths.has(savedPath)) {
          // Extract project name from path
          const pathParts = savedPath.split("/");
          const projectName = pathParts[pathParts.length - 1] || savedPath;

          projectsWithSettings.push({
            name: projectName,
            path: savedPath,
            relativePath: savedPath,
            collections: savedSettings.collections || [],
            lastOpened: savedSettings.lastOpened,
            missing: true,
            settings: savedSettings,
          });
        }
      }

      // Sort with missing projects at the end of each group
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
  }, [preferences.projectsDirectory, preferences.searchDepth]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;

    const query = parseSearchQuery(searchText);
    return projects.filter((p) => matchesSearch(p, query));
  }, [projects, searchText]);

  // Build a map of collection IDs to collection data for display
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

  const getCollectionAccessories = (
    project: ProjectWithSettings,
  ): {
    icon?: { source: Icon; tintColor?: string };
    text?: string;
    tooltip?: string;
  }[] => {
    if (!project.collections || project.collections.length === 0) return [];
    const accessories: {
      icon?: { source: Icon; tintColor?: string };
      text?: string;
      tooltip?: string;
    }[] = [];

    for (const id of project.collections) {
      const coll = collectionMap.get(id);
      if (!coll) continue;
      // Add accessory with optional icon
      if (coll.icon) {
        const iconSource = Icon[coll.icon as keyof typeof Icon];
        accessories.push({
          icon: {
            source: iconSource,
            tintColor: coll.color,
          },
          text: coll.name,
          tooltip: coll.name,
        });
      } else {
        // No icon - just show the name
        accessories.push({
          text: coll.name,
          tooltip: coll.name,
        });
      }
    }
    return accessories;
  };

  // Generate search suggestions based on current input
  const searchSuggestions = useMemo((): SearchSuggestion[] => {
    if (!searchText) return [];

    const tokens = searchText.split(/\s+/);
    const lastToken = tokens[tokens.length - 1] || "";
    const prefix = tokens.slice(0, -1).join(" ");
    const prefixWithSpace = prefix ? prefix + " " : "";

    // Collection suggestions when typing #
    if (lastToken.startsWith("#") && lastToken.length >= 1) {
      const partial = lastToken.slice(1).toLowerCase();
      const collections = getAllCollections();
      const suggestions: SearchSuggestion[] = [];

      // Add special collections
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

      // Add manual collections
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

    // Language suggestions when typing lang:
    if (lastToken.startsWith("lang:")) {
      const partial = lastToken.slice(5).toLowerCase();
      const suggestions: SearchSuggestion[] = [];

      for (const lang of LANGUAGE_OPTIONS) {
        if (
          lang.name.toLowerCase().includes(partial) ||
          lang.value.includes(partial) ||
          lang.alias?.includes(partial)
        ) {
          suggestions.push({
            id: `suggestion-lang:${lang.value}`,
            title: `lang:${lang.value}`,
            subtitle: lang.name + (lang.alias ? ` (${lang.alias})` : ""),
            icon: Icon.Code,
            filter: `${prefixWithSpace}lang:${lang.value}`,
          });
        }
      }

      return suggestions.slice(0, 5);
    }

    // Org suggestions when typing org:
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
      collectionIcon?: string;
      collectionColor?: string;
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
          collectionIcon: collection.icon,
          collectionColor: collection.color,
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

  const handleDelete = async (project: ProjectWithSettings) => {
    const confirmed = await confirmAlert({
      title: "Delete Project",
      message: `Are you sure you want to permanently delete "${project.settings.displayName || project.name}"?\n\nThis will delete the entire folder:\n${project.path}\n\nThis action cannot be undone.`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      try {
        rmSync(project.path, { recursive: true, force: true });
        if (project.settings.customIcon) {
          deleteCustomIcon(project.settings.customIcon);
        }
        deleteProjectSettings(project.path);
        await showToast({
          style: Toast.Style.Success,
          title: "Project deleted",
          message: project.settings.displayName || project.name,
        });
        loadProjects();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to delete project",
          message: String(error),
        });
      }
    }
  };

  const handleDeleteFromExtension = async (project: ProjectWithSettings) => {
    const confirmed = await confirmAlert({
      title: "Remove from Extension",
      message: `Remove "${project.settings.displayName || project.name}" from the extension?\n\nThis only removes the saved settings. The project folder (if it exists elsewhere) will not be affected.`,
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      if (project.settings.customIcon) {
        deleteCustomIcon(project.settings.customIcon);
      }
      deleteProjectSettings(project.path);
      await showToast({
        style: Toast.Style.Success,
        title: "Removed from extension",
        message: project.settings.displayName || project.name,
      });
      loadProjects();
    }
  };

  const handleRelocateProject = (project: ProjectWithSettings) => {
    push(
      <Form
        navigationTitle="Relocate Project"
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Relocate"
              onSubmit={async (values: { newPath: string[] }) => {
                const newPath = values.newPath?.[0];
                if (!newPath) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "No directory selected",
                  });
                  return;
                }

                if (!isProject(newPath)) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Invalid project directory",
                    message: "Selected folder is not a recognized project",
                  });
                  return;
                }

                migrateProjectSettings(project.path, newPath);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Project relocated",
                  message: `Moved settings to ${newPath}`,
                });
                loadProjects();
              }}
            />
          </ActionPanel>
        }
      >
        <Form.Description
          title="Missing Project"
          text={`The project "${project.settings.displayName || project.name}" was not found at:\n${project.path}\n\nSelect the new location:`}
        />
        <Form.FilePicker
          id="newPath"
          title="New Location"
          allowMultipleSelection={false}
          canChooseDirectories={true}
          canChooseFiles={false}
        />
      </Form>,
    );
  };

  const applySuggestion = (filter: string) => {
    setSearchText(filter + " ");
  };

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      searchBarPlaceholder="Search projects... (#collection, lang:, org:)"
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
      {searchSuggestions.length > 0 && (
        <List.Section title="Suggestions" subtitle="Tab or Enter to apply">
          {searchSuggestions.map((suggestion) => (
            <List.Item
              key={suggestion.id}
              title={suggestion.title}
              subtitle={suggestion.subtitle}
              icon={{ source: suggestion.icon, tintColor: Color.SecondaryText }}
              actions={
                <ActionPanel>
                  <Action
                    title="Apply Filter"
                    icon={Icon.Filter}
                    onAction={() => applySuggestion(suggestion.filter)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {groupedProjects.length === 0 &&
      searchSuggestions.length === 0 &&
      !isLoading ? (
        <List.EmptyView
          title="No projects found"
          description="No projects match your search"
        />
      ) : (
        groupedProjects.map((group) => (
          <List.Section
            key={group.title}
            title={`${group.title} · ${group.projects.length}`}
          >
            {group.projects.map((project) => {
              const relativeTime = formatRelativeTime(project.lastOpened);
              // Show collection icons + names when in auto groups (Recent, Uncategorized, flat)
              const collectionAccessories = group.isAuto
                ? getCollectionAccessories(project)
                : [];

              // Add divider between collections and time if both exist
              const showDivider =
                collectionAccessories.length > 0 && relativeTime;

              return (
                <List.Item
                  key={project.path}
                  title={project.settings.displayName || project.name}
                  accessories={[
                    ...(project.missing
                      ? [
                          {
                            text: "Not found",
                            icon: {
                              source: Icon.Warning,
                              tintColor: Color.Red,
                            },
                          },
                        ]
                      : []),
                    ...collectionAccessories,
                    ...(showDivider ? [{ text: "|" }] : []),
                    ...(!project.missing && relativeTime
                      ? [{ text: relativeTime }]
                      : []),
                  ]}
                  icon={
                    project.missing
                      ? { source: Icon.ExclamationMark, tintColor: Color.Red }
                      : getProjectIcon(
                          project.settings,
                          project.settings.displayName || project.name,
                        )
                  }
                  keywords={[
                    project.name,
                    project.settings.displayName || "",
                  ].filter(Boolean)}
                  actions={
                    project.missing ? (
                      <ActionPanel>
                        <ActionPanel.Section>
                          <Action
                            title="Relocate Project…"
                            icon={Icon.Folder}
                            onAction={() => handleRelocateProject(project)}
                          />
                          <Action
                            title="Remove from Extension"
                            icon={Icon.Trash}
                            style={Action.Style.Destructive}
                            onAction={() => handleDeleteFromExtension(project)}
                          />
                        </ActionPanel.Section>
                        <ActionPanel.Section>
                          <Action.CopyToClipboard
                            title="Copy Original Path"
                            content={project.path}
                          />
                        </ActionPanel.Section>
                      </ActionPanel>
                    ) : (
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
                        <ActionPanel.Section>
                          <Action
                            title="Delete Project"
                            icon={Icon.Trash}
                            style={Action.Style.Destructive}
                            shortcut={{ modifiers: ["ctrl"], key: "x" }}
                            onAction={() => handleDelete(project)}
                          />
                        </ActionPanel.Section>
                      </ActionPanel>
                    )
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
