import { beforeEach, describe, expect, it } from "vitest";
import type { FileEntry } from "@/types/global";
import {
  clearTreeChildrenForPath,
  clearTreeChildrenForSession,
  collapseToAncestors,
  flattenFileTree,
  getAncestorPaths,
  getFilesystemTop,
  getTreeChildren,
  setTreeChildren,
} from "./treeModel";
import type { FileSortMode } from "./model";

function entry(name: string, isDir = false): FileEntry {
  return {
    name,
    is_dir: isDir,
    is_symlink: false,
    size: isDir ? 0 : 10,
    permissions: "-rw-r--r--",
    owner: "root",
    group: "root",
    mtime: 100,
  };
}

const SORT: FileSortMode = { column: "name", direction: "asc" };

function flatten(params: Partial<Parameters<typeof flattenFileTree>[0]>) {
  return flattenFileTree({
    rootPath: "/home/user",
    childrenCache: new Map(),
    expandedPaths: new Set(),
    sortMode: SORT,
    showHidden: true,
    backend: "remote",
    searchQuery: "",
    ...params,
  });
}

describe("flattenFileTree", () => {
  it("renders nothing when no children are cached", () => {
    expect(flatten({})).toEqual([]);
  });

  it("renders cached children sorted with directories first", () => {
    const nodes = flatten({
      childrenCache: new Map([
        ["/home/user", [entry("zeta.txt"), entry("beta", true), entry("alpha.txt")]],
      ]),
    });
    expect(nodes.map((n) => n.name)).toEqual(["beta", "alpha.txt", "zeta.txt"]);
    expect(nodes[0]).toMatchObject({ path: "/home/user/beta", depth: 0 });
  });

  it("hides dotfiles when showHidden is false", () => {
    const nodes = flatten({
      showHidden: false,
      childrenCache: new Map([
        ["/home/user", [entry(".secret"), entry("visible.txt")]],
      ]),
    });
    expect(nodes.map((n) => n.name)).toEqual(["visible.txt"]);
  });

  it("expands directories listed in expandedPaths", () => {
    const nodes = flatten({
      expandedPaths: new Set(["/home/user/projects"]),
      childrenCache: new Map([
        ["/home/user", [entry("projects", true), entry("readme.md")]],
        ["/home/user/projects", [entry("app", true)]],
      ]),
    });
    expect(nodes.map((n) => n.path)).toEqual([
      "/home/user/projects",
      "/home/user/projects/app",
      "/home/user/readme.md",
    ]);
    expect(nodes[1]).toMatchObject({ depth: 1 });
  });

  it("ignores expanded paths without cached children", () => {
    const nodes = flatten({
      expandedPaths: new Set(["/home/user/ghost"]),
      childrenCache: new Map([["/home/user", [entry("a.txt")]]]),
    });
    expect(nodes.map((n) => n.name)).toEqual(["a.txt"]);
  });

  it("keeps search results with their ancestor directories", () => {
    const nodes = flatten({
      searchQuery: "target",
      expandedPaths: new Set(["/home/user/other"]),
      childrenCache: new Map([
        ["/home/user", [entry("docs", true), entry("other", true)]],
        ["/home/user/docs", [entry("target.md"), entry("nope.txt")]],
        ["/home/user/other", [entry("nomatch-dir", true)]],
      ]),
    });
    expect(nodes.map((n) => n.path)).toEqual([
      "/home/user/docs",
      "/home/user/docs/target.md",
    ]);
  });

  it("shows a matching directory without expanding it", () => {
    const nodes = flatten({
      searchQuery: "docs",
      childrenCache: new Map([
        ["/home/user", [entry("docs", true)]],
        ["/home/user/docs", [entry("inner.txt")]],
      ]),
    });
    expect(nodes.map((n) => n.path)).toEqual(["/home/user/docs"]);
  });
});

