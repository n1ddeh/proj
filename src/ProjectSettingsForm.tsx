import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useMemo } from "react";
import {
  getProjectSettings,
  saveProjectSettings,
  copyCustomIcon,
  deleteCustomIcon,
  ProjectIDE,
} from "./settings";
import { ICON_COLORS, generateInitialsIcon, getProjectInitials } from "./utils";
import { getAllCollections } from "./collections";
import { basename, extname } from "path";

const SUPPORTED_IMAGE_TYPES = ["png", "jpg", "jpeg", "svg", "webp"];

interface ProjectSettingsFormProps {
  projectPath: string;
  projectName: string;
  onSave: () => void;
}

// Convert camelCase to Title Case (e.g., "checkCircle" -> "Check Circle")
function toTitleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Dynamically get all icons from the Raycast Icon enum
function getAvailableIcons(): { value: string; title: string; icon: Icon }[] {
  const icons: { value: string; title: string; icon: Icon }[] = [
    { value: "", title: "Default (Folder)", icon: Icon.Folder },
  ];

  // Get all keys from the Icon enum that are actual icons (strings pointing to icon paths)
  for (const key of Object.keys(Icon)) {
    // Skip numeric keys (reverse mappings) and non-string values
    if (!isNaN(Number(key))) continue;

    const iconValue = Icon[key as keyof typeof Icon];
    // Only include if it's a valid icon (string path or symbol)
    if (typeof iconValue === "string" || typeof iconValue === "symbol") {
      icons.push({
        value: key,
        title: toTitleCase(key),
        icon: iconValue as Icon,
      });
    }
  }

  // Sort alphabetically by title (keeping Default first)
  return [
    icons[0],
    ...icons.slice(1).sort((a, b) => a.title.localeCompare(b.title)),
  ];
}

export function iconFromString(iconName: string | undefined): Icon | undefined {
  if (!iconName) return undefined;
  return Icon[iconName as keyof typeof Icon];
}

function getAppName(appPath: string): string {
  const name = basename(appPath);
  return name.endsWith(".app") ? name.slice(0, -4) : name;
}

export default function ProjectSettingsForm({
  projectPath,
  projectName,
  onSave,
}: ProjectSettingsFormProps) {
  const { pop } = useNavigation();
  const existingSettings = getProjectSettings(projectPath);

  const [displayName, setDisplayName] = useState(
    existingSettings.displayName || "",
  );
  const [icon, setIcon] = useState(existingSettings.icon || "");
  const [iconColor, setIconColor] = useState(
    existingSettings.iconColor || ICON_COLORS[0].value,
  );
  const [ideApp, setIdeApp] = useState<string[]>(
    existingSettings.ide?.path ? [existingSettings.ide.path] : [],
  );
  const [collections, setCollections] = useState<string[]>(
    existingSettings.collections || [],
  );
  const [customIcon, setCustomIcon] = useState<string[]>(
    existingSettings.customIcon ? [existingSettings.customIcon] : [],
  );

  // Memoize icon list to avoid recalculating on every render
  const availableIcons = useMemo(() => getAvailableIcons(), []);

  // Get all manual collections for the picker
  const manualCollections = useMemo(() => {
    return getAllCollections().filter((c) => c.type === "manual");
  }, []);

  async function handleSubmit() {
    let ide: ProjectIDE | undefined;
    if (ideApp.length > 0 && ideApp[0]) {
      ide = {
        path: ideApp[0],
        name: getAppName(ideApp[0]),
      };
    }

    // Handle custom icon
    let customIconPath: string | undefined = existingSettings.customIcon;

    if (customIcon.length > 0 && customIcon[0]) {
      const selectedFile = customIcon[0];
      const ext = extname(selectedFile).slice(1).toLowerCase();

      if (!SUPPORTED_IMAGE_TYPES.includes(ext)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid image format",
          message: `Supported formats: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
        });
        return;
      }

      // Only copy if it's a new file (not already in our custom-icons dir)
      if (selectedFile !== existingSettings.customIcon) {
        // Delete old custom icon if exists
        if (existingSettings.customIcon) {
          deleteCustomIcon(existingSettings.customIcon);
        }
        customIconPath = copyCustomIcon(projectPath, selectedFile);
      }
    } else if (existingSettings.customIcon) {
      // Custom icon was cleared
      deleteCustomIcon(existingSettings.customIcon);
      customIconPath = undefined;
    }

    saveProjectSettings(projectPath, {
      displayName: displayName.trim() || undefined,
      icon: icon || undefined,
      customIcon: customIconPath,
      iconColor: iconColor || undefined,
      ide,
      collections: collections.length > 0 ? collections : undefined,
      lastOpened: existingSettings.lastOpened,
    });

    await showToast({
      style: Toast.Style.Success,
      title: "Settings saved",
    });

    onSave();
    pop();
  }

  return (
    <Form
      navigationTitle={`Settings: ${projectName}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Settings" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="displayName"
        title="Display Name"
        placeholder={projectName}
        info="Custom name to show in the project list"
        value={displayName}
        onChange={setDisplayName}
      />
      <Form.Dropdown id="icon" title="Icon" value={icon} onChange={setIcon}>
        {availableIcons.map((item) => (
          <Form.Dropdown.Item
            key={item.value || "default"}
            value={item.value}
            title={item.title}
            icon={item.icon}
          />
        ))}
      </Form.Dropdown>
      <Form.FilePicker
        id="customIcon"
        title="Custom Icon"
        info="Upload a custom image (overrides icon selection above)"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles={true}
        value={customIcon}
        onChange={setCustomIcon}
      />
      <Form.Dropdown
        id="iconColor"
        title="Icon Color"
        info="Background color for the initials icon (only applies when using default icon)"
        value={iconColor}
        onChange={setIconColor}
      >
        {ICON_COLORS.map((color) => (
          <Form.Dropdown.Item
            key={color.value}
            value={color.value}
            title={color.name}
            icon={generateInitialsIcon(
              getProjectInitials(displayName || projectName),
              color.value,
            )}
          />
        ))}
      </Form.Dropdown>
      <Form.FilePicker
        id="ide"
        title="IDE Override"
        info="Open this project with a different application (leave empty to use default)"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles={true}
        value={ideApp}
        onChange={setIdeApp}
      />
      <Form.Separator />
      <Form.TagPicker
        id="collections"
        title="Collections"
        info="Assign this project to collections for organization"
        value={collections}
        onChange={setCollections}
      >
        {manualCollections.map((collection) => (
          <Form.TagPicker.Item
            key={collection.id}
            value={collection.id}
            title={collection.name}
            icon={
              collection.icon
                ? Icon[collection.icon as keyof typeof Icon]
                : Icon.Tag
            }
          />
        ))}
      </Form.TagPicker>
    </Form>
  );
}
