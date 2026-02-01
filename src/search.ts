import type { EnhancedProject } from "./types";
import { expandPath } from "./utils";

export interface SearchFilters {
  collection?: string;
  lang?: string;
  org?: string;
  inPath?: string;
}

export interface ParsedSearch {
  text: string;
  filters: SearchFilters;
}

const SPECIAL_COLLECTIONS: Record<string, string> = {
  recent: "_recent",
  stale: "_stale",
  month: "_month",
  uncategorized: "_uncategorized",
};

export function parseSearchQuery(query: string): ParsedSearch {
  const filters: SearchFilters = {};
  const textParts: string[] = [];

  const tokens = query.trim().split(/\s+/);

  for (const token of tokens) {
    if (token.startsWith("#")) {
      const collName = token.slice(1).toLowerCase();
      filters.collection = SPECIAL_COLLECTIONS[collName] || collName;
    } else if (token.startsWith("lang:")) {
      filters.lang = token.slice(5).toLowerCase();
    } else if (token.startsWith("org:")) {
      filters.org = token.slice(4).toLowerCase();
    } else if (token.startsWith("in:")) {
      filters.inPath = token.slice(3);
    } else if (token) {
      textParts.push(token);
    }
  }

  return {
    text: textParts.join(" "),
    filters,
  };
}

export function matchesSearch(
  project: EnhancedProject,
  query: ParsedSearch,
): boolean {
  // Check text match
  if (query.text) {
    const searchText = query.text.toLowerCase();
    const projectName = project.name.toLowerCase();
    if (!projectName.includes(searchText)) {
      return false;
    }
  }

  // Check collection filter
  if (query.filters.collection) {
    const hasCollection = project.collections?.includes(
      query.filters.collection,
    );
    if (!hasCollection) return false;
  }

  // Check language filter
  if (query.filters.lang) {
    if (project.detectedLang?.toLowerCase() !== query.filters.lang) {
      return false;
    }
  }

  // Check org filter
  if (query.filters.org) {
    if (!project.gitOrg?.toLowerCase().includes(query.filters.org)) {
      return false;
    }
  }

  // Check path filter
  if (query.filters.inPath) {
    const expandedFilter = expandPath(query.filters.inPath);
    if (!project.path.startsWith(expandedFilter)) {
      return false;
    }
  }

  return true;
}