describe("getAncestorPaths", () => {
  it("returns only the root when target equals the root", () => {
    expect(getAncestorPaths("/home/user", "/home/user/", "remote")).toEqual([
      "/home/user",
    ]);
  });

  it("returns the chain from root to target", () => {
    expect(
      getAncestorPaths("/home/user", "/home/user/projects/app", "remote"),
    ).toEqual(["/home/user", "/home/user/projects", "/home/user/projects/app"]);
  });

  it("returns null when the target is outside the root", () => {
    expect(getAncestorPaths("/home/user", "/etc", "remote")).toBeNull();
  });

  it("handles case-insensitive local paths", () => {
    expect(
      getAncestorPaths(
        "C:\\Users\\dev",
        "c:\\users\\dev\\projects\\app",
        "local",
      ),
    ).toEqual([
      "C:\\Users\\dev",
      "c:\\users\\dev\\projects",
      "c:\\users\\dev\\projects\\app",
    ]);
  });
});

describe("collapseToAncestors", () => {
  it("builds an expansion set from the ancestor chain", () => {
    const expanded = collapseToAncestors(["/a", "/a/b", "/a/b/c"]);
    expect(expanded.has("/a/b")).toBe(true);
    expect(expanded.has("/a/x")).toBe(false);
  });
});

describe("getFilesystemTop", () => {
  it("walks remote paths up to the root slash", () => {
    expect(getFilesystemTop("/home/user/projects", "remote")).toBe("/");
  });

  it("keeps the root slash as-is", () => {
    expect(getFilesystemTop("/", "remote")).toBe("/");
  });

  it("walks windows paths up to the drive root", () => {
    expect(getFilesystemTop("C:\\Users\\dev\\projects", "local")).toBe("C:\\");
  });

  it("walks unc paths up to the share root", () => {
    expect(getFilesystemTop("\\\\server\\share\\docs", "local")).toBe(
      "\\\\server\\share",
    );
  });
});

describe("tree children cache", () => {
  const sessionId = "session-tree-test";

  beforeEach(() => {
    clearTreeChildrenForSession(sessionId);
  });

  it("stores and reads directory listings", () => {
    setTreeChildren(sessionId, "remote", "/home/user", [entry("a.txt")]);
    expect(getTreeChildren(sessionId, "remote", "/home/user/")).toEqual([
      entry("a.txt"),
    ]);
    expect(getTreeChildren(sessionId, "remote", "/home/other")).toBeUndefined();
  });

  it("clears a directory and its descendants but keeps siblings", () => {
    setTreeChildren(sessionId, "remote", "/home/user", [entry("a.txt")]);
    setTreeChildren(sessionId, "remote", "/home/user/projects", [entry("b.txt")]);
    setTreeChildren(sessionId, "remote", "/home/user/projects/app", [entry("c.txt")]);
    setTreeChildren(sessionId, "remote", "/home/other", [entry("d.txt")]);

    clearTreeChildrenForPath(sessionId, "remote", "/home/user/projects");

    expect(getTreeChildren(sessionId, "remote", "/home/user")).toBeDefined();
    expect(
      getTreeChildren(sessionId, "remote", "/home/user/projects"),
    ).toBeUndefined();
    expect(
      getTreeChildren(sessionId, "remote", "/home/user/projects/app"),
    ).toBeUndefined();
    expect(getTreeChildren(sessionId, "remote", "/home/other")).toBeDefined();
  });

  it("clears every listing of a session without touching other sessions", () => {
    setTreeChildren(sessionId, "remote", "/home/user", [entry("a.txt")]);
    setTreeChildren("session-other", "remote", "/home/user", [entry("b.txt")]);

    clearTreeChildrenForSession(sessionId);

    expect(getTreeChildren(sessionId, "remote", "/home/user")).toBeUndefined();
    expect(getTreeChildren("session-other", "remote", "/home/user")).toBeDefined();
    clearTreeChildrenForSession("session-other");
  });
});
