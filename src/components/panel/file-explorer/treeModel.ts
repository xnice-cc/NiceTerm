import type { FileEntry } from "@/types/global";
import {
  compareFileEntries,
  type FileExplorerBackendKind,
  type FileSortMode,
  getExplorerParentDirectory,
  isMoveToSameDirectory,
  joinExplorerPath,
  matchesFileSearch,
  normalizeExplorerPath,
  pathStartsWithDirectory,
} from "./model";

/** A single visible row in the flattened file tree. */
export type FileTreeNode = {
  /** Normalized full path; unique node identity and React key. */
  path: string;
  name: string;
  depth: number;
  /**
   * Cache entry; carries `treePath` when the listing was augmented at load
   * time (see `withTreePath`) so row callbacks can resolve full paths.
   */
  entry: FileEntry;
  isDir: boolean;
};

/**
 * Tree rows pass entries back through callbacks that only know `FileEntry`;
 * carrying the row path on the entry keeps every path-dependent action
 * (selection, rename, transfer, context menus) working without changing
 * the shared component contracts.
 */
export type PathAwareFileEntry = FileEntry & { treePath: string };

export function withTreePath(entry: FileEntry, path: string): PathAwareFileEntry {
  return { ...entry, treePath: path };
}

export function getEntryTreePath(entry: FileEntry | null | undefined): string | null {
  if (!entry) return null;
  return typeof (entry as PathAwareFileEntry).treePath === "string"
    ? (entry as PathAwareFileEntry).treePath
    : null;
}

export type TreeChildrenCache = Map<string, FileEntry[]>;

/**
 * Flattened tree state persisted per session so the expansion survives
 * switching between sessions or remounting the explorer panel.
 */
export type FileTreeState = {
  rootPath: string;
  expandedPaths: string[];
};

const treeChildrenCacheStore = new Map<string, FileEntry[]>();

function treeCachePrefix(sessionId: string, backend: FileExplorerBackendKind) {
  return `${sessionId}|${backend}|`;
}

function treeCacheKey(
  sessionId: string,
  backend: FileExplorerBackendKind,
  path: string,
) {
  return `${treeCachePrefix(sessionId, backend)}${normalizeExplorerPath(path, backend)}`;
}

export function getTreeChildren(
  sessionId: string | null | undefined,
  backend: FileExplorerBackendKind,
  path: string,
): FileEntry[] | undefined {
  if (!sessionId) return undefined;
  return treeChildrenCacheStore.get(treeCacheKey(sessionId, backend, path));
}

export function setTreeChildren(
  sessionId: string | null | undefined,
  backend: FileExplorerBackendKind,
  path: string,
  entries: FileEntry[],
) {
  if (!sessionId) return;
  const key = treeCacheKey(sessionId, backend, path);
  if (entries.length === 0) {
    treeChildrenCacheStore.set(key, []);
    return;
  }
  treeChildrenCacheStore.set(key, entries);
}

const FILE_ENTRY_COMPARISON_KEYS = [
  "name",
  "is_dir",
  "is_symlink",
  "size",
  "mtime",
  "permissions",
  "owner",
  "group",
] as const;

function isSameFileEntry(left: FileEntry, right: FileEntry) {
  if (left === right) return true;
  for (const key of FILE_ENTRY_COMPARISON_KEYS) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function isSameFileEntries(
  left: FileEntry[] | undefined,
  right: FileEntry[] | undefined,
) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!isSameFileEntry(left[index], right[index])) return false;
  }
  return true;
}

/**
 * Builds the render cache for a restored session. Directories whose cached
 * listing is content-identical to what is currently displayed reuse the
 * current entries (and the current Map itself when everything matches) so
 * switching sessions does not re-render unchanged file nodes.
 */
export function reconcileRestoredChildrenCache(
  cached: TreeChildrenCache | undefined,
  current: TreeChildrenCache,
): TreeChildrenCache {
  if (!cached) return current.size === 0 ? current : new Map();

  let identical = cached.size === current.size;
  const next: TreeChildrenCache = new Map();
  for (const [dir, entries] of cached) {
    const currentEntries = current.get(dir);
    if (currentEntries && isSameFileEntries(currentEntries, entries)) {
      next.set(dir, currentEntries);
      continue;
    }
    identical = false;
    next.set(dir, entries);
  }
  return identical ? current : next;
}

/** Clears the cached children of one directory and of all its descendants. */
export function clearTreeChildrenForPath(
  sessionId: string | null | undefined,
  backend: FileExplorerBackendKind,
  path: string,
) {
  if (!sessionId) return;
  const normalizedPath = normalizeExplorerPath(path, backend);
  if (!normalizedPath) return;
  const prefix = treeCachePrefix(sessionId, backend);
  for (const key of [...treeChildrenCacheStore.keys()]) {
    if (!key.startsWith(prefix)) continue;
    if (pathStartsWithDirectory(key.slice(prefix.length), normalizedPath, backend)) {
      treeChildrenCacheStore.delete(key);
    }
  }
}

export function clearTreeChildrenForSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  for (const key of [...treeChildrenCacheStore.keys()]) {
    if (key.startsWith(`${sessionId}|`)) {
      treeChildrenCacheStore.delete(key);
    }
  }
}

export interface FlattenFileTreeParams {
  rootPath: string;
  childrenCache: Map<string, FileEntry[]>;
  expandedPaths: Set<string>;
  sortMode: FileSortMode;
  showHidden: boolean;
  backend: FileExplorerBackendKind;
  searchQuery: string;
}

