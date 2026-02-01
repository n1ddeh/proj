# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Proj** - A Raycast extension that scans project directories, organizes them into collections, and lets users quickly open projects in their preferred IDE. Built with TypeScript and React using the Raycast API.

## Commands

```bash
bun run dev       # Start development mode with hot reload
bun run build     # Build the extension to dist/
bun run lint      # Run ESLint
bun run fix-lint  # Auto-fix linting issues
bun test          # Run tests
```

## Architecture

**Raycast Commands:**

- [src/open-project.tsx](src/open-project.tsx) - Main UI for browsing and opening projects
- [src/manage-collections.tsx](src/manage-collections.tsx) - UI for managing collections

**Core Logic:**

- [src/utils.ts](src/utils.ts) - Project scanning (`findProjects`), language detection, git org extraction
- [src/settings.ts](src/settings.ts) - Per-project settings (display name, icon, IDE override)
- [src/sources.ts](src/sources.ts) - Multiple source directory management
- [src/collections.ts](src/collections.ts) - Manual and auto collection management
- [src/search.ts](src/search.ts) - Search query parsing (`#collection`, `lang:`, `org:`, `in:`)
- [src/recency.ts](src/recency.ts) - Last-opened tracking and relative time formatting
- [src/migration.ts](src/migration.ts) - Legacy preference migration
- [src/types.ts](src/types.ts) - Shared TypeScript types and auto-collection definitions

**Forms:**

- [src/ProjectSettingsForm.tsx](src/ProjectSettingsForm.tsx) - Edit project settings
- [src/CollectionForm.tsx](src/CollectionForm.tsx) - Create/edit collections
- [src/AddToCollectionForm.tsx](src/AddToCollectionForm.tsx) - Add project to collection

**Project Detection:**

- Scans directories recursively up to configurable depth (1-4 levels)
- Marker files: `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`, `Gemfile`, `composer.json`, `Package.swift`, `pubspec.yaml`, `mix.exs`, `build.sbt`, `pom.xml`, `build.gradle`, `CMakeLists.txt`, `Makefile`
- Excluded directories: `node_modules`, `.git`, `dist`, `build`, `vendor`, `target`, `.next`, `.venv`, `venv`, `__pycache__`, `.cache`, `coverage`, `.turbo`, `.output`

**Data Storage (in Raycast's support directory):**

- `project-settings.json` - Per-project customization
- `sources.json` - Configured source directories
- `collections.json` - User-created collections

## Key Implementation Details

- Uses synchronous `fs` operations for directory scanning
- Supports tilde expansion for paths (`~/...`)
- Auto-detects project language from marker files
- Extracts git organization from `.git/config` remote URL
- Auto collections: Recent (7 days), This Month (30 days), Stale (90+ days), Uncategorized
- Legacy single-directory config auto-migrates to new sources system
