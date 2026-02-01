/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default IDE - Your default editor (VS Code, Cursor, JetBrains, etc). You can override this per-project later. */
  "ide"?: import("@raycast/api").Application,
  /** Projects Directory (Legacy) - Used for migration only. Configure sources in the extension. */
  "projectsDirectory": string,
  /** Search Depth (Legacy) - Used for migration only. Configure per-source depth in the extension. */
  "searchDepth": "1" | "2" | "3" | "4",
  /** Show Stale Indicator - Show red dot for projects not opened in 90+ days */
  "showStaleIndicator": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `projects` command */
  export type Projects = ExtensionPreferences & {}
  /** Preferences accessible in the `project-collections` command */
  export type ProjectCollections = ExtensionPreferences & {}
  /** Preferences accessible in the `add-projects` command */
  export type AddProjects = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `projects` command */
  export type Projects = {}
  /** Arguments passed to the `project-collections` command */
  export type ProjectCollections = {}
  /** Arguments passed to the `add-projects` command */
  export type AddProjects = {}
}

