/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** IDE Application - The application to open projects with */
  "ide"?: import("@raycast/api").Application,
  /** Projects Directory - The root directory containing your projects */
  "projectsDirectory": string,
  /** Search Depth - How many levels deep to search for projects */
  "searchDepth": "1" | "2" | "3" | "4"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `open-project` command */
  export type OpenProject = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `open-project` command */
  export type OpenProject = {}
}

