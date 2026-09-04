import { describe, expect, it } from "vitest";
import {
  createFileDocumentPane,
  createSessionPane,
  createWorkspaceTab,
} from "./workspaceTabs";
import { buildHostTabGroups, getTabGroupingConnectionId } from "./hostTabGroups";
import type { Tab } from "@/types/global";

function terminalTab(connectionId?: string, name = "Host") {
  return createWorkspaceTab(createSessionPane(name, "SSH", connectionId), 0);
}

function fileTab(connectionId?: string, name = "/srv/notes.md") {
  return createWorkspaceTab(
    createFileDocumentPane({
      sessionId: "session-editor",
      name: name.split("/").pop() || name,
      type: "SSH",
      connectionId,
      backend: "remote",
      path: name,
      file: {
        content: "content",
        size: 12,
        mtime: 42,
        contentHash: "hash",
      },
    }),
    0,
  );
}

function activePaneKind(tab: Tab) {
  return tab.root.kind === "leaf" ? tab.root.paneKind : null;
}

describe("hostTabGroups file documents", () => {
  it("maps file documents to their connection and skips connectionless docs", () => {
    expect(getTabGroupingConnectionId(fileTab("ssh-1"))).toBe("ssh-1");
    expect(getTabGroupingConnectionId(fileTab())).toBeNull();
    expect(getTabGroupingConnectionId(terminalTab("ssh-1"))).toBe("ssh-1");
    expect(getTabGroupingConnectionId(terminalTab())).toBeNull();
  });

  it("attaches file documents opened after the host terminals", () => {
    const host = terminalTab("ssh-1");
    const document = fileTab("ssh-1");

    const groups = buildHostTabGroups([host, document]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "host", connectionId: "ssh-1" });
    if (groups[0].kind !== "host") return;
    expect(groups[0].tabs.map((tab) => activePaneKind(tab))).toEqual([
      "terminal",
      "file",
    ]);
  });

  it("attaches file documents that appear before the host group", () => {
    const document = fileTab("ssh-1");
    const host = terminalTab("ssh-1");

    const groups = buildHostTabGroups([document, host]);

    expect(groups).toHaveLength(1);
    if (groups[0].kind !== "host") return;
    expect(groups[0].tabs.map((tab) => activePaneKind(tab))).toEqual([
      "terminal",
      "file",
    ]);
  });

  it("keeps file documents standalone when no host group exists", () => {
    const document = fileTab("ssh-unknown");

    const groups = buildHostTabGroups([document]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "single" });
  });

  it("keeps local file documents and non-ssh tabs standalone", () => {
    const localShell = createWorkspaceTab(
      createSessionPane("Shell", "Local", "local-1"),
      0,
    );
    const localFile = fileTab("local-1", "/tmp/notes.md");
    const connectionlessFile = fileTab();

    const groups = buildHostTabGroups([
      localShell,
      localFile,
      connectionlessFile,
    ]);

    expect(groups.map((group) => group.kind)).toEqual([
      "single",
      "single",
      "single",
    ]);
  });

  it("keeps file documents of different hosts out of each other's groups", () => {
    const hostA = terminalTab("ssh-1");
    const hostB = terminalTab("ssh-2", "Host B");
    const documentA = fileTab("ssh-1");
    const documentB = fileTab("ssh-2", "/srv/other.md");

    const groups = buildHostTabGroups([
      hostA,
      hostB,
      documentA,
      documentB,
    ]);

    expect(groups).toHaveLength(2);
    if (groups[0].kind !== "host" || groups[1].kind !== "host") return;
    expect(groups[0].tabs.map((tab) => activePaneKind(tab))).toEqual([
      "terminal",
      "file",
    ]);
    expect(groups[1].tabs.map((tab) => activePaneKind(tab))).toEqual([
      "terminal",
      "file",
    ]);
  });
});
