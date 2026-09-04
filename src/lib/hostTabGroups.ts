import type { Tab } from "@/types/global";
import { getActivePane } from "./workspaceTabs";

/**
 * Terminal tab layout: host terminals merged under one level-1 tab
 * ("grouped") or the classic flat one-tab-per-session strip ("flat").
 */
export type TabLayoutMode = "grouped" | "flat";

export type HostTabGroup =
  | { kind: "single"; key: string; tab: Tab }
  | { kind: "host"; key: string; connectionId: string; tabs: Tab[] };

/** SSH tabs sharing one saved connection merge into a host group. */
export function getTabHostConnectionId(tab: Tab): string | null {
  const pane = getActivePane(tab);
  if (!pane || pane.paneKind !== "terminal" || !pane.connectionId) {
    return null;
  }
  return pane.type === "SSH" ? pane.connectionId : null;
}

/**
 * Connection a tab groups by: SSH terminals group by their host connection,
 * file documents join the host they were opened from. Tabs without a
 * grouping connection (local shells, unknown connections) stay standalone.
 */
export function getTabGroupingConnectionId(tab: Tab): string | null {
  const pane = getActivePane(tab);
  if (!pane) return null;
  if (pane.paneKind === "file") {
    return pane.connectionId ?? null;
  }
  return getTabHostConnectionId(tab);
}

/**
 * Groups a flat tab list for the level-1 strip: consecutive SSH tabs that
 * share a connection collapse into one host entry (positioned at the first
 * occurrence), every other tab stays a standalone entry. File documents of
 * a grouped host attach to that host group regardless of their position so
 * they surface as second-level tabs under the host.
 */
export function buildHostTabGroups(tabs: Tab[]): HostTabGroup[] {
  const groups: HostTabGroup[] = [];
  const hostIndexByConnectionId = new Map<string, number>();
  const pendingFileTabs: { tab: Tab; connectionId: string }[] = [];

  for (const tab of tabs) {
    const pane = getActivePane(tab);
    const connectionId = getTabGroupingConnectionId(tab);

    if (pane?.paneKind === "file" && connectionId) {
      const existingIndex = hostIndexByConnectionId.get(connectionId);
      const existingGroup =
        existingIndex === undefined ? undefined : groups[existingIndex];
      if (existingGroup && existingGroup.kind === "host") {
        existingGroup.tabs.push(tab);
        continue;
      }
      pendingFileTabs.push({ tab, connectionId });
      continue;
    }

    if (!connectionId) {
      groups.push({ kind: "single", key: `tab:${tab.id}`, tab });
      continue;
    }

    const existingIndex = hostIndexByConnectionId.get(connectionId);
    if (existingIndex === undefined) {
      hostIndexByConnectionId.set(connectionId, groups.length);
      groups.push({
        kind: "host",
        key: `host:${connectionId}`,
        connectionId,
        tabs: [tab],
      });
      continue;
    }

    const existingGroup = groups[existingIndex];
    if (existingGroup.kind === "host") {
      existingGroup.tabs.push(tab);
    }
  }

  // File tabs seen before their host group (e.g. after drag-reorder) attach
  // once the group exists; connections without terminals stay standalone.
  for (const pending of pendingFileTabs) {
    const index = hostIndexByConnectionId.get(pending.connectionId);
    const group = index === undefined ? undefined : groups[index];
    if (group && group.kind === "host") {
      group.tabs.push(pending.tab);
    } else {
      groups.push({ kind: "single", key: `tab:${pending.tab.id}`, tab: pending.tab });
    }
  }

  return groups;
}

export function findHostGroupForTab(
  groups: HostTabGroup[],
  tabId: string,
): Extract<HostTabGroup, { kind: "host" }> | null {
  for (const group of groups) {
    if (group.kind === "host" && group.tabs.some((tab) => tab.id === tabId)) {
      return group;
    }
  }
  return null;
}