/**
 * Flattens the visible tree below the root. The root itself is never
 * rendered — it only acts as the invisible container — so the tree starts
 * directly with the root's children at depth 0. Other directories render
 * their children only while present in `expandedPaths`. When `searchQuery`
 * is active the visible set becomes "matching nodes plus the directories
 * on their ancestor path" (directories containing matches are temporarily
 * expanded without mutating the persisted expansion state).
 */
export function flattenFileTree({
  rootPath,
  childrenCache,
  expandedPaths,
  sortMode,
  showHidden,
  backend,
  searchQuery,
}: FlattenFileTreeParams): FileTreeNode[] {
  const normalizedRoot = normalizeExplorerPath(rootPath, backend);
  if (!normalizedRoot) return [];

  const nodes: FileTreeNode[] = [];

  const query = searchQuery.trim();
  if (query) {
    appendSearchDescendants(nodes, childrenCache, {
      dirPath: normalizedRoot,
      depth: 0,
      sortMode,
      showHidden,
      backend,
      query,
    });
    return nodes;
  }

  appendChildNodes(nodes, childrenCache, {
    dirPath: normalizedRoot,
    depth: 0,
    sortMode,
    showHidden,
    backend,
    expandedPaths,
  });
  return nodes;
}

interface AppendChildrenParams {
  dirPath: string;
  depth: number;
  sortMode: FileSortMode;
  showHidden: boolean;
  backend: FileExplorerBackendKind;
}

function getSortedChildren(
  childrenCache: Map<string, FileEntry[]>,
  { dirPath, sortMode, showHidden }: AppendChildrenParams,
) {
  const entries = childrenCache.get(dirPath);
  if (!entries) return null;
  const visible = showHidden
    ? entries
    : entries.filter((entry) => !entry.name.startsWith("."));
  return [...visible].sort((left, right) =>
    compareFileEntries(left, right, sortMode),
  );
}

function appendChildNodes(
  nodes: FileTreeNode[],
  childrenCache: Map<string, FileEntry[]>,
  params: AppendChildrenParams & { expandedPaths: Set<string> },
) {
  const sorted = getSortedChildren(childrenCache, params);
  if (!sorted) return;
  const { dirPath, depth, backend, expandedPaths } = params;

  for (const entry of sorted) {
    const childPath = joinExplorerPath(dirPath, entry.name, backend);
    nodes.push({
      path: childPath,
      name: entry.name,
      depth,
      entry,
      isDir: entry.is_dir,
    });
    if (entry.is_dir && expandedPaths.has(childPath)) {
      appendChildNodes(nodes, childrenCache, {
        ...params,
        dirPath: childPath,
        depth: depth + 1,
      });
    }
  }
}

interface AppendSearchParams extends AppendChildrenParams {
  query: string;
}

/**
 * Depth-first search over cached listings: a node is visible when its name
 * matches, or when it is a directory whose cached subtree contains a match.
 * Matching directories are not force-expanded; only directories on the path
 * to a deeper match expand to reveal it.
 */
function appendSearchDescendants(
  nodes: FileTreeNode[],
  childrenCache: Map<string, FileEntry[]>,
  params: AppendSearchParams,
): boolean {
  const sorted = getSortedChildren(childrenCache, params);
  if (!sorted) return false;
  const { dirPath, depth, backend, query } = params;
  let anyMatch = false;

  for (const entry of sorted) {
    const childPath = joinExplorerPath(dirPath, entry.name, backend);
    const node: FileTreeNode = {
      path: childPath,
      name: entry.name,
      depth,
      entry,
      isDir: entry.is_dir,
    };

    if (matchesFileSearch(entry, query)) {
      nodes.push(node);
      anyMatch = true;
      continue;
    }

    if (!entry.is_dir) continue;

    // Non-matching directory: visible only when its cached subtree contains
    // a match; the parent row is spliced in front of the appended subtree.
    const subtreeStart = nodes.length;
    const subtreeMatches = appendSearchDescendants(nodes, childrenCache, {
      ...params,
      dirPath: childPath,
      depth: depth + 1,
    });
    if (subtreeMatches) {
      nodes.splice(subtreeStart, 0, node);
      anyMatch = true;
    }
  }

  return anyMatch;
}

/**
 * Returns the chain of directories from `rootPath` down to (and including)
 * `targetPath`, or null when the target is not located under the root.
 */
export function getAncestorPaths(
  rootPath: string,
  targetPath: string,
  backend: FileExplorerBackendKind,
): string[] | null {
  const root = normalizeExplorerPath(rootPath, backend);
  const target = normalizeExplorerPath(targetPath, backend);
  if (!root || !target) return null;
  if (isMoveToSameDirectory(root, target, backend)) return [root];
  if (!pathStartsWithDirectory(target, root, backend)) return null;

  const chain: string[] = [];
  let current = target;
  let guard = 0;
  while (!isMoveToSameDirectory(current, root, backend)) {
    const parent = getExplorerParentDirectory(current, backend);
    if (parent === current || guard > 4096) return null;
    chain.unshift(current);
    current = parent;
    guard += 1;
  }
  return [root, ...chain];
}

/** Expansion set that keeps only the path to one target directory. */
export function collapseToAncestors(ancestors: string[]): Set<string> {
  return new Set(ancestors);
}

/**
 * Walks a path up to the filesystem top so the tree can start at the
 * outermost level: "/" for remote paths, the drive or UNC share root for
 * local Windows paths.
 */
export function getFilesystemTop(
  path: string,
  backend: FileExplorerBackendKind,
): string {
  const normalized = normalizeExplorerPath(path, backend);
  if (!normalized) return normalized;
  let current = normalized;
  let guard = 0;
  while (guard < 4096) {
    const parent = getExplorerParentDirectory(current, backend);
    if (parent === current) return current;
    current = parent;
    guard += 1;
  }
  return current;
}
