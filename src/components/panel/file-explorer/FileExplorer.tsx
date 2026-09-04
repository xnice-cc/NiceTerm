import { emit, listen } from "@tauri-apps/api/event";
import { downloadDir, join, tempDir } from "@tauri-apps/api/path";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  type CSSProperties,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LuClipboardPaste, LuFolderSync } from "react-icons/lu";
import {
  MdClose,
  MdContentCopy,
  MdCreateNewFolder,
  MdDriveFolderUpload,
  MdFolderOff,
  MdInfo,
  MdLink,
  MdNoteAdd,
  MdRefresh,
  MdSyncLock,
  MdUpload,
} from "react-icons/md";
import { PiColumnsPlusRightBold } from "react-icons/pi";
import { toast } from "sonner";
import type {
  DeleteDialogData,
  DeleteDialogItem,
} from "@/components/dialog/file-explorer/DeleteDialog";
import type { MoveDialogData } from "@/components/dialog/file-explorer/MoveDialog";
import type { NewItemDialogData } from "@/components/dialog/file-explorer/NewItemDialog";
import type { NewSymlinkDialogData } from "@/components/dialog/file-explorer/NewSymlinkDialog";
import type { PropertiesDialogData } from "@/components/dialog/file-explorer/PropertiesDialog";
import ExternalFileDropOverlay from "@/components/ExternalFileDropOverlay";
import PanelHeader from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useApp } from "@/context/AppContext";
import { useTransfer } from "@/context/TransferContext";
import { resolveShortcutKeys } from "@/hooks/useShortcutMap";
import { openAIAssistant } from "@/lib/aiEvents";
import { getErrorMessage } from "@/lib/errors";
import { MAX_EDITOR_FILE_BYTES } from "@/lib/fileEditorLimits";
import { invoke } from "@/lib/invoke";
import { logger } from "@/lib/logger";
import { sendSessionInput, sendSessionInputWithSync } from "@/lib/sessionInput";
import { listenTerminalCommandSubmitted } from "@/lib/terminalCommandEvents";
import { matchesKeyEvent } from "@/lib/shortcutRegistry";
import { getSessionInputPeerIds } from "@/lib/syncInputGroups";
import { cn, formatSize } from "@/lib/utils";
import type { FileWindowTarget } from "@/lib/windowManager";
import { openAutoUpload, openFilePreview, openRemoteFileEditor } from "@/lib/windowManager";
import { findOpenFileDocument } from "@/lib/workspaceTabs";
import type {
  AICustomActionConfig,
  FileEntry,
  FileExplorerProps,
  SavedConnection,
  SessionInfo,
  SessionType,
} from "@/types/global";
import { resolveFileEditorOpenTarget, resolveInternalEditorDisplay } from "./editorOpenMode";
import { FileExplorerDialogs } from "./FileExplorerDialogs";
import {
  clearDirectoryChildrenCacheForPath,
  clearDirectoryChildrenCacheForSession,
  FileExplorerPathBar,
} from "./FileExplorerPathBar";
import { FileExplorerToolbar } from "./FileExplorerToolbar";
import FileListItem from "./FileListItem";
import {
  buildRemoteUploadPath,
  buildSessionCacheSnapshot,
  type DirectoryChild,
  FILE_LIST_ITEM_HEIGHT,
  FILE_LIST_OVERSCAN,
  type FileExplorerBackendKind,
  type FileSortMode,
  fileExplorerSessionCacheStore,
  getExplorerParentDirectory,
  getLocalPathName,
  type InlineRenameState,
  isParentDirectoryEntry,
  joinExplorerPath,
  type LoadDirectoryOptions,
  type MoveDialogItem,
  normalizeDirectoryPath,
  normalizeExplorerPath,
  pathStartsWithDirectory,
  pushVisitedHistory,
  type RemoteTextFile,
  type ResolvedLocalDropPathEntry,
  syncExplorerDirectoryToTerminalCwd,
  syncExplorerDirectoryToTerminalCwdChange,
  type TextFileOpenResult,
} from "./model";
import {
  clearTreeChildrenForPath,
  clearTreeChildrenForSession,
  collapseToAncestors,
  flattenFileTree,
  getAncestorPaths,
  getEntryTreePath,
  getFilesystemTop,
  getTreeChildren,
  reconcileRestoredChildrenCache,
  setTreeChildren,
  withTreePath,
  type TreeChildrenCache,
} from "./treeModel";
import { useExternalFileDrop } from "./useExternalFileDrop";

const MemoizedFileExplorer = memo(FileExplorer);

/** Stable empty array so memoized rows skip re-render for directory rows. */
const EMPTY_AI_ACTIONS: AICustomActionConfig[] = [];

export default MemoizedFileExplorer;

type FileExplorerPaneEndpoint = {
  sessionId: string;
  kind: "local" | "remote";
  currentPath: string;
};

type FileExplorerCopyEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type FileExplorerSendTargetOption = {
  sessionId: string;
  label: string;
  meta: string;
};

interface FileExplorerPaneExtraProps {
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  peerEndpoint?: FileExplorerPaneEndpoint | null;
  onOpenPeerSelector?: () => void;
  onDirectoryStateChange?: (state: FileExplorerPaneEndpoint | null) => void;
  sendTargetOptions?: FileExplorerSendTargetOption[];
  onSendEntriesToTarget?: (
    source: FileExplorerPaneEndpoint,
    entries: FileExplorerCopyEntry[],
    targetSessionId: string,
  ) => void;
}

function isFileBrowsableSession(session: SessionInfo) {
  return (
    session.connected &&
    (session.session_type === "Local" ||
      (session.session_type === "SSH" && session.remote_file_browser_enabled))
  );
}

function toFileExplorerSessionType(session: SessionInfo): SessionType | null {
  return session.session_type === "Local" || session.session_type === "SSH"
    ? session.session_type
    : null;
}

function getSessionExplorerKind(session: SessionInfo): FileExplorerBackendKind {
  return session.session_type === "Local" ? "local" : "remote";
}

function formatConnectionTargetDetail(connection: SavedConnection) {
  if (connection.type === "ssh" && connection.host) {
    const hostWithPort = connection.port
      ? `${connection.host}:${connection.port}`
      : connection.host;
    return connection.username
      ? `${connection.username}@${hostWithPort}`
      : hostWithPort;
  }
  if (connection.type === "local_terminal") {
    return connection.working_dir || connection.shell_path || undefined;
  }
  return undefined;
}

function buildFileWindowTarget({
  backend,
  connection,
  sessionName,
  remoteLabel,
}: {
  backend: FileExplorerBackendKind;
  connection?: SavedConnection | null;
  sessionName?: string | null;
  remoteLabel: string;
}): FileWindowTarget | undefined {
  const fallbackLabel = sessionName?.trim() || connection?.name?.trim() || "";
  if (backend === "local") {
    return undefined;
  }

  if (connection?.name?.trim()) {
    return {
      kind: "remote",
      label: connection.name,
      detail:
        formatConnectionTargetDetail(connection) || fallbackLabel || undefined,
    };
  }

  return {
    kind: "remote",
    label: fallbackLabel || remoteLabel,
  };
}

