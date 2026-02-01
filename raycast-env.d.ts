/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** IDE Application - The application to open projects with */
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
  /** Preferences accessible in the `open-project` command */
  export type OpenProject = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-collections` command */
  export type ManageCollections = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `open-project` command */
  export type OpenProject = {}
  /** Arguments passed to the `manage-collections` command */
  export type ManageCollections = {}
}