/** Dual-pane file browser wrapper. */
function FileExplorer(props: FileExplorerProps) {
  const { t } = useTranslation();
  const { enqueueCopies } = useTransfer();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const secondaryOverlayRef = useRef<HTMLDivElement | null>(null);
  const secondaryPositionFrameRef = useRef<number | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [targetSelectorOpen, setTargetSelectorOpen] = useState(false);
  const [primaryEndpoint, setPrimaryEndpoint] =
    useState<FileExplorerPaneEndpoint | null>(null);
  const [secondaryEndpoint, setSecondaryEndpoint] =
    useState<FileExplorerPaneEndpoint | null>(null);
  const [secondaryOverlayStyle, setSecondaryOverlayStyle] =
    useState<CSSProperties | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const next = await invoke<SessionInfo[]>("list_sessions");
        if (!disposed) setSessions(next);
      } catch {
        if (!disposed) setSessions([]);
      }
    };
    void load();
    const unlisten = listen("sessions-changed", () => {
      void load();
    });
    return () => {
      disposed = true;
      unlisten.then((dispose) => dispose());
    };
  }, []);

  const browsableSessions = useMemo(
    () => sessions.filter(isFileBrowsableSession),
    [sessions],
  );
  const targetCandidates = useMemo(
    () =>
      browsableSessions.filter(
        (session) => session.id !== props.activeSessionId,
      ),
    [browsableSessions, props.activeSessionId],
  );
  const selectedTarget =
    targetCandidates.find((session) => session.id === targetSessionId) ?? null;
  const currentSession =
    sessions.find((session) => session.id === props.activeSessionId) ?? null;
  const canShowDualButton =
    !!props.activeSessionId && browsableSessions.length > 1;
  const primarySendTargetOptions = useMemo(
    () =>
      targetCandidates.map((session) => ({
        sessionId: session.id,
        label: session.name,
        meta: session.session_type,
      })),
    [targetCandidates],
  );
  const secondarySendTargetOptions =
    currentSession && props.activeSessionId
      ? [
          {
            sessionId: props.activeSessionId,
            label: currentSession.name,
            meta: currentSession.session_type,
          },
        ]
      : [];

  const closeSecondaryPane = useCallback(() => {
    setTargetSessionId(null);
    setSecondaryEndpoint(null);
  }, []);

  useEffect(() => {
    if (!selectedTarget && targetSessionId) {
      setTargetSessionId(null);
      setSecondaryEndpoint(null);
    }
  }, [selectedTarget, targetSessionId]);

  const measureSecondaryOverlayPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !selectedTarget) {
      setSecondaryOverlayStyle(null);
      return;
    }

    const rect = container.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;
    const margin = 8;
    const preferredWidth = 420;
    const minWidth = 320;
    const availableRight = viewportWidth - rect.right - gap - margin;
    const width =
      availableRight >= minWidth
        ? Math.min(preferredWidth, availableRight)
        : Math.min(
            preferredWidth,
            Math.max(minWidth, viewportWidth - margin * 2),
          );
    const left =
      availableRight >= minWidth
        ? rect.right + gap
        : Math.max(
            margin,
            Math.min(rect.right - width, viewportWidth - width - margin),
          );

    setSecondaryOverlayStyle({
      position: "fixed",
      left,
      top: Math.max(margin, rect.top),
      width,
      height: Math.max(
        240,
        Math.min(
          rect.height,
          viewportHeight - Math.max(margin, rect.top) - margin,
        ),
      ),
      zIndex: 60,
    });
  }, [selectedTarget]);

  const updateSecondaryOverlayPosition = useCallback(() => {
    if (secondaryPositionFrameRef.current !== null) return;
    secondaryPositionFrameRef.current = window.requestAnimationFrame(() => {
      secondaryPositionFrameRef.current = null;
      measureSecondaryOverlayPosition();
    });
  }, [measureSecondaryOverlayPosition]);

  useLayoutEffect(() => {
    if (!selectedTarget) {
      setSecondaryOverlayStyle(null);
      return;
    }

    measureSecondaryOverlayPosition();
    window.addEventListener("resize", updateSecondaryOverlayPosition);
    window.addEventListener("scroll", updateSecondaryOverlayPosition, true);
    const observer =
      typeof ResizeObserver === "undefined" || !containerRef.current
        ? null
        : new ResizeObserver(updateSecondaryOverlayPosition);
    if (containerRef.current) {
      observer?.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateSecondaryOverlayPosition);
      window.removeEventListener(
        "scroll",
        updateSecondaryOverlayPosition,
        true,
      );
      observer?.disconnect();
      if (secondaryPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(secondaryPositionFrameRef.current);
        secondaryPositionFrameRef.current = null;
      }
    };
  }, [
    selectedTarget,
    measureSecondaryOverlayPosition,
    updateSecondaryOverlayPosition,
  ]);

  useEffect(() => {
    if (!selectedTarget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSecondaryPane();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (secondaryOverlayRef.current?.contains(target)) return;
      if (containerRef.current?.contains(target)) return;
      closeSecondaryPane();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedTarget, closeSecondaryPane]);

  const enqueuePaneCopies = useCallback(
    (
      source: FileExplorerPaneEndpoint,
      target: FileExplorerPaneEndpoint,
      entries: FileExplorerCopyEntry[],
    ) => {
      if (!target.currentPath || entries.length === 0) return;
      enqueueCopies(
        entries.map((entry) => ({
          fileName: entry.name,
          kind: entry.isDirectory ? "directory" : "file",
          source: {
            sessionId: source.sessionId,
            kind: source.kind,
            path: entry.path,
          },
          target: {
            sessionId: target.sessionId,
            kind: target.kind,
            path: target.currentPath,
          },
        })),
      );
      toast.success(t("fileExplorer.copyQueued", { count: entries.length }));
    },
    [enqueueCopies, t],
  );

  const enqueueEntriesToSessionCwd = useCallback(
    async (
      source: FileExplorerPaneEndpoint,
      entries: FileExplorerCopyEntry[],
      targetSessionId: string,
    ) => {
      if (entries.length === 0) return;

      const targetSession = browsableSessions.find(
        (session) => session.id === targetSessionId,
      );
      if (!targetSession) {
        toast.error(t("fileExplorer.targetCwdUnavailable"));
        return;
      }

      try {
        const targetKind = getSessionExplorerKind(targetSession);
        const liveEndpoint =
          targetSessionId === primaryEndpoint?.sessionId
            ? primaryEndpoint
            : targetSessionId === secondaryEndpoint?.sessionId
              ? secondaryEndpoint
              : null;
        const cachedPath =
          fileExplorerSessionCacheStore.get(targetSessionId)?.currentPath ?? "";
        const livePath =
          liveEndpoint?.kind === targetKind
            ? normalizeExplorerPath(liveEndpoint.currentPath, targetKind)
            : "";
        let targetPath =
          livePath || normalizeExplorerPath(cachedPath, targetKind);
        if (!targetPath) {
          const cwd = await invoke<string | null>("try_get_terminal_cwd", {
            sessionId: targetSessionId,
          });
          targetPath = normalizeExplorerPath(cwd ?? "", targetKind);
        }
        if (!targetPath) {
          toast.error(t("fileExplorer.targetCwdUnavailable"));
          return;
        }

        enqueuePaneCopies(
          source,
          {
            sessionId: targetSessionId,
            kind: targetKind,
            currentPath: targetPath,
          },
          entries,
        );
      } catch (error) {
        logger.error({
          domain: "transfer.lifecycle",
          event: "copy.target_cwd_failed",
          message: "Failed to enqueue copy to target session current directory",
          ids: { session_id: targetSessionId },
          error,
        });
        toast.error(getErrorMessage(error));
      }
    },
    [
      browsableSessions,
      enqueuePaneCopies,
      primaryEndpoint,
      secondaryEndpoint,
      t,
    ],
  );

  const primaryActions = canShowDualButton ? (
    <DropdownMenu
      open={targetSelectorOpen}
      onOpenChange={setTargetSelectorOpen}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn(
                "text-muted-foreground hover:text-foreground",
                selectedTarget && "bg-primary/10 text-primary",
              )}
              aria-label={t("fileExplorer.dualPane")}
            >
              <PiColumnsPlusRightBold className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("fileExplorer.dualPane")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-56">
        {targetCandidates.map((session) => (
          <DropdownMenuItem
            key={session.id}
            onClick={() => {
              setTargetSessionId(session.id);
              setTargetSelectorOpen(false);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{session.name}</span>
            <span className="ml-2 shrink-0 text-[0.625rem] text-muted-foreground">
              {session.session_type}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const secondaryActions = selectedTarget ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground hover:text-foreground"
      aria-label={t("common.close")}
      onClick={() => {
        closeSecondaryPane();
      }}
    >
      <MdClose className="size-4" />
    </Button>
  ) : null;

  const secondaryPane =
    selectedTarget && secondaryOverlayStyle
      ? createPortal(
          <div
            ref={secondaryOverlayRef}
            className="overflow-hidden rounded-md border shadow-xl"
            style={{
              ...secondaryOverlayStyle,
              borderColor: "var(--df-primary)",
              backgroundColor: "var(--df-bg-panel)",
              boxShadow:
                "0 0 0 1px color-mix(in srgb, var(--df-primary) 35%, transparent), 0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            <FileExplorerPane
              activeSessionId={selectedTarget.id}
              activeSessionType={toFileExplorerSessionType(selectedTarget)}
              activeConnectionId={null}
              activeSessionName={selectedTarget.name}
              headerMeta={`${selectedTarget.name} · ${
                selectedTarget.connected
                  ? t("fileExplorer.connected")
                  : t("fileExplorer.disconnected")
              }`}
              headerActions={secondaryActions}
              peerEndpoint={primaryEndpoint}
              onDirectoryStateChange={setSecondaryEndpoint}
              onSendEntries={(source, entries) => {
                if (primaryEndpoint) {
                  enqueuePaneCopies(source, primaryEndpoint, entries);
                }
              }}
              sendTargetOptions={secondarySendTargetOptions}
              onSendEntriesToTarget={(source, entries, sessionId) => {
                void enqueueEntriesToSessionCwd(source, entries, sessionId);
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative h-full min-h-0">
      <FileExplorerPane
        {...props}
        activeSessionName={
          props.activeSessionName ?? currentSession?.name ?? null
        }
        headerActions={primaryActions}
        peerEndpoint={secondaryEndpoint}
        onOpenPeerSelector={() => {
          if (!selectedTarget && targetCandidates.length > 0) {
            setTargetSelectorOpen(true);
          }
        }}
        onDirectoryStateChange={setPrimaryEndpoint}
        onSendEntries={(source, entries) => {
          if (secondaryEndpoint) {
            enqueuePaneCopies(source, secondaryEndpoint, entries);
          }
        }}
        sendTargetOptions={primarySendTargetOptions}
        onSendEntriesToTarget={(source, entries, sessionId) => {
          void enqueueEntriesToSessionCwd(source, entries, sessionId);
        }}
      />

      {secondaryPane}
    </div>
  );
}

interface FileExplorerPaneProps
  extends FileExplorerProps, FileExplorerPaneExtraProps {
  onSendEntries?: (
    source: FileExplorerPaneEndpoint,
    entries: FileExplorerCopyEntry[],
  ) => void;
}

/** Remote or local file browser pane. Lists dirs/files, supports navigation. */
function FileExplorerPane({
  activeSessionId,
  activeSessionType,
  activeConnectionId,
  activeSessionName,
  headerMeta,
  headerActions,
  peerEndpoint,
  onOpenPeerSelector,
  onDirectoryStateChange,
  onSendEntries,
  sendTargetOptions = [],
  onSendEntriesToTarget,
}: FileExplorerPaneProps) {
  const { t } = useTranslation();
  const {
    appSettings,
    updateUi,
    savedConnections,
    tabs,
    setActivePane,
    openFileDocument,
    syncGroups,
    broadcastToAll,
  } = useApp();
  const { enqueueDownloads, enqueueUploads } = useTransfer();
  const hasSshSession = !!activeSessionId && activeSessionType === "SSH";
  const hasLocalSession = !!activeSessionId && activeSessionType === "Local";
  const explorerBackend: FileExplorerBackendKind = hasLocalSession
    ? "local"
    : "remote";
  const [remoteFileBrowserEnabled, setRemoteFileBrowserEnabled] = useState<
    boolean | null
  >(null);
  const canBrowseFiles =
    hasLocalSession || (hasSshSession && remoteFileBrowserEnabled === true);
  const canUseRemoteTransfer =
    hasSshSession && remoteFileBrowserEnabled === true;
  const hasUnsupportedSession =
    !!activeSessionId &&
    !!activeSessionType &&
    activeSessionType !== "SSH" &&
    activeSessionType !== "Local";
  const hasRemoteFileBrowserDisabled =
    hasSshSession && remoteFileBrowserEnabled === false;
  const isResolvingRemoteFileBrowser =
    hasSshSession && remoteFileBrowserEnabled === null;

  const [childrenCache, setChildrenCache] = useState<TreeChildrenCache>(
    () => new Map(),
  );
  const [treeRootPath, setTreeRootPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingDirPaths, setLoadingDirPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [highlightPath, setHighlightPath] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [homeDir, setHomeDir] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [isFileSearchExpanded, setIsFileSearchExpanded] = useState(false);
  const [fileSortMode] = useState<FileSortMode>({
    column: "name",
    direction: "asc",
  });
  const lastSelectedRef = useRef<string | null>(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInputText, setPathInputText] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inlineRenameState, setInlineRenameState] =
    useState<InlineRenameState | null>(null);
  const [deleteDialogData, setDeleteDialogData] =
    useState<DeleteDialogData | null>(null);
  const [moveDialogData, setMoveDialogData] = useState<MoveDialogData | null>(
    null,
  );
  const [newItemDialogData, setNewItemDialogData] =
    useState<NewItemDialogData | null>(null);
  const [newSymlinkDialogData, setNewSymlinkDialogData] =
    useState<NewSymlinkDialogData | null>(null);
  const [propertiesDialogData, setPropertiesDialogData] =
    useState<PropertiesDialogData | null>(null);
  const [cwdTrackingActive, setCwdTrackingActive] = useState(false);
  const [visitedHistory, setVisitedHistory] = useState<string[]>([]);
  const alwaysUploadFilesRef = useRef<Set<string>>(new Set());
  const childrenCacheRef = useRef<TreeChildrenCache>(new Map());
  const activeSessionIdRef = useRef<string | null>(null);
  const canBrowseFilesRef = useRef(canBrowseFiles);
  const canUseRemoteTransferRef = useRef(canUseRemoteTransfer);
  const explorerBackendRef = useRef<FileExplorerBackendKind>(explorerBackend);
  const currentPathRef = useRef("");
  const currentPathRawTokenRef = useRef<string | undefined>(undefined);
  const homeDirRef = useRef("");
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const fileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const preserveFileSearchCaretRef = useRef(false);
  const pathInputRef = useRef<HTMLInputElement | null>(null);
  const pendingRevealPathRef = useRef<string | null>(null);
  const revealTokenRef = useRef(0);
  const treeRootPathRef = useRef("");
  const expandedPathsRef = useRef<Set<string>>(new Set());
  const inlineRenameScopeRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const visitedHistoryRef = useRef<string[]>([]);
  const dragSelectionRef = useRef<{
    anchor: string;
    baseSelection: Set<string>;
    additive: boolean;
  } | null>(null);

  const sessionCacheRef = useRef(fileExplorerSessionCacheStore);
  const prevSessionIdRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{
    sessionId: string;
    scrollTop: number;
  } | null>(null);
  const autoSyncCwdMountSyncKeyRef = useRef<string | null>(null);
  const [isExternalDropActive, setIsExternalDropActive] = useState(false);
  const [externalDropDirPath, setExternalDropDirPath] = useState<string | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const refreshUploadCompletionTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  childrenCacheRef.current = childrenCache;
  activeSessionIdRef.current = activeSessionId;
  canBrowseFilesRef.current = canBrowseFiles;
  canUseRemoteTransferRef.current = canUseRemoteTransfer;
  explorerBackendRef.current = explorerBackend;
  currentPathRef.current = currentPath;
  homeDirRef.current = homeDir;
  treeRootPathRef.current = treeRootPath;
  expandedPathsRef.current = expandedPaths;
  visitedHistoryRef.current = visitedHistory;

  const resetExternalDropHover = useCallback(() => {
    setIsExternalDropActive(false);
    setExternalDropDirPath(null);
  }, []);

  // External drag: resolve which directory row (if any) sits under the drop
  // position so files can be dropped directly into a visible folder.
  const resolveDropTargetDir = useCallback((position: { x: number; y: number }) => {
    const hit = document.elementFromPoint(position.x, position.y);
    const row = hit?.closest?.("[data-niceterm-drop-dir]");
    if (!(row instanceof HTMLElement)) return null;
    const path = row.dataset.nicetermDropDir;
    return path ? path : null;
  }, []);

  const updateExternalDropDirHover = useCallback(
    (position: { x: number; y: number } | null) => {
      setExternalDropDirPath((prev) => {
        if (!position) return null;
        const next = resolveDropTargetDir(position);
        return next === prev ? prev : next;
      });
    },
    [resolveDropTargetDir],
  );

  const beginPathEditing = useCallback(() => {
    setPathInputText(currentPathRef.current || homeDirRef.current);
    setIsEditingPath(true);
    window.requestAnimationFrame(() => pathInputRef.current?.select());
  }, []);

  const invalidateDirectoryChildrenCache = useCallback((path: string) => {
    const backend = explorerBackendRef.current;
    const sessionId = activeSessionIdRef.current;
    clearDirectoryChildrenCacheForPath(sessionId, backend, path);
    clearTreeChildrenForPath(sessionId, backend, path);
    setChildrenCache((prev) => {
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return prev;
      let changed = false;
      const next = new Map<string, FileEntry[]>();
      for (const [key, value] of prev) {
        if (pathStartsWithDirectory(key, normalizedPath, backend)) {
          changed = true;
          continue;
        }
        next.set(key, value);
      }
      return changed ? next : prev;
    });
  }, []);

  const buildTreeSessionSnapshot = useCallback(() => {
    const backend = explorerBackendRef.current;
    const currentFiles =
      currentPathRef.current && childrenCacheRef.current.size > 0
        ? (childrenCacheRef.current.get(currentPathRef.current) ?? [])
        : [];
    const snapshot = buildSessionCacheSnapshot(
      currentFiles,
      currentPathRef.current,
      homeDirRef.current,
      historyRef.current,
      historyIndexRef.current,
      visitedHistoryRef.current,
      backend,
    );
    if (!snapshot) return null;
    return {
      ...snapshot,
      childrenCache: new Map(childrenCacheRef.current),
      treeRootPath: treeRootPathRef.current,
      expandedPaths: [...expandedPathsRef.current],
      scrollTop: listContainerRef.current?.scrollTop ?? 0,
    };
  }, []);
  const autoSyncScopeId =
    activeConnectionId ?? (hasLocalSession ? "local" : null);
  const autoSyncCwdOverrides =
    appSettings.ui.file_explorer_auto_sync_cwd_by_connection_id ?? {};
  const autoSyncCwdDefault =
    appSettings.ui.file_explorer_auto_sync_cwd_default ?? true;
  const autoSyncCwd = !!autoSyncScopeId
    ? (autoSyncCwdOverrides[autoSyncScopeId] ?? autoSyncCwdDefault)
    : false;
  const favoriteDirectoriesByConnection =
    appSettings.ui.file_explorer_favorite_dirs_by_connection_id ?? {};
  const favoriteScopeId =
    activeConnectionId ?? (hasLocalSession ? "local" : null);
  const favoriteDirectories = favoriteScopeId
    ? (favoriteDirectoriesByConnection[favoriteScopeId] ?? [])
    : [];
  const showHiddenFiles =
    appSettings.ui.file_explorer_show_hidden_files ?? true;
  // Tree mode: only reset the list scroll when the tree root changes.
  // Switching sessions restores the scroll position saved for that session
  // instead of resetting it; reveal handles its own targeted scrolling.
  const listScrollResetKey = treeRootPath;
  const listFilterResetKey = `${fileSearchQuery}:${fileSortMode.column}:${fileSortMode.direction}`;
  const activeConnection = useMemo(
    () =>
      activeConnectionId
        ? (savedConnections.find(
            (connection) => connection.id === activeConnectionId,
          ) ?? null)
        : null,
    [activeConnectionId, savedConnections],
  );
  const fileWindowTarget = useMemo(
    () =>
      buildFileWindowTarget({
        backend: explorerBackend,
        connection: activeConnection,
        sessionName: activeSessionName,
        remoteLabel: t("fileEditor.remoteTarget"),
      }),
    [activeConnection, activeSessionName, explorerBackend, t],
  );

  useEffect(() => {
    if (!onDirectoryStateChange) return;
    if (!activeSessionId || !canBrowseFiles || !currentPath) {
      onDirectoryStateChange(null);
      return;
    }
    onDirectoryStateChange({
      sessionId: activeSessionId,
      kind: explorerBackend,
      currentPath,
    });
  }, [
    activeSessionId,
    canBrowseFiles,
    currentPath,
    explorerBackend,
    onDirectoryStateChange,
  ]);

  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) {
      setListScrollTop(0);
      setListViewportHeight(0);
      return;
    }

    let scrollFrame = 0;
    const updateMetrics = () => {
      setListScrollTop(container.scrollTop);
      setListViewportHeight(container.clientHeight);
    };
    const handleScroll = () => {
      if (scrollFrame !== 0) {
        return;
      }

      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const nextTop = container.scrollTop;
        // Only re-render when the visible row window shifts to another row;
        // scrolling inside a single row height mounts no new rows.
        setListScrollTop((prev) =>
          Math.floor(prev / FILE_LIST_ITEM_HEIGHT) ===
          Math.floor(nextTop / FILE_LIST_ITEM_HEIGHT)
            ? prev
            : nextTop,
        );
      });
    };

    updateMetrics();
    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateMetrics();
          });
    resizeObserver?.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      if (scrollFrame !== 0) {
        window.cancelAnimationFrame(scrollFrame);
      }
    };
  }, []);

  useEffect(() => {
    if (!listScrollResetKey && !listContainerRef.current) {
      setListScrollTop(0);
      return;
    }

    const container = listContainerRef.current;
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
    setListScrollTop(0);
  }, [listScrollResetKey]);

  useEffect(() => {
    if (!listFilterResetKey && !listContainerRef.current) {
      setListScrollTop(0);
      return;
    }

    const container = listContainerRef.current;
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
    setListScrollTop(0);
  }, [listFilterResetKey]);

  useEffect(() => {
    if (!isFileSearchExpanded) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const input = fileSearchInputRef.current;
      if (!input) return;
      input.focus();
      if (preserveFileSearchCaretRef.current) {
        preserveFileSearchCaretRef.current = false;
        input.setSelectionRange(input.value.length, input.value.length);
      } else {
        input.select();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isFileSearchExpanded]);

  const resolveUploadTarget = useCallback(() => {
    if (!activeSessionId || !canUseRemoteTransfer) return null;

    return {
      sessionId: activeSessionId,
      remoteDir:
        normalizeDirectoryPath(currentPathRef.current) ||
        homeDirRef.current ||
        "/",
    };
  }, [activeSessionId, canUseRemoteTransfer]);

  useEffect(() => {
    return () => {
      if (!activeSessionId) return;
      const snapshot = buildTreeSessionSnapshot();
      if (snapshot) {
        sessionCacheRef.current.set(activeSessionId, snapshot);
      }
    };
  }, [activeSessionId, buildTreeSessionSnapshot]);

  useEffect(() => {
    const handleMouseUp = () => {
      dragSelectionRef.current = null;
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Keep the in-memory per-session cache bounded to live sessions so closed
  // sessions release their cached directory listing and history. The active
  // session is never pruned even if a transiently empty backend listing
  // misses it, so switching terminals never loses the browsed directory.
  useEffect(() => {
    const pruneClosedSessions = async () => {
      const cache = sessionCacheRef.current;
      if (cache.size === 0) return;
      try {
        const sessions = await invoke<SessionInfo[]>("list_sessions");
        const liveIds = new Set(sessions.map((session) => session.id));
        liveIds.add(activeSessionIdRef.current ?? "");
        for (const sessionId of [...cache.keys()]) {
          if (!liveIds.has(sessionId)) {
            cache.delete(sessionId);
            clearDirectoryChildrenCacheForSession(sessionId);
            clearTreeChildrenForSession(sessionId);
          }
        }
      } catch {
        // Backend might be unavailable; keep the cache untouched until next event.
      }
    };

    void pruneClosedSessions();
    const unlisten = listen("sessions-changed", () => {
      void pruneClosedSessions();
    });
    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, []);

  // Resolve whether backend terminal-path tracking is available for this session.
  useEffect(() => {
    if ((!hasSshSession && !hasLocalSession) || !activeSessionId) {
      setCwdTrackingActive(false);
      setRemoteFileBrowserEnabled(null);
      return;
    }
    setRemoteFileBrowserEnabled(hasLocalSession ? true : null);
    invoke<SessionInfo[]>("list_sessions")
      .then((sessions) => {
        const s = sessions.find((s) => s.id === activeSessionId);
        const active = s?.injection_active ?? false;
        setCwdTrackingActive(active);
        setRemoteFileBrowserEnabled(
          hasLocalSession ? true : (s?.remote_file_browser_enabled ?? true),
        );
      })
      .catch(() => {
        setCwdTrackingActive(false);
        setRemoteFileBrowserEnabled(true);
      });
  }, [activeSessionId, hasLocalSession, hasSshSession]);

  useEffect(() => {
    const unlisten = listen<{
      session_id: string;
      local_path: string;
      remote_path: string;
    }>("file-modified", (e) => {
        const { session_id, local_path, remote_path } = e.payload;
        const watchKey = `${session_id}:${local_path}`;

        if (alwaysUploadFilesRef.current.has(watchKey)) {
          // File was marked "Always list", just upload silently
          invoke("upload_local_file", {
            sessionId: session_id,
            localPath: local_path,
            remotePath: remote_path,
          }).catch((err) =>
            logger.error({
              domain: "watcher.sync",
              event: "auto_upload.failed",
              message: "Auto upload failed",
              ids: { session_id },
              error: err,
            }),
          );
        } else {
          // Trigger the window
          openAutoUpload({
            sessionId: session_id,
            localPath: local_path,
            remotePath: remote_path,
          });
        }
    });

    const unlistenDecision = listen<{
      sessionId: string;
      localPath: string;
      always: boolean;
    }>("auto-upload-decision", (e) => {
        const { sessionId, localPath, always } = e.payload;
        if (always) {
          alwaysUploadFilesRef.current.add(`${sessionId}:${localPath}`);
        }
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenDecision.then((fn) => fn());
    };
  }, []);

  const pushDirectoryHistory = useCallback((path: string) => {
    const normalizedPath = normalizeExplorerPath(
      path,
      explorerBackendRef.current,
    );
    const currentIndex = historyIndexRef.current;
    const currentEntry =
      currentIndex >= 0 ? historyRef.current[currentIndex] : null;
    if (currentEntry === normalizedPath) {
      return;
    }

    const nextHistory = historyRef.current.slice(0, currentIndex + 1);
    nextHistory.push(normalizedPath);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
  }, []);

  const loadTreeChildren = useCallback(
    async (
      path: string,
      options?: LoadDirectoryOptions & { expand?: boolean },
    ) => {
      if (!canBrowseFiles || !activeSessionId) return false;
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return false;
      const historyMode = options?.history ?? "push";
      const expand = options?.expand !== false;
      if (expand) {
        setLoadingDirPaths((prev) => {
          const next = new Set(prev);
          next.add(normalizedPath);
          return next;
        });
      }
      setError(null);

      try {
        // Resolve the directory's raw path token from its parent listing so
        // symlinked directories list through their link target.
        const parentPath = getExplorerParentDirectory(normalizedPath, backend);
        const parentEntries =
          childrenCacheRef.current.get(parentPath) ??
          getTreeChildren(activeSessionId, backend, parentPath);
        const dirName = getLocalPathName(normalizedPath, normalizedPath);
        const parentToken = parentEntries?.find(
          (entry) => entry.name === dirName,
        )?.raw_path_token;
        const rawPathToken =
          options?.rawPathToken ??
          (normalizeExplorerPath(currentPathRef.current, backend) ===
          normalizedPath
            ? currentPathRawTokenRef.current
            : parentToken);

        const rawEntries =
          backend === "local"
            ? await invoke<FileEntry[]>("list_local_dir", {
                sessionId: activeSessionId,
                path: normalizedPath,
              })
            : await invoke<FileEntry[]>("list_remote_dir", {
                sessionId: activeSessionId,
                path: normalizedPath,
                rawPathToken,
              });
        // Attach the full tree path once at cache time so flattened nodes
        // keep a stable entry identity across renders (memoized rows).
        const entries = rawEntries.map((entry) =>
          withTreePath(
            entry,
            joinExplorerPath(normalizedPath, entry.name, backend),
          ),
        );

        setTreeChildren(activeSessionId, backend, normalizedPath, entries);
        setChildrenCache((prev) => {
          const next = new Map(prev);
          next.set(normalizedPath, entries);
          return next;
        });

        if (historyMode === "push") {
          pushDirectoryHistory(normalizedPath);
          const nextVisitedHistory = pushVisitedHistory(
            visitedHistoryRef.current,
            normalizedPath,
            backend,
          );
          visitedHistoryRef.current = nextVisitedHistory;
          startTransition(() => {
            setVisitedHistory(nextVisitedHistory);
          });
        }

        if (expand) {
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            next.add(normalizedPath);
            return next;
          });
        }
        return true;
      } catch (e) {
        if (options?.silent) {
          return false;
        }
        const msg = `${String(e)} [path: ${normalizedPath}]`;
        if (childrenCacheRef.current.size > 0) {
          toast.error(msg);
        } else {
          setError(msg);
        }
        return false;
      } finally {
        if (expand) {
          setLoadingDirPaths((prev) => {
            const next = new Set(prev);
            next.delete(normalizedPath);
            return next;
          });
        }
      }
    },
    [activeSessionId, canBrowseFiles, pushDirectoryHistory],
  );

  const revealPathInTree = useCallback(
    async (
      rawPath: string,
      options?: LoadDirectoryOptions & {
        collapseOthers?: boolean;
        highlight?: boolean;
      },
    ) => {
      if (!canBrowseFiles || !activeSessionId) return false;
      const backend = explorerBackendRef.current;
      const targetPath = normalizeExplorerPath(rawPath, backend);
      if (!targetPath) return false;
      const token = ++revealTokenRef.current;
      const historyMode = options?.history ?? "push";

      let rootPath =
        normalizeExplorerPath(treeRootPathRef.current, backend) || targetPath;
      let chain = getAncestorPaths(rootPath, targetPath, backend);
      if (!chain) {
        // Target outside the current root: re-root the tree at the target.
        rootPath = targetPath;
        chain = [targetPath];
        setTreeRootPath(targetPath);
        treeRootPathRef.current = targetPath;
      }

      for (const dir of chain) {
        if (
          !childrenCacheRef.current.has(dir) &&
          !getTreeChildren(activeSessionId, backend, dir)
        ) {
          const loaded = await loadTreeChildren(dir, {
            history: "preserve",
            expand: false,
            silent: true,
          });
          if (!loaded) return false;
        }
        if (token !== revealTokenRef.current) return false;
      }

      const chainDirs = chain;
      setExpandedPaths((prev) => {
        if (options?.collapseOthers) {
          return collapseToAncestors(chainDirs);
        }
        const next = new Set(prev);
        for (const dir of chainDirs) next.add(dir);
        return next;
      });

      if (historyMode === "push") {
        pushDirectoryHistory(targetPath);
        const nextVisitedHistory = pushVisitedHistory(
          visitedHistoryRef.current,
          targetPath,
          backend,
        );
        visitedHistoryRef.current = nextVisitedHistory;
        setVisitedHistory(nextVisitedHistory);
      }
      setCurrentPath(targetPath);
      setHighlightPath(options?.highlight === false ? null : targetPath);
      pendingRevealPathRef.current = targetPath;
      return true;
    },
    [activeSessionId, canBrowseFiles, loadTreeChildren, pushDirectoryHistory],
  );

  const toggleNodeExpand = useCallback(
    (entry: FileEntry) => {
      const nodePath = getEntryTreePath(entry);
      if (!nodePath) return;
      setHighlightPath(null);
      if (expandedPathsRef.current.has(nodePath)) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(nodePath);
          return next;
        });
        return;
      }
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.add(nodePath);
        return next;
      });
      if (
        !childrenCacheRef.current.has(nodePath) &&
        !getTreeChildren(
          activeSessionIdRef.current,
          explorerBackendRef.current,
          nodePath,
        )
      ) {
        void loadTreeChildren(nodePath, { history: "preserve" });
      }
    },
    [loadTreeChildren],
  );

  const reloadTreeDirectory = useCallback(
    (path: string) => {
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return Promise.resolve(false);
      invalidateDirectoryChildrenCache(normalizedPath);
      return loadTreeChildren(normalizedPath, {
        history: "preserve",
        expand: false,
        silent: true,
      });
    },
    [invalidateDirectoryChildrenCache, loadTreeChildren],
  );

  const refreshVisibleTree = useCallback(() => {
    const backend = explorerBackendRef.current;
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return Promise.resolve(false);
    const dirsToRefresh = new Set<string>();
    const rootPath = normalizeExplorerPath(treeRootPathRef.current, backend);
    if (rootPath) dirsToRefresh.add(rootPath);
    for (const dir of expandedPathsRef.current) dirsToRefresh.add(dir);
    const current = normalizeExplorerPath(currentPathRef.current, backend);
    if (current) dirsToRefresh.add(current);
    for (const dir of dirsToRefresh) {
      invalidateDirectoryChildrenCache(dir);
    }
    return (async () => {
      let lastLoaded = false;
      for (const dir of dirsToRefresh) {
        const loaded = await loadTreeChildren(dir, {
          history: "preserve",
          expand: false,
          silent: true,
        });
        lastLoaded = loaded || lastLoaded;
      }
      return lastLoaded;
    })();
  }, [invalidateDirectoryChildrenCache, loadTreeChildren]);

  const uploadLocalEntriesToTarget = useCallback(
    (
      target: { sessionId: string; remoteDir: string },
      entries: Array<{ path: string; isDir: boolean }>,
    ) => {
      if (entries.length === 0) return;

      enqueueUploads(
        entries
          .filter((entry) => !!entry.path)
          .map((entry) => {
            const fileName = getLocalPathName(
              entry.path,
              entry.isDir ? "uploaded_folder" : "uploaded_file",
            );
            return {
              sessionId: target.sessionId,
              fileName,
              localPath: entry.path,
              remotePath: buildRemoteUploadPath(target.remoteDir, fileName),
              kind: entry.isDir ? ("directory" as const) : ("file" as const),
            };
          }),
      );
    },
    [enqueueUploads],
  );

  const resolveLocalDropPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(
      new Set(paths.map((path) => path.trim()).filter((path) => !!path)),
    );
    if (uniquePaths.length === 0) {
      return [];
    }

    return invoke<ResolvedLocalDropPathEntry[]>("resolve_local_drop_paths", {
      paths: uniquePaths,
    });
  }, []);

  const processExternalDropPaths = useCallback(
    async (
      target: { sessionId: string; remoteDir: string },
      dropPaths: string[],
    ) => {
      try {
        const resolvedLocalEntries = await resolveLocalDropPaths(dropPaths);
        if (resolvedLocalEntries.length === 0) {
          logger.warn({
            domain: "ui.error",
            event: "file_explorer.external_drop_paths_unresolved",
            message:
              "Native external drop did not resolve to usable local paths",
            ids: { session_id: target.sessionId },
            data: {
              remote_dir: target.remoteDir,
              path_count: dropPaths.length,
            },
          });
          toast.error(t("fileExplorer.externalDropPathsRequired"));
          return;
        }

        await uploadLocalEntriesToTarget(
          target,
          resolvedLocalEntries.map((entry) => ({
            path: entry.path,
            isDir: entry.isDir,
          })),
        );
      } catch (error) {
        logger.error({
          domain: "ui.error",
          event: "file_explorer.external_drop_failed",
          message: "Failed to process native external drop paths",
          ids: { session_id: target.sessionId },
          data: {
            remote_dir: target.remoteDir,
            path_count: dropPaths.length,
          },
          error,
        });
        toast.error(String(error));
      }
    },
    [resolveLocalDropPaths, t, uploadLocalEntriesToTarget],
  );

  useEffect(() => {
    resetExternalDropHover();
    const cache = sessionCacheRef.current;
    const prevId = prevSessionIdRef.current;

    if (prevId && prevId !== activeSessionId) {
      const snapshot = buildTreeSessionSnapshot();
      if (snapshot) {
        cache.set(prevId, snapshot);
      }
    }
    prevSessionIdRef.current = activeSessionId;

    if (!canBrowseFiles || !activeSessionId) {
      pendingScrollRestoreRef.current = null;
      setChildrenCache(new Map());
      setTreeRootPath("");
      setExpandedPaths(new Set());
      setLoadingDirPaths(new Set());
      setHighlightPath(null);
      setCurrentPath("");
      setHomeDir("");
      setError(null);
      setDirectoryLoading(false);
      setSelectedFiles(new Set());
      historyRef.current = [];
      historyIndexRef.current = -1;
      visitedHistoryRef.current = [];
      setVisitedHistory([]);
      lastSelectedRef.current = null;
      return;
    }

    const cached = cache.get(activeSessionId);
    if (cached?.currentPath) {
      const backend = explorerBackendRef.current;
      const currentChildrenCache = childrenCacheRef.current;
      const restoredChildrenCache = reconcileRestoredChildrenCache(
        cached.childrenCache,
        currentChildrenCache,
      );
      if (restoredChildrenCache !== currentChildrenCache) {
        for (const [dir, entries] of restoredChildrenCache) {
          if (getTreeChildren(activeSessionId, backend, dir) !== entries) {
            setTreeChildren(activeSessionId, backend, dir, entries);
          }
        }
        childrenCacheRef.current = restoredChildrenCache;
        setChildrenCache(restoredChildrenCache);
      }
      const restoredRoot =
        cached.treeRootPath || cached.homeDir || cached.currentPath;
      setTreeRootPath(restoredRoot);
      treeRootPathRef.current = restoredRoot;
      const restoredExpandedPaths = new Set(cached.expandedPaths ?? []);
      const currentExpandedPaths = expandedPathsRef.current;
      let expandedPathsUnchanged =
        currentExpandedPaths.size === restoredExpandedPaths.size;
      if (expandedPathsUnchanged) {
        for (const path of restoredExpandedPaths) {
          if (!currentExpandedPaths.has(path)) {
            expandedPathsUnchanged = false;
            break;
          }
        }
      }
      if (!expandedPathsUnchanged) {
        setExpandedPaths(restoredExpandedPaths);
      }
      setCurrentPath(cached.currentPath);
      setHomeDir(cached.homeDir);
      setSelectedFiles((prev) => (prev.size === 0 ? prev : new Set()));
      setError(null);
      historyRef.current = [...cached.history];
      historyIndexRef.current = cached.historyIndex;
      const restoredVisitedHistory = [...cached.visitedHistory];
      const visitedHistoryUnchanged =
        visitedHistoryRef.current.length === restoredVisitedHistory.length &&
        visitedHistoryRef.current.every(
          (path, index) => path === restoredVisitedHistory[index],
        );
      visitedHistoryRef.current = restoredVisitedHistory;
      if (!visitedHistoryUnchanged) {
        setVisitedHistory(restoredVisitedHistory);
      }
      lastSelectedRef.current = null;
      if (prevId !== activeSessionId) {
        pendingScrollRestoreRef.current = {
          sessionId: activeSessionId,
          scrollTop: cached.scrollTop ?? 0,
        };
      }
      if (!restoredChildrenCache.has(restoredRoot)) {
        void loadTreeChildren(restoredRoot);
      }
      return;
    }

    pendingScrollRestoreRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
    visitedHistoryRef.current = [];
    setVisitedHistory([]);
    lastSelectedRef.current = null;
    setSelectedFiles(new Set());
    setChildrenCache(new Map());
    childrenCacheRef.current = new Map();
    setExpandedPaths(new Set());

    let cancelled = false;
    (async () => {
      const adoptTreeRoot = async (rootPath: string) => {
        setTreeRootPath(rootPath);
        treeRootPathRef.current = rootPath;
        setCurrentPath(rootPath);
        setDirectoryLoading(true);
        const loaded = await loadTreeChildren(rootPath);
        if (!cancelled) {
          setDirectoryLoading(false);
        }
        return loaded;
      };

      const loadRootDirectory = async () => {
        if (cancelled) return;
        homeDirRef.current = "";
        setHomeDir("");
        await adoptTreeRoot("/");
      };

      const backend = explorerBackendRef.current;
      // Root the tree at the filesystem top so every level is reachable;
      // the home directory is kept for the path bar and favorites.
      const adoptHomeAsTreeRoot = async (home: string) => {
        homeDirRef.current = home;
        setHomeDir(home);
        return adoptTreeRoot(getFilesystemTop(home, backend));
      };

      const cachedHome = normalizeExplorerPath(cached?.homeDir ?? "", backend);
      if (cachedHome) {
        const loaded = await adoptHomeAsTreeRoot(cachedHome);
        if (cancelled || loaded) return;
      }

      try {
        const home = normalizeExplorerPath(
          await invoke<string>(
            backend === "local" ? "get_local_home_dir" : "get_home_dir",
            {
            sessionId: activeSessionId,
          },
          ),
          backend,
        );
        if (cancelled) return;
        if (home) {
          const loaded = await adoptHomeAsTreeRoot(home);
          if (cancelled || loaded) {
            return;
          }
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      await loadRootDirectory();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeSessionId,
    buildTreeSessionSnapshot,
    canBrowseFiles,
    loadTreeChildren,
    resetExternalDropHover,
  ]);

  // Apply the scroll position saved for the restored session once its
  // listing is actually on screen. Session switches go through a resolving
  // window (browser availability) and fresh loads go through a loading
  // state; the scroll must only be applied when real rows are rendered.
  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || pending.sessionId !== activeSessionId) return;
    if (
      directoryLoading ||
      isResolvingRemoteFileBrowser ||
      hasRemoteFileBrowserDisabled
    ) {
      return;
    }
    const container = listContainerRef.current;
    if (!container) return;
    pendingScrollRestoreRef.current = null;
    container.scrollTop = pending.scrollTop;
    setListScrollTop(container.scrollTop);
  });

  useEffect(() => {
    if (!activeSessionId) {
      autoSyncCwdMountSyncKeyRef.current = null;
      return;
    }

    if (!autoSyncCwd) {
      autoSyncCwdMountSyncKeyRef.current = null;
      return;
    }

    if (!canBrowseFiles || !currentPath) {
      return;
    }

    const syncKey = `${activeSessionId}:${autoSyncScopeId ?? ""}:${explorerBackend}`;
    if (autoSyncCwdMountSyncKeyRef.current === syncKey) {
      return;
    }

    // A session restored from its snapshot keeps the directory the user was
    // browsing; mount-time cwd sync would jump the tree back to the
    // terminal's home. Live cwd-changed events still sync afterwards.
    if (sessionCacheRef.current.get(activeSessionId)) {
      autoSyncCwdMountSyncKeyRef.current = syncKey;
      return;
    }

    let cancelled = false;
    autoSyncCwdMountSyncKeyRef.current = syncKey;
    void syncExplorerDirectoryToTerminalCwd({
      enabled: autoSyncCwd,
      canBrowseFiles,
      sessionId: activeSessionId,
      backend: explorerBackend,
      currentPath,
      readTerminalCwd: (sessionId) =>
        invoke<string | null>("try_get_terminal_cwd", { sessionId }),
      loadDirectory: (path, options) =>
        cancelled ? Promise.resolve(false) : revealPathInTree(path, options),
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeSessionId,
    autoSyncCwd,
    autoSyncScopeId,
    canBrowseFiles,
    currentPath,
    explorerBackend,
    revealPathInTree,
  ]);

  useEffect(() => {
    if (isEditingPath) {
      pathInputRef.current?.focus();
    }
  }, [isEditingPath]);

  useExternalFileDrop({
    activeSessionIdRef,
    canBrowseFilesRef: canUseRemoteTransferRef,
    currentPathRef,
    homeDirRef,
    listContainerRef,
    resolveDropTargetDir,
    onExternalDropHoverChange: updateExternalDropDirHover,
    resetExternalDropHover,
    setIsExternalDropActive,
    processExternalDropPaths,
    externalDropPathsRequiredMessage: t(
      "fileExplorer.externalDropPathsRequired",
    ),
  });

  useEffect(() => {
    const unlisten = listen<{
      session_id: string;
      remote_path: string;
      direction: string;
      status: string;
      parent_id?: string;
    }>("transfer-event", (event) => {
      const payload = event.payload;
      if (
        payload.direction !== "upload" ||
        payload.status !== "completed" ||
        payload.parent_id ||
        payload.session_id !== activeSessionIdRef.current
      ) {
        return;
      }

      const visibleDir = normalizeExplorerPath(
        currentPathRef.current,
        "remote",
      );
      if (
        !visibleDir ||
        getExplorerParentDirectory(payload.remote_path, "remote") !== visibleDir
      ) {
        return;
      }

      if (refreshUploadCompletionTimerRef.current) {
        clearTimeout(refreshUploadCompletionTimerRef.current);
      }
      refreshUploadCompletionTimerRef.current = setTimeout(() => {
        refreshUploadCompletionTimerRef.current = null;
        void reloadTreeDirectory(visibleDir);
      }, 250);
    });

    return () => {
      unlisten.then((fn) => fn());
      if (refreshUploadCompletionTimerRef.current) {
        clearTimeout(refreshUploadCompletionTimerRef.current);
        refreshUploadCompletionTimerRef.current = null;
      }
    };
  }, [reloadTreeDirectory]);

  // After any command runs in the active terminal, re-check the terminal cwd
  // and refresh the active directory listing so the tree stays in sync even
  // without OSC 7 shell integration.
  const commandTreeCheckTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    const stopListening = listenTerminalCommandSubmitted((sessionId) => {
      if (sessionId !== activeSessionIdRef.current) return;
      if (!canBrowseFilesRef.current) return;
      if (commandTreeCheckTimerRef.current) {
        clearTimeout(commandTreeCheckTimerRef.current);
      }
      commandTreeCheckTimerRef.current = setTimeout(() => {
        commandTreeCheckTimerRef.current = null;
        const checkSessionId = activeSessionIdRef.current;
        if (!checkSessionId) return;
        void (async () => {
          if (autoSyncCwd) {
            try {
              const cwd = await invoke<string | null>(
                "try_get_terminal_cwd",
                { sessionId: checkSessionId },
              );
              const backend = explorerBackendRef.current;
              const normalizedCwd = normalizeExplorerPath(cwd ?? "", backend);
              if (
                normalizedCwd &&
                normalizedCwd !==
                  normalizeExplorerPath(currentPathRef.current, backend)
              ) {
                await revealPathInTree(normalizedCwd, { highlight: false });
                return;
              }
            } catch {
              // cwd unavailable; fall through to listing refresh
            }
          }
          void reloadTreeDirectory(currentPathRef.current);
        })();
      }, 900);
    });

    return () => {
      stopListening();
      if (commandTreeCheckTimerRef.current) {
        clearTimeout(commandTreeCheckTimerRef.current);
        commandTreeCheckTimerRef.current = null;
      }
    };
  }, [autoSyncCwd, reloadTreeDirectory, revealPathInTree]);

  const files = useMemo(
    () =>
      currentPath && childrenCache.size > 0
        ? (childrenCache.get(currentPath) ?? [])
        : [],
    [childrenCache, currentPath],
  );

  const treeNodes = useMemo(
    () =>
      flattenFileTree({
        rootPath: treeRootPath || currentPath || homeDir,
        childrenCache,
        expandedPaths,
        sortMode: fileSortMode,
        showHidden: showHiddenFiles,
        backend: explorerBackend,
        searchQuery: fileSearchQuery,
      }),
    [
      childrenCache,
      currentPath,
      explorerBackend,
      expandedPaths,
      fileSearchQuery,
      fileSortMode,
      homeDir,
      showHiddenFiles,
      treeRootPath,
    ],
  );
  const selectableNodePaths = useMemo(
    () => treeNodes.map((node) => node.path),
    [treeNodes],
  );

  useEffect(() => {
    setSelectedFiles((prev) => {
      if (prev.size === 0) return prev;
      const visiblePaths = new Set(treeNodes.map((node) => node.path));
      const next = new Set([...prev].filter((path) => visiblePaths.has(path)));
      return next.size === prev.size ? prev : next;
    });
  }, [treeNodes]);

  useEffect(() => {
    const nextScope = `${activeSessionId ?? ""}:${currentPath}`;
    if (inlineRenameScopeRef.current === nextScope) {
      return;
    }
    inlineRenameScopeRef.current = nextScope;
    setInlineRenameState(null);
  }, [activeSessionId, currentPath]);

  useEffect(() => {
    setInlineRenameState((prev) => {
      if (
        !prev ||
        treeNodes.some((node) => node.name === prev.entryName)
      ) {
        return prev;
      }
      return null;
    });
  }, [treeNodes]);

  const isFileSearchActive = fileSearchQuery.trim().length > 0;

  const getRangeSelection = useCallback(
    (
      anchorPath: string,
      targetPath: string,
      baseSelection = new Set<string>(),
      additive = false,
    ) => {
      const anchorIndex = selectableNodePaths.indexOf(anchorPath);
      const targetIndex = selectableNodePaths.indexOf(targetPath);
      if (anchorIndex < 0 || targetIndex < 0) {
        return additive ? new Set(baseSelection) : new Set<string>();
      }

      const [start, end] =
        anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
      const next = additive ? new Set(baseSelection) : new Set<string>();
      for (let index = start; index <= end; index += 1) {
        next.add(selectableNodePaths[index]);
      }
      return next;
    },
    [selectableNodePaths],
  );

  const handleSelectionStart = useCallback(
    (entry: FileEntry, event: ReactMouseEvent) => {
      if (event.button !== 0) return;

      listContainerRef.current?.focus();
      const nodePath = getEntryTreePath(entry);
      if (!nodePath) return;

      const additive = event.ctrlKey || event.metaKey;
      setSelectedFiles((prev) => {
        const hasRangeAnchor = event.shiftKey && !!lastSelectedRef.current;
        const anchor = hasRangeAnchor
          ? (lastSelectedRef.current ?? nodePath)
          : nodePath;
        const baseSelection = additive ? new Set(prev) : new Set<string>();
        let next: Set<string>;

        if (hasRangeAnchor) {
          next = getRangeSelection(anchor, nodePath, baseSelection, additive);
        } else if (additive) {
          next = new Set(prev);
          if (next.has(nodePath)) {
            next.delete(nodePath);
          } else {
            next.add(nodePath);
          }
        } else {
          next = new Set([nodePath]);
        }

        dragSelectionRef.current = {
          anchor,
          baseSelection,
          additive,
        };
        lastSelectedRef.current = nodePath;
        return next;
      });
    },
    [getRangeSelection],
  );

  const handleSelectionDrag = useCallback(
    (entry: FileEntry, event: ReactMouseEvent) => {
      const nodePath = getEntryTreePath(entry);
      if (!nodePath) {
        return;
      }

      const dragSelection = dragSelectionRef.current;
      if (!dragSelection || (event.buttons & 1) !== 1) {
        return;
      }

      setSelectedFiles(
        getRangeSelection(
          dragSelection.anchor,
          nodePath,
          dragSelection.baseSelection,
          dragSelection.additive,
        ),
      );
      lastSelectedRef.current = nodePath;
    },
    [getRangeSelection],
  );

  const handleContextMenuSelection = useCallback(
    (entry: FileEntry, _event: ReactMouseEvent) => {
      listContainerRef.current?.focus();
      const nodePath = getEntryTreePath(entry);
      if (!nodePath) return;

      setSelectedFiles((prev) => {
        if (prev.has(nodePath)) {
          return prev;
        }
        lastSelectedRef.current = nodePath;
        return new Set([nodePath]);
      });
    },
    [],
  );

  const navigateHistory = useCallback(
    async (direction: -1 | 1) => {
      const nextIndex = historyIndexRef.current + direction;
      const nextPath = historyRef.current[nextIndex];
      if (!nextPath) {
        return;
      }

      const previousIndex = historyIndexRef.current;
      historyIndexRef.current = nextIndex;
      const loaded = await revealPathInTree(nextPath, {
        history: "preserve",
        highlight: false,
      });
      if (!loaded) {
        historyIndexRef.current = previousIndex;
      }
    },
    [revealPathInTree],
  );

  const handleSelectHistoryPath = useCallback(
    (path: string) => {
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (
        !normalizedPath ||
        normalizedPath ===
          normalizeExplorerPath(currentPathRef.current, backend)
      ) {
        return;
      }
      setFileSearchQuery("");
      void revealPathInTree(normalizedPath, { highlight: false });
    },
    [revealPathInTree],
  );

  const handleNavigateDirectory = useCallback(
    async (path: string, options?: LoadDirectoryOptions) => {
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return false;
      setFileSearchQuery("");
      return revealPathInTree(normalizedPath, {
        ...options,
        highlight: false,
      });
    },
    [revealPathInTree],
  );

  const listChildDirectories = useCallback(
    async (path: string) => {
      if (!activeSessionId) return [];
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return [];
      return backend === "local"
        ? await invoke<DirectoryChild[]>("list_local_child_directories", {
            sessionId: activeSessionId,
            path: normalizedPath,
            showHiddenFiles,
          })
        : await invoke<DirectoryChild[]>("list_remote_child_directories", {
            sessionId: activeSessionId,
            path: normalizedPath,
            rawPathToken:
              normalizedPath ===
              normalizeExplorerPath(currentPathRef.current, backend)
                ? currentPathRawTokenRef.current
                : undefined,
            showHiddenFiles,
          });
    },
    [activeSessionId, showHiddenFiles],
  );

  const handleItemClick = (entry: FileEntry) => {
    if (isParentDirectoryEntry(entry)) {
      handleGoUp();
      return;
    }

    const nodePath = getEntryTreePath(entry);
    if (!nodePath) return;
    const backend = explorerBackendRef.current;

    if (entry.is_dir) {
      setHighlightPath(null);
      setCurrentPath(nodePath);
      setSelectedFiles((prev) => (prev.has(nodePath) ? prev : new Set([nodePath])));
      lastSelectedRef.current = nodePath;
      // Activating a directory expands it when collapsed (never collapses).
      if (!expandedPathsRef.current.has(nodePath)) {
        toggleNodeExpand(entry);
      }
      return;
    }

    setCurrentPath(getExplorerParentDirectory(nodePath, backend));
    setSelectedFiles(new Set([nodePath]));
    lastSelectedRef.current = nodePath;
  };

  const handleNewFile = () => {
    if (!activeSessionId) return;
    setNewItemDialogData({
      sessionId: activeSessionId,
      backend: explorerBackend,
      currentDirPath: currentPath,
      type: "file",
    });
  };

  const handleNewFolder = () => {
    if (!activeSessionId) return;
    setNewItemDialogData({
      sessionId: activeSessionId,
      backend: explorerBackend,
      currentDirPath: currentPath,
      type: "folder",
    });
  };

  const handleNewSymlink = () => {
    if (!activeSessionId) return;
    setNewSymlinkDialogData({
      sessionId: activeSessionId,
      currentDirPath: currentPath,
    });
  };

  const handleCurrentDirProperties = () => {
    if (!activeSessionId || !currentPath) return;
    const name = getLocalPathName(currentPath, currentPath);
    setPropertiesDialogData({
      sessionId: activeSessionId,
      backend: explorerBackend,
      fullPath: currentPath,
      rawPathToken: currentPathRawTokenRef.current,
      name,
      is_dir: true,
    });
  };

  const handleCopyCurrentPath = () => {
    navigator.clipboard.writeText(currentPath);
  };

  const sendTextToTerminal = useCallback(
    (text: string) => {
      if (!activeSessionId || !text) return;
      const peerSessionIds = getSessionInputPeerIds(
        activeSessionId,
        syncGroups,
        tabs,
        broadcastToAll,
      );
      const sendInput =
        peerSessionIds.length > 0
          ? sendSessionInputWithSync(activeSessionId, text, peerSessionIds)
          : sendSessionInput(activeSessionId, text);

      sendInput.catch(() => {});
      emit(`focus-terminal-${activeSessionId}`).catch(() => {});
    },
    [activeSessionId, broadcastToAll, syncGroups, tabs],
  );

  const handleSendCurrentPathToTerminal = () => {
    sendTextToTerminal(currentPath);
  };

  const selectedRealFiles = useMemo(
    () =>
      treeNodes.filter((node) => selectedFiles.has(node.path)).map((node) => node.entry),
    [selectedFiles, treeNodes],
  );
  const footerStats = useMemo(() => {
    const statNodes = treeNodes;
    const selectedNodes = statNodes.filter((node) =>
      selectedFiles.has(node.path),
    );
    return {
      selectedFileSize: selectedNodes.reduce(
        (sum, node) => (node.isDir ? sum : sum + node.entry.size),
        0,
      ),
      selectedItemCount: selectedNodes.length,
      totalFileSize: statNodes.reduce(
        (sum, node) => (node.isDir ? sum : sum + node.entry.size),
        0,
      ),
      totalItemCount: statNodes.length,
    };
  }, [selectedFiles, treeNodes]);
  const footerSizeText =
    footerStats.selectedItemCount > 0 && footerStats.selectedFileSize > 0
      ? `${formatSize(footerStats.selectedFileSize)}/${formatSize(footerStats.totalFileSize)}`
      : formatSize(footerStats.totalFileSize);
  const fileAiActions = useMemo(
    () =>
      appSettings.ai.enabled
        ? appSettings.ai.file_ai_actions.filter(
            (action) => action.enabled && action.name.trim(),
          )
        : [],
    [appSettings.ai.enabled, appSettings.ai.file_ai_actions],
  );

  const handleDeleteSelected = () => {
    if (selectedRealFiles.length === 0) return;
    openDeleteDialog(selectedRealFiles);
  };

  const handlePreview = async (entry: FileEntry) => {
    if (!activeSessionId || entry.is_dir) return;
    try {
      await openFilePreview({
        sessionId: activeSessionId,
        backend: explorerBackendRef.current,
        path: getEntryFullPath(entry),
        name: entry.name,
        size: entry.size,
        mtime: entry.mtime,
        target: fileWindowTarget,
      });
    } catch (error) {
      toast.error(getErrorMessage(error) || t("filePreview.openFailed"));
    }
  };

  const handleToggleHiddenFiles = useCallback(() => {
    updateUi((prev) => ({
      file_explorer_show_hidden_files: !(
        prev.file_explorer_show_hidden_files ?? true
      ),
    }));
  }, [updateUi]);

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    ) {
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "l"
    ) {
      event.preventDefault();
      event.stopPropagation();
      beginPathEditing();
      return;
    }

    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing &&
      !inlineRenameState
    ) {
      event.preventDefault();
      event.stopPropagation();
      preserveFileSearchCaretRef.current = true;
      setFileSearchQuery(event.key);
      setIsFileSearchExpanded(true);
      window.requestAnimationFrame(() => {
        const input = fileSearchInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "a"
    ) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedFiles(new Set(selectableNodePaths));
      lastSelectedRef.current = selectableNodePaths[0] ?? null;
      return;
    }

    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "Enter" || event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      selectedRealFiles.length === 1
    ) {
      const selectedEntry = selectedRealFiles[0];
      const nodePath = getEntryTreePath(selectedEntry);
      if (nodePath) {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          if (selectedEntry.is_dir) {
            toggleNodeExpand(selectedEntry);
          } else {
            void handleOpenDefault(selectedEntry);
          }
          return;
        }

        if (selectedEntry.is_dir && event.key === "ArrowRight") {
          if (!expandedPathsRef.current.has(nodePath)) {
            event.preventDefault();
            event.stopPropagation();
            toggleNodeExpand(selectedEntry);
          }
          return;
        }

        if (event.key === "ArrowLeft") {
          if (selectedEntry.is_dir && expandedPathsRef.current.has(nodePath)) {
            event.preventDefault();
            event.stopPropagation();
            toggleNodeExpand(selectedEntry);
            return;
          }
          const backend = explorerBackendRef.current;
          const parentPath = getExplorerParentDirectory(nodePath, backend);
          if (parentPath && parentPath !== nodePath) {
            event.preventDefault();
            event.stopPropagation();
            setSelectedFiles(new Set([parentPath]));
            lastSelectedRef.current = parentPath;
            setCurrentPath(parentPath);
            pendingRevealPathRef.current = parentPath;
          }
        }
      }
    }

    if (
      matchesKeyEvent(
        resolveShortcutKeys("fileExplorer.rename", appSettings.keybindings),
        event.nativeEvent,
      ) &&
      selectedRealFiles.length === 1 &&
      activeSessionId &&
      !inlineRenameState
    ) {
      event.preventDefault();
      event.stopPropagation();
      beginInlineRename(selectedRealFiles[0]);
      return;
    }

    if (
      event.key !== "Delete" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      selectedRealFiles.length === 0 ||
      deleteDialogData
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleDeleteSelected();
  };

  const handleGoUp = () => {
    const backend = explorerBackendRef.current;
    const rootPath = normalizeExplorerPath(treeRootPathRef.current, backend);
    if (!rootPath) return;
    const parentPath = getExplorerParentDirectory(rootPath, backend);
    if (!parentPath || parentPath === rootPath) return;
    setFileSearchQuery("");
    setTreeRootPath(parentPath);
    treeRootPathRef.current = parentPath;
    void revealPathInTree(parentPath, { highlight: false });
  };

  const handlePanelMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 3 || event.button === 4) {
      event.preventDefault();
      event.stopPropagation();
    }
    },
    [],
  );

  const handlePanelMouseUpCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!canBrowseFiles) return;

      if (event.button === 3) {
        event.preventDefault();
        event.stopPropagation();
        void navigateHistory(-1);
      } else if (event.button === 4) {
        event.preventDefault();
        event.stopPropagation();
        void navigateHistory(1);
      }
    },
    [canBrowseFiles, navigateHistory],
  );

  const handleSyncCwd = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const cwd = await invoke<string>("get_terminal_cwd", {
        sessionId: activeSessionId,
      });
      const backend = explorerBackendRef.current;
      const normalizedCwd = normalizeExplorerPath(cwd, backend);
      if (normalizedCwd) {
        await revealPathInTree(normalizedCwd, { collapseOthers: true });
      }
    } catch (e) {
      toast.error(`${t("fileExplorer.syncFailed")}: ${e}`);
    }
  }, [activeSessionId, revealPathInTree, t]);

  const handleToggleAutoSyncCwd = useCallback(() => {
    if (!autoSyncScopeId) return;
    updateUi((prev) => ({
      file_explorer_auto_sync_cwd_by_connection_id: {
        ...(prev.file_explorer_auto_sync_cwd_by_connection_id ?? {}),
        [autoSyncScopeId]: !autoSyncCwd,
      },
    }));
  }, [autoSyncCwd, autoSyncScopeId, updateUi]);

  const addFavoriteDirectory = useCallback(
    (path: string) => {
      if (!favoriteScopeId) return;
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return;
      const alreadyExists = favoriteDirectories.includes(normalizedPath);

      if (alreadyExists) {
        toast.success(
          t("fileExplorer.favoriteExists", { path: normalizedPath }),
        );
        return;
      }

      updateUi((prev) => {
        const currentMap =
          prev.file_explorer_favorite_dirs_by_connection_id ?? {};
        const currentList = currentMap[favoriteScopeId] ?? [];
        if (currentList.includes(normalizedPath)) {
          return {
            file_explorer_favorite_dirs_by_connection_id: currentMap,
          };
        }

        return {
          file_explorer_favorite_dirs_by_connection_id: {
            ...currentMap,
            [favoriteScopeId]: [...currentList, normalizedPath],
          },
        };
      });

      toast.success(t("fileExplorer.favoriteAdded", { path: normalizedPath }));
    },
    [favoriteScopeId, favoriteDirectories, t, updateUi],
  );

  const handleAddCurrentDirectoryToFavorites = useCallback(() => {
    addFavoriteDirectory(currentPathRef.current || homeDirRef.current);
  }, [addFavoriteDirectory]);

  const handleSelectFavoritePath = useCallback(
    (path: string) => {
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (
        !normalizedPath ||
        normalizedPath ===
          normalizeExplorerPath(currentPathRef.current, backend)
      ) {
        return;
      }
      setFileSearchQuery("");
      void revealPathInTree(normalizedPath, { highlight: false });
    },
    [revealPathInTree],
  );

  const handleRemoveFavoritePath = useCallback(
    (path: string) => {
      if (!favoriteScopeId) return;
      const backend = explorerBackendRef.current;
      const normalizedPath = normalizeExplorerPath(path, backend);
      if (!normalizedPath) return;

      updateUi((prev) => {
        const currentMap =
          prev.file_explorer_favorite_dirs_by_connection_id ?? {};
        const currentList = currentMap[favoriteScopeId] ?? [];
        return {
          file_explorer_favorite_dirs_by_connection_id: {
            ...currentMap,
            [favoriteScopeId]: currentList.filter(
              (item) => item !== normalizedPath,
            ),
          },
        };
      });
      toast.success(
        t("fileExplorer.favoriteRemoved", { path: normalizedPath }),
      );
    },
    [favoriteScopeId, t, updateUi],
  );

  const getEntryFullPath = useCallback(
    (entry: FileEntry) => {
      const treePath = getEntryTreePath(entry);
      if (treePath) return treePath;
      return joinExplorerPath(currentPath, entry.name, explorerBackend);
    },
    [currentPath, explorerBackend],
  );

  const handleAddEntryToFavorites = useCallback(
    (entry: FileEntry) => {
      if (!entry.is_dir || isParentDirectoryEntry(entry)) return;
      addFavoriteDirectory(getEntryFullPath(entry));
    },
    [addFavoriteDirectory, getEntryFullPath],
  );

  useEffect(() => {
    if (!autoSyncCwd || !activeSessionId) return;
    const unlisten = listen<string>(
      `cwd-changed-${activeSessionId}`,
      (event) => {
        syncExplorerDirectoryToTerminalCwdChange({
          backend: explorerBackendRef.current,
          currentPath: currentPathRef.current,
          cwd: event.payload,
          loadDirectory: (path, options) =>
            revealPathInTree(path, {
              ...options,
              collapseOthers: true,
            }),
        });
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [autoSyncCwd, activeSessionId, revealPathInTree]);

  // Shell-confirmed commands (cd/ls/mkdir/rm/…) may have changed directory
  // contents; refresh the visible tree then. Plain session switches do not
  // refresh — each session keeps its own snapshot.
  useEffect(() => {
    if (!activeSessionId || !canBrowseFiles) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen<{ sessionId: string; command: string }>(
      "session-command-accepted",
      (event) => {
        if (event.payload.sessionId !== activeSessionIdRef.current) return;
        if (refreshTimer !== null) {
          clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          void refreshVisibleTree();
        }, 400);
      },
    );
    return () => {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
      }
      unlisten.then((fn) => fn());
    };
  }, [activeSessionId, canBrowseFiles, refreshVisibleTree]);

  const beginInlineRename = useCallback(
    (entry: FileEntry) => {
      if (!activeSessionId || isParentDirectoryEntry(entry)) return;
      const entryPath = getEntryTreePath(entry);
      if (!entryPath) return;

      dragSelectionRef.current = null;
      lastSelectedRef.current = entryPath;
      setSelectedFiles(new Set([entryPath]));
      setInlineRenameState({
        entryName: entry.name,
        oldPath: entryPath,
        oldRawPathToken: entry.raw_path_token,
        initialName: entry.name,
        value: entry.name,
        isSubmitting: false,
      });
    },
    [activeSessionId],
  );

  const cancelInlineRename = useCallback(() => {
    setInlineRenameState((prev) => (prev?.isSubmitting ? prev : null));
  }, []);

  const handleInlineRenameSubmit = useCallback(async () => {
    if (
      !activeSessionId ||
      !inlineRenameState ||
      inlineRenameState.isSubmitting
    )
      return;

    const newName = inlineRenameState.value.trim();
    if (!newName || newName === inlineRenameState.initialName) {
      setInlineRenameState(null);
      return;
    }

    const backend = explorerBackendRef.current;
    const parentDir = getExplorerParentDirectory(
      inlineRenameState.oldPath,
      backend,
    );
    const newPath = joinExplorerPath(parentDir, newName, backend);
    setInlineRenameState((prev) =>
      prev && prev.entryName === inlineRenameState.entryName
        ? { ...prev, value: newName, isSubmitting: true }
        : prev,
    );

    try {
      if (backend === "local") {
        await invoke("rename_local_file", {
          sessionId: activeSessionId,
          oldPath: inlineRenameState.oldPath,
          newPath,
        });
      } else {
        await invoke("rename_remote_file", {
          sessionId: activeSessionId,
          oldPath: inlineRenameState.oldPath,
          newPath,
          oldRawPathToken: inlineRenameState.oldRawPathToken,
        });
      }
      invalidateDirectoryChildrenCache(parentDir);
      await loadTreeChildren(parentDir, {
        history: "preserve",
        expand: false,
      });
      setSelectedFiles(new Set([newPath]));
      lastSelectedRef.current = newPath;
      pendingRevealPathRef.current = newPath;
      setInlineRenameState(null);
    } catch (e) {
      toast.error(String(e));
      setInlineRenameState((prev) =>
        prev && prev.entryName === inlineRenameState.entryName
          ? { ...prev, isSubmitting: false }
          : prev,
      );
    }
  }, [
    activeSessionId,
    inlineRenameState,
    invalidateDirectoryChildrenCache,
    loadTreeChildren,
  ]);

  const handleFileAIAction = async (
    entry: FileEntry,
    action: AICustomActionConfig,
  ) => {
    if (!activeSessionId) return;
    const backend = explorerBackendRef.current;
    const filePath = getEntryFullPath(entry);
    try {
      const result = await invoke<RemoteTextFile>(
        backend === "local" ? "read_local_file_text" : "read_remote_file_text",
        {
          sessionId: activeSessionId,
          path: filePath,
          maxBytes: appSettings.ai.max_ai_file_size_bytes,
        },
      );
      openAIAssistant({
        action: "custom_file_action",
        userInput: action.prompt,
        selectedText: result.content,
        metadata: {
          actionId: action.id,
          actionName: action.name,
          filePath,
          fileSize: result.size,
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error) || t("ai.fileUnsupported"));
    }
  };

  const handleCopyPath = (entry: FileEntry, mode: "dir" | "name" | "full") => {
    let text = "";
    if (mode === "dir") text = currentPath;
    else if (mode === "name") text = entry.name;
    else text = getEntryFullPath(entry);
    navigator.clipboard.writeText(text);
  };

  const handleSendToTerminal = (
    entry: FileEntry,
    mode: "dir" | "name" | "full",
  ) => {
    if (!activeSessionId) return;
    let text = "";
    if (mode === "dir") text = currentPath;
    else if (mode === "name") text = entry.name;
    else text = getEntryFullPath(entry);

    sendTextToTerminal(text);
  };

  const buildDeleteItems = (entries: FileEntry[]): DeleteDialogItem[] => {
    return entries.map((entry) => ({
      path: getEntryFullPath(entry),
      name: entry.name,
      rawPathToken: entry.raw_path_token,
    }));
  };

  const buildMoveItems = (entries: FileEntry[]): MoveDialogItem[] => {
    return entries.map((entry) => ({
      oldPath: getEntryFullPath(entry),
      oldRawPathToken: entry.raw_path_token,
      name: entry.name,
      isDirectory: entry.is_dir,
    }));
  };

  const getContextMenuEntries = useCallback(
    (entry: FileEntry) => {
      if (isParentDirectoryEntry(entry)) {
        return [];
      }

      const nodePath = getEntryTreePath(entry);
      if (nodePath && selectedFiles.size > 1 && selectedFiles.has(nodePath)) {
        return treeNodes
          .filter((node) => selectedFiles.has(node.path))
          .map((node) => node.entry);
      }
      return [entry];
    },
    [selectedFiles, treeNodes],
  );

  const handleSendToPeer = useCallback(
    (entry: FileEntry) => {
      if (!activeSessionId || isParentDirectoryEntry(entry)) return;
      if (!peerEndpoint) {
        onOpenPeerSelector?.();
        return;
      }
      const entries = getContextMenuEntries(entry).map((item) => ({
        name: item.name,
        path: getEntryFullPath(item),
        isDirectory: item.is_dir,
      }));
      if (entries.length === 0) return;
      onSendEntries?.(
        {
          sessionId: activeSessionId,
          kind: explorerBackend,
          currentPath,
        },
        entries,
      );
    },
    [
      activeSessionId,
      currentPath,
      explorerBackend,
      getContextMenuEntries,
      getEntryFullPath,
      onOpenPeerSelector,
      onSendEntries,
      peerEndpoint,
    ],
  );

  const handleSendToTarget = useCallback(
    (entry: FileEntry, targetSessionId: string) => {
      if (!activeSessionId || isParentDirectoryEntry(entry)) return;
      const entries = getContextMenuEntries(entry).map((item) => ({
        name: item.name,
        path: getEntryFullPath(item),
        isDirectory: item.is_dir,
      }));
      if (entries.length === 0) return;
      onSendEntriesToTarget?.(
        {
          sessionId: activeSessionId,
          kind: explorerBackend,
          currentPath,
        },
        entries,
        targetSessionId,
      );
    },
    [
      activeSessionId,
      currentPath,
      explorerBackend,
      getContextMenuEntries,
      getEntryFullPath,
      onSendEntriesToTarget,
    ],
  );

  const openDeleteDialog = (entries: FileEntry[]) => {
    if (!activeSessionId || entries.length === 0) return;
    setDeleteDialogData({
      sessionId: activeSessionId,
      backend: explorerBackend,
      items: buildDeleteItems(entries),
    });
  };

  const openMoveDialog = (entries: FileEntry[]) => {
    if (!activeSessionId || entries.length === 0) return;
    setMoveDialogData({
      sessionId: activeSessionId,
      backend: explorerBackend,
      sourceDirectory: currentPath,
      initialTargetDirectory: currentPath,
      items: buildMoveItems(entries),
    });
  };

  const handleMoveFromContextMenu = (entry: FileEntry) => {
    openMoveDialog(getContextMenuEntries(entry));
  };

  const handleMoveSuccess = (targetDirectory: string) => {
    const backend = explorerBackendRef.current;
    const sourceDirectory =
      normalizeExplorerPath(currentPathRef.current, backend) ||
      normalizeExplorerPath(homeDirRef.current, backend);
    setSelectedFiles(new Set());
    lastSelectedRef.current = null;
    invalidateDirectoryChildrenCache(sourceDirectory);
    invalidateDirectoryChildrenCache(targetDirectory);
    void refreshVisibleTree();
  };

  const handleDeleteFromContextMenu = (entry: FileEntry) => {
    openDeleteDialog(getContextMenuEntries(entry));
  };

  const resolveDownloadDir = async (): Promise<string> => {
    const configured = appSettings.transfer.download_path;
    if (configured) return configured;
    return downloadDir();
  };

  const sanitizeDownloadFileName = async (name: string): Promise<string> =>
    invoke<string>("sanitize_download_file_name", { name });

  const downloadEntries = async (entries: FileEntry[]) => {
    if (!activeSessionId || entries.length === 0) return;

    try {
      const askEach = appSettings.transfer.ask_save_location;
      const downloads: Array<{
        sessionId: string;
        fileName: string;
        localPath: string;
        remotePath: string;
        kind: "file" | "directory";
      }> = [];

      if (askEach) {
        if (entries.length === 1) {
          const entry = entries[0];
          const safeName = await sanitizeDownloadFileName(entry.name);
          if (entry.is_dir) {
            const localDir = await openDialog({ directory: true });
            if (!localDir || typeof localDir !== "string") return;
            const localPath = await join(localDir, safeName);
            downloads.push({
              sessionId: activeSessionId,
              fileName: entry.name,
              remotePath: getEntryFullPath(entry),
              localPath,
              kind: "directory",
            });
          } else {
            const localPath = await saveDialog({ defaultPath: safeName });
            if (!localPath) return;
            downloads.push({
              sessionId: activeSessionId,
              fileName: entry.name,
              remotePath: getEntryFullPath(entry),
              localPath,
              kind: "file",
            });
          }
        } else {
          const localDir = await openDialog({ directory: true });
          if (!localDir || typeof localDir !== "string") return;

          for (const entry of entries) {
            const safeName = await sanitizeDownloadFileName(entry.name);
            const localPath = await join(localDir, safeName);
            downloads.push({
              sessionId: activeSessionId,
              fileName: entry.name,
              remotePath: getEntryFullPath(entry),
              localPath,
              kind: entry.is_dir ? "directory" : "file",
            });
          }
        }
        enqueueDownloads(downloads);
        return;
      }

      const defaultDir = await resolveDownloadDir();

      for (const entry of entries) {
        const safeName = await sanitizeDownloadFileName(entry.name);
        const localPath = await join(defaultDir, safeName);
        downloads.push({
          sessionId: activeSessionId,
          fileName: entry.name,
          remotePath: getEntryFullPath(entry),
          localPath,
          kind: entry.is_dir ? "directory" : "file",
        });
      }
      enqueueDownloads(downloads);
    } catch (e) {
      logger.error({
        domain: "transfer.lifecycle",
        event: "download.failed",
        message: "Download failed",
        ids: activeSessionId ? { session_id: activeSessionId } : undefined,
        error: e,
      });
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedRealFiles.length === 0) return;
    await downloadEntries(selectedRealFiles);
  };

  const handleDownload = async (entry: FileEntry) => {
    await downloadEntries([entry]);
  };

  const handleDownloadFromContextMenu = async (entry: FileEntry) => {
    if (selectedFiles.size > 1 && selectedFiles.has(entry.name)) {
      const selected = getContextMenuEntries(entry);
      await downloadEntries(selected);
      return;
    }

    await handleDownload(entry);
  };

  const handleUploadFiles = async () => {
    if (!canUseRemoteTransfer) return;
    const target = resolveUploadTarget();
    if (!target) return;

    try {
      const localPaths = await openDialog({ multiple: true, directory: false });
      if (!localPaths) return;
      const pathList = (
        Array.isArray(localPaths) ? localPaths : [localPaths]
      ).filter(
        (localPath): localPath is string => typeof localPath === "string",
      );
      await uploadLocalEntriesToTarget(
        target,
        pathList.map((path) => ({
          path,
          isDir: false,
        })),
      );
    } catch (error) {
      logger.error({
        domain: "transfer.lifecycle",
        event: "upload.selection_failed",
        message: "Upload selection failed",
        ids: { session_id: target.sessionId },
        error,
      });
    }
  };

  const handleUploadFolder = async () => {
    if (!canUseRemoteTransfer) return;
    const target = resolveUploadTarget();
    if (!target) return;

    try {
      const localDirs = await openDialog({ directory: true, multiple: true });
      if (!localDirs) return;
      const pathList = (
        Array.isArray(localDirs) ? localDirs : [localDirs]
      ).filter((localDir): localDir is string => typeof localDir === "string");
      await uploadLocalEntriesToTarget(
        target,
        pathList.map((path) => ({
          path,
          isDir: true,
        })),
      );
    } catch (error) {
      logger.error({
        domain: "transfer.lifecycle",
        event: "upload.folder_failed",
        message: "Upload folder failed",
        ids: { session_id: target.sessionId },
        error,
      });
    }
  };

  const handleOpenExternal = async (entry: FileEntry) => {
    if (!activeSessionId || entry.is_dir) return;
    if (explorerBackendRef.current === "local") {
      try {
        await openPath(
          getEntryFullPath(entry),
          appSettings.transfer.default_editor || undefined,
        );
      } catch (e) {
        toast.error(String(e));
      }
      return;
    }

    let localPath: string;
    try {
      const tDir = await tempDir();
      const downloadTimestamp = Date.now().toString();
      const safeName = await sanitizeDownloadFileName(entry.name);
      localPath = await join(
        tDir,
        "niceterm",
        activeSessionId,
        downloadTimestamp,
        safeName,
      );
      await invoke("download_remote_file", {
        sessionId: activeSessionId,
        remotePath: getEntryFullPath(entry),
        localPath,
      });
    } catch (e) {
      logger.error({
        domain: "transfer.lifecycle",
        event: "download.open_failed",
        message: "Download for open failed",
        ids: { session_id: activeSessionId },
        error: e,
      });
      return;
    }

    try {
      await invoke("start_file_watch", {
        sessionId: activeSessionId,
        localPath,
        remotePath: getEntryFullPath(entry),
      });

      await openPath(
        localPath,
        appSettings.transfer.default_editor || undefined,
      );
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleOpenInternal = async (entry: FileEntry) => {
    if (
      !activeSessionId ||
      entry.is_dir ||
      (activeSessionType !== "SSH" && activeSessionType !== "Local")
    ) {
      return;
    }

    const backend = explorerBackendRef.current;
    const path = getEntryFullPath(entry);
    if (resolveInternalEditorDisplay(appSettings.transfer.internal_editor_display) === "window") {
      try {
        await openRemoteFileEditor({
          sessionId: activeSessionId,
          backend,
          path,
          name: entry.name,
          size: entry.size,
          mtime: entry.mtime,
          target: fileWindowTarget,
        });
      } catch (error) {
        toast.error(
          getErrorMessage(error) || t("fileExplorer.openInternalFailed"),
        );
      }
      return;
    }

    const existing = findOpenFileDocument(tabs, {
      backend,
      sessionId: activeSessionId,
      path,
    });
    if (existing) {
      setActivePane(existing.tabId, existing.paneId);
      return;
    }

    try {
      const result = await invoke<TextFileOpenResult>(
        backend === "local" ? "open_local_file_text" : "open_remote_file_text",
        { sessionId: activeSessionId, path, maxBytes: MAX_EDITOR_FILE_BYTES },
      );
      if (result.status === "unsupported") {
        toast.info(
          t(
            result.reason === "binary"
              ? "fileExplorer.binaryOpenExternal"
              : "fileExplorer.unsupportedEncodingOpenExternal",
          ),
        );
      await handleOpenExternal(entry);
      return;
    }

      openFileDocument({
        sessionId: activeSessionId,
        name: entry.name,
        type: activeSessionType,
        connectionId: activeConnectionId ?? undefined,
        backend,
        path,
        file: {
          content: result.file.content,
          size: result.file.size,
          mtime: result.file.mtime ?? entry.mtime,
          mtimeNanos: result.file.mtimeNanos,
          contentHash: result.file.contentHash,
        },
      });
    } catch (error) {
      toast.error(
        getErrorMessage(error) || t("fileExplorer.openInternalFailed"),
      );
    }
  };

  const handleOpenDefault = async (entry: FileEntry) => {
    if (resolveFileEditorOpenTarget(appSettings.transfer) !== "external") {
      await handleOpenInternal(entry);
      return;
    }
    await handleOpenExternal(entry);
  };

  // Memoized file rows need callback identities that stay stable across
  // renders; dispatch through a ref holding the latest implementations.
  const latestRowHandlers = {
    onItemClick: handleItemClick,
    onOpenDefault: handleOpenDefault,
    onPreview: handlePreview,
    onOpenInternal: handleOpenInternal,
    onOpenExternal: handleOpenExternal,
    onRefresh: () => void refreshVisibleTree(),
    onUpload: handleUploadFiles,
    onUploadFolder: handleUploadFolder,
    onDownload: handleDownloadFromContextMenu,
    onMove: handleMoveFromContextMenu,
    onDelete: handleDeleteFromContextMenu,
    onCopyPath: handleCopyPath,
    onSendToTerminal: handleSendToTerminal,
    onProperties: (entry: FileEntry) => {
      if (activeSessionId) {
        setPropertiesDialogData({
          sessionId: activeSessionId,
          backend: explorerBackend,
          fullPath: getEntryFullPath(entry),
          rawPathToken: entry.raw_path_token,
          name: entry.name,
          is_dir: entry.is_dir,
        });
      }
    },
    onAIAction: (entry: FileEntry, action: AICustomActionConfig) =>
      void handleFileAIAction(entry, action),
    onInlineRenameSubmit: () => void handleInlineRenameSubmit(),
  };
  const rowHandlersRef = useRef(latestRowHandlers);
  rowHandlersRef.current = latestRowHandlers;

  const stableRowCallbacks = useMemo(
    () => ({
      onItemClick: (entry: FileEntry) =>
        rowHandlersRef.current.onItemClick(entry),
      onOpenDefault: (entry: FileEntry) =>
        void rowHandlersRef.current.onOpenDefault(entry),
      onPreview: (entry: FileEntry) =>
        void rowHandlersRef.current.onPreview(entry),
      onOpenInternal: (entry: FileEntry) =>
        void rowHandlersRef.current.onOpenInternal(entry),
      onOpenExternal: (entry: FileEntry) =>
        void rowHandlersRef.current.onOpenExternal(entry),
      onRefresh: () => rowHandlersRef.current.onRefresh(),
      onUpload: () => void rowHandlersRef.current.onUpload(),
      onUploadFolder: () => void rowHandlersRef.current.onUploadFolder(),
      onDownload: (entry: FileEntry) =>
        void rowHandlersRef.current.onDownload(entry),
      onMove: (entry: FileEntry) => void rowHandlersRef.current.onMove(entry),
      onDelete: (entry: FileEntry) =>
        void rowHandlersRef.current.onDelete(entry),
      onCopyPath: (entry: FileEntry, mode: "dir" | "name" | "full") =>
        rowHandlersRef.current.onCopyPath(entry, mode),
      onSendToTerminal: (entry: FileEntry, mode: "dir" | "name" | "full") =>
        rowHandlersRef.current.onSendToTerminal(entry, mode),
      onProperties: (entry: FileEntry) =>
        rowHandlersRef.current.onProperties(entry),
      onAIAction: (entry: FileEntry, action: AICustomActionConfig) =>
        void rowHandlersRef.current.onAIAction(entry, action),
      onInlineRenameSubmit: () =>
        void rowHandlersRef.current.onInlineRenameSubmit(),
      onInlineRenameChange: (value: string) =>
        setInlineRenameState((prev) =>
          prev && !prev.isSubmitting ? { ...prev, value } : prev,
        ),
    }),
    [],
  );

  const displayPath = currentPath || homeDir || "~";

  const hasNoSearchMatches = isFileSearchActive && treeNodes.length === 0;

  const visibleNodes = useMemo(() => {
    if (treeNodes.length === 0) {
      return treeNodes;
    }

    const viewportHeight =
      listViewportHeight > 0 ? listViewportHeight : FILE_LIST_ITEM_HEIGHT * 12;
    const visibleCount = Math.max(
      1,
      Math.ceil(viewportHeight / FILE_LIST_ITEM_HEIGHT),
    );
    const startIndex = Math.max(
      0,
      Math.floor(listScrollTop / FILE_LIST_ITEM_HEIGHT) - FILE_LIST_OVERSCAN,
    );
    const endIndex = Math.min(
      treeNodes.length,
      startIndex + visibleCount + FILE_LIST_OVERSCAN * 2,
    );

    return treeNodes.slice(startIndex, endIndex);
  }, [treeNodes, listScrollTop, listViewportHeight]);

  const virtualListPadding = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { top: 0, bottom: 0 };
    }

    const startIndex = treeNodes.indexOf(visibleNodes[0]);
    const top = startIndex * FILE_LIST_ITEM_HEIGHT;
    const bottom = Math.max(
      0,
      (treeNodes.length - startIndex - visibleNodes.length) *
        FILE_LIST_ITEM_HEIGHT,
    );

    return { top, bottom };
  }, [treeNodes, visibleNodes]);

  useEffect(() => {
    const revealPath = pendingRevealPathRef.current;
    const container = listContainerRef.current;
    if (!revealPath || !container) {
      return;
    }

    const nodeIndex = treeNodes.findIndex((node) => node.path === revealPath);
    if (nodeIndex < 0) {
      return;
    }

    pendingRevealPathRef.current = null;
    const nextScrollTop = Math.max(
      0,
      nodeIndex * FILE_LIST_ITEM_HEIGHT - FILE_LIST_ITEM_HEIGHT,
    );
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = nextScrollTop;
      setListScrollTop(container.scrollTop);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [treeNodes]);

  // Keep the current directory's row visible after navigation: when the
  // current path changes (or new children push it out of view), scroll the
  // least amount needed to bring its row back into the viewport instead of
  // resetting to the top.
  const lastCurrentPathForViewRef = useRef<string | null>(null);
  useEffect(() => {
    const targetPath = currentPath || null;
    const previousPath = lastCurrentPathForViewRef.current;
    lastCurrentPathForViewRef.current = targetPath;
    if (!targetPath || targetPath === previousPath) return;

    const container = listContainerRef.current;
    if (!container) return;
    const nodeIndex = treeNodes.findIndex((node) => node.path === targetPath);
    if (nodeIndex < 0) return;

    const nodeTop = nodeIndex * FILE_LIST_ITEM_HEIGHT;
    const nodeBottom = nodeTop + FILE_LIST_ITEM_HEIGHT;
    const viewportTop = container.scrollTop;
    const viewportBottom =
      viewportTop + Math.max(1, container.clientHeight) - FILE_LIST_ITEM_HEIGHT;

    let nextScrollTop = container.scrollTop;
    if (nodeBottom > viewportBottom) {
      nextScrollTop = nodeBottom - Math.max(1, container.clientHeight);
    } else if (nodeTop < viewportTop) {
      nextScrollTop = Math.max(0, nodeTop - FILE_LIST_ITEM_HEIGHT);
    } else {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = nextScrollTop;
      setListScrollTop(container.scrollTop);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPath, treeNodes]);

  return (
    <aside
      className="niceterm-wallpaper-transparent-surface h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--df-bg-panel)" }}
      onMouseDownCapture={handlePanelMouseDownCapture}
      onMouseUpCapture={handlePanelMouseUpCapture}
    >
      <PanelHeader
        title={t("panel.fileExplorer")}
        meta={headerMeta}
        actions={headerActions}
      />

      {canBrowseFiles && (
        <FileExplorerToolbar
          selectedCount={selectedRealFiles.length}
          isFileSearchActive={isFileSearchActive}
          isFileSearchExpanded={isFileSearchExpanded}
          showHiddenFiles={showHiddenFiles}
          showTransferActions={canUseRemoteTransfer}
          fileSearchQuery={fileSearchQuery}
          fileSearchInputRef={fileSearchInputRef}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onUploadFiles={handleUploadFiles}
          onUploadFolder={handleUploadFolder}
          onDownloadSelected={() => void handleDownloadSelected()}
          onDeleteSelected={handleDeleteSelected}
          onGoUp={handleGoUp}
          onRefresh={() => void refreshVisibleTree()}
          onToggleHiddenFiles={handleToggleHiddenFiles}
          onExpandSearch={() => setIsFileSearchExpanded(true)}
          onSearchQueryChange={setFileSearchQuery}
          onCollapseSearch={() => setIsFileSearchExpanded(false)}
        />
      )}

      {canBrowseFiles && (
        <FileExplorerPathBar
          isEditingPath={isEditingPath}
          pathInputText={pathInputText}
          pathInputRef={pathInputRef}
          backend={explorerBackend}
          displayPath={displayPath}
          currentPath={currentPath}
          homeDir={homeDir}
          sessionId={activeSessionId ?? ""}
          currentDirectoryEntries={files}
          showHiddenFiles={showHiddenFiles}
          directoryHistory={visitedHistory}
          favoriteDirectories={favoriteDirectories}
          onPathInputTextChange={setPathInputText}
          onEditingPathChange={setIsEditingPath}
          onLoadDirectory={(path) =>
            void revealPathInTree(path, { highlight: false })
          }
          onNavigate={handleNavigateDirectory}
          onListChildDirectories={listChildDirectories}
          onSelectHistoryPath={handleSelectHistoryPath}
          onAddCurrentDirectoryToFavorites={
            handleAddCurrentDirectoryToFavorites
          }
          onSelectFavoritePath={handleSelectFavoritePath}
          onRemoveFavoritePath={handleRemoveFavoritePath}
        />
      )}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative min-h-0 flex-1">
            {isExternalDropActive && canBrowseFiles && (
              <ExternalFileDropOverlay
                insetClassName="inset-3"
                title={t("fileExplorer.externalDropOverlayTitle")}
                hint={
                  externalDropDirPath
                    ? t("fileExplorer.externalDropOverlayDirHint")
                    : t("fileExplorer.externalDropOverlayHint")
                }
              />
            )}
            <div
              ref={listContainerRef}
              className="h-full overflow-auto text-sm terminal-scroll outline-none"
              tabIndex={canBrowseFiles ? 0 : -1}
              onMouseDown={() => {
                if (canBrowseFiles) {
                  listContainerRef.current?.focus();
                }
              }}
              onKeyDown={handleListKeyDown}
            >
              {!activeSessionId ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: "var(--df-text-dimmed)" }}
                >
                  <MdFolderOff className="text-xl block mx-auto mb-2" />
                  <div className="text-sm block mb-2">
                    {t("fileExplorer.connectToSession")}
                  </div>
                </div>
              ) : hasUnsupportedSession ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: "var(--df-text-dimmed)" }}
                >
                  <MdFolderOff className="text-xl block mx-auto mb-2" />
                  <div className="text-sm block mb-2">
                    {t("fileExplorer.unsupportedSession")}
                  </div>
                  <div>{t("fileExplorer.unsupportedSessionDesc")}</div>
                </div>
              ) : isResolvingRemoteFileBrowser ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: "var(--df-text-dimmed)" }}
                >
                  {t("fileExplorer.loading")}
                </div>
              ) : hasRemoteFileBrowserDisabled ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: "var(--df-text-dimmed)" }}
                >
                  <MdFolderOff className="text-xl block mx-auto mb-2" />
                  <div className="text-sm block mb-2">
                    {t("fileExplorer.remoteBrowserDisabled")}
                  </div>
                  <div>{t("fileExplorer.remoteBrowserDisabledDesc")}</div>
                </div>
              ) : (
                <>
                  {directoryLoading ? (
                    <div
                      className="px-2 py-4 text-center text-xs"
                      style={{ color: "var(--df-text-dimmed)" }}
                    >
                      {t("fileExplorer.loading")}
                    </div>
                  ) : error ? (
                    <div className="px-2 py-4 text-center text-xs text-red-400">
                      {error}
                    </div>
                  ) : hasNoSearchMatches ? (
                    <div
                      className="px-2 py-4 text-center text-xs"
                      style={{ color: "var(--df-text-dimmed)" }}
                    >
                      {t("fileExplorer.noSearchResults")}
                    </div>
                  ) : treeNodes.length === 0 ? (
                    <div
                      className="px-2 py-4 text-center text-xs"
                      style={{ color: "var(--df-text-dimmed)" }}
                    >
                      {t("fileExplorer.emptyDirectory")}
                    </div>
                  ) : (
                    <ul
                      style={{
                        paddingTop: virtualListPadding.top,
                        paddingBottom: virtualListPadding.bottom + 8,
                      }}
                    >
                      {visibleNodes.map((node) => (
                        <FileListItem
                          key={node.path}
                          entry={node.entry}
                          depth={node.depth}
                          isExpanded={node.isDir && expandedPaths.has(node.path)}
                          onToggleExpand={toggleNodeExpand}
                          isLoadingChildren={loadingDirPaths.has(node.path)}
                          isHighlighted={highlightPath === node.path}
                          isExternalDropTarget={
                            node.isDir && externalDropDirPath === node.path
                          }
                          isSelected={selectedFiles.has(node.path)}
                          selectedCount={selectedRealFiles.length}
                          isParentDirectoryEntry={false}
                          activeSessionId={activeSessionId}
                          editorType={
                            appSettings.transfer.editor_type || "internal"
                          }
                          onSelectionStart={handleSelectionStart}
                          onSelectionDrag={handleSelectionDrag}
                          onContextMenuSelect={handleContextMenuSelection}
                          onItemClick={stableRowCallbacks.onItemClick}
                          onOpenDefault={stableRowCallbacks.onOpenDefault}
                          onPreview={stableRowCallbacks.onPreview}
                          onOpenInternal={stableRowCallbacks.onOpenInternal}
                          onOpenExternal={stableRowCallbacks.onOpenExternal}
                          onRefresh={stableRowCallbacks.onRefresh}
                          showTransferActions={canUseRemoteTransfer}
                          onUpload={stableRowCallbacks.onUpload}
                          onUploadFolder={stableRowCallbacks.onUploadFolder}
                          onDownload={stableRowCallbacks.onDownload}
                          showPeerSendAction={!!peerEndpoint && !!onSendEntries}
                          onSendToPeer={handleSendToPeer}
                          sendTargetOptions={sendTargetOptions}
                          onSendToTarget={handleSendToTarget}
                          onRename={beginInlineRename}
                          onMove={stableRowCallbacks.onMove}
                          onDelete={stableRowCallbacks.onDelete}
                          onAddToFavorites={handleAddEntryToFavorites}
                          onCopyPath={stableRowCallbacks.onCopyPath}
                          onSendToTerminal={stableRowCallbacks.onSendToTerminal}
                          onProperties={stableRowCallbacks.onProperties}
                          aiActions={
                            node.isDir ||
                            node.entry.size >
                              appSettings.ai.max_ai_file_size_bytes
                              ? EMPTY_AI_ACTIONS
                              : fileAiActions
                          }
                          onAIAction={stableRowCallbacks.onAIAction}
                          inlineRename={
                            inlineRenameState?.entryName === node.entry.name
                              ? {
                                  value: inlineRenameState.value,
                                  isSubmitting: inlineRenameState.isSubmitting,
                                }
                              : null
                          }
                          onInlineRenameChange={
                            stableRowCallbacks.onInlineRenameChange
                          }
                          onInlineRenameSubmit={
                            stableRowCallbacks.onInlineRenameSubmit
                          }
                          onInlineRenameCancel={cancelInlineRename}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        {canBrowseFiles && (
          <ContextMenuContent className="w-52">
            <ContextMenuItem onClick={() => void refreshVisibleTree()}>
              <MdRefresh className="mr-2 h-4 w-4" />
              {t("fileExplorer.refresh")}
            </ContextMenuItem>
            {canUseRemoteTransfer && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <MdUpload className="mr-2 h-4 w-4" />
                    {t("fileExplorer.cmUpload")}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem onClick={handleUploadFiles}>
                      <MdUpload className="mr-2 h-4 w-4" />
                      {t("fileExplorer.upload")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleUploadFolder}>
                      <MdDriveFolderUpload className="mr-2 h-4 w-4" />
                      {t("fileExplorer.uploadFolder")}
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={handleNewFile}>
              <MdNoteAdd className="mr-2 h-4 w-4" />
              {t("fileExplorer.newFile")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleNewFolder}>
              <MdCreateNewFolder className="mr-2 h-4 w-4" />
              {t("fileExplorer.newFolder")}
            </ContextMenuItem>
            {explorerBackend === "remote" && (
              <ContextMenuItem onClick={handleNewSymlink}>
                <MdLink className="mr-2 h-4 w-4" />
                {t("fileExplorer.newSymlink")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleCopyCurrentPath}>
              <MdContentCopy className="mr-2 h-4 w-4" />
              {t("fileExplorer.copyDirPath")}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleSendCurrentPathToTerminal}>
              <LuClipboardPaste className="mr-2 h-4 w-4" />
              {t("fileExplorer.sendDirPathToTerminal")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleCurrentDirProperties}>
              <MdInfo className="mr-2 h-4 w-4" />
              {t("fileExplorer.properties")}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {canBrowseFiles && (
        <div
          className="niceterm-wallpaper-control-surface px-2 py-1.5 text-[0.6875rem] border-t flex items-center justify-between shrink-0"
          style={{
            color: "var(--df-text-dimmed)",
            borderColor: "var(--df-border)",
            backgroundColor: "var(--df-bg-panel)",
          }}
        >
          <div className="flex gap-4">
            {!directoryLoading && !error && footerStats.totalItemCount > 0 && (
              <>
                <span>
                  {footerStats.selectedItemCount > 0
                    ? t("fileExplorer.selectedItems", {
                        selected: footerStats.selectedItemCount,
                        total: footerStats.totalItemCount,
                      })
                    : t("fileExplorer.totalItems", {
                        count: footerStats.totalItemCount,
                      })}
                </span>
                <span>{footerSizeText}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleSyncCwd}
                    disabled={!cwdTrackingActive}
                  >
                    <LuFolderSync className="h-[0.875rem] w-[0.875rem]" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {cwdTrackingActive
                  ? t("fileExplorer.syncTerminalPath")
                  : t("fileExplorer.cwdTrackingUnavailable")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
                      cwdTrackingActive
                        ? autoSyncCwd
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground"
                    }`}
                    onClick={handleToggleAutoSyncCwd}
                    disabled={!cwdTrackingActive || !autoSyncScopeId}
                  >
                    <MdSyncLock className="h-[0.875rem] w-[0.875rem]" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {cwdTrackingActive
                  ? t("fileExplorer.autoSyncTerminalPath")
                  : t("fileExplorer.cwdTrackingUnavailable")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      sendTextToTerminal(currentPath);
                    }}
                  >
                    <LuClipboardPaste className="h-[0.875rem] w-[0.875rem]" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("fileExplorer.sendToTerminal")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <FileExplorerDialogs
        deleteDialogData={deleteDialogData}
        moveDialogData={moveDialogData}
        newItemDialogData={newItemDialogData}
        newSymlinkDialogData={newSymlinkDialogData}
        propertiesDialogData={propertiesDialogData}
        onDeleteClose={() => setDeleteDialogData(null)}
        onMoveClose={() => setMoveDialogData(null)}
        onNewItemClose={() => setNewItemDialogData(null)}
        onNewSymlinkClose={() => setNewSymlinkDialogData(null)}
        onPropertiesClose={() => setPropertiesDialogData(null)}
        onDeleteSuccess={() => {
          setSelectedFiles(new Set());
          lastSelectedRef.current = null;
          void refreshVisibleTree();
        }}
        onMoveSuccess={handleMoveSuccess}
        onRefresh={refreshVisibleTree}
        onOpenDirectoryEntry={(entry) => {
          // NewItemDialog passes back mock entries; anchor them to the
          // directory the dialog created them in so tree paths resolve.
          const basePath =
            newItemDialogData?.currentDirPath ?? currentPathRef.current;
          const backend = explorerBackendRef.current;
          const entryPath = joinExplorerPath(basePath, entry.name, backend);
          if (entry.is_dir) {
            void revealPathInTree(entryPath, { highlight: false });
            return;
          }
          void handleOpenDefault(withTreePath(entry, entryPath));
        }}
        onOpenDefault={(entry) => void handleOpenDefault(entry)}
      />
    </aside>
  );
}
