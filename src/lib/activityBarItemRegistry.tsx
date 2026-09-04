import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { BiServer } from "react-icons/bi";
import { FaRegFolder } from "react-icons/fa";
import { LuKeyRound } from "react-icons/lu";
import {
  MdAutoAwesome,
  MdBackup,
  MdBolt,
  MdHistory,
  MdLan,
  MdLink,
  MdListAlt,
  MdLock,
  MdOutlineMonitorHeart,
  MdOutlineStickyNote2,
  MdSend,
  MdSettings,
} from "react-icons/md";
import { PiRecordFill } from "react-icons/pi";
import { SiDocker, SiNvidia } from "react-icons/si";

function AscendIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[1em] w-[1em] bg-current"
      style={{
        WebkitMask: "url('/icons/brands/ascend.svg') center / contain no-repeat",
        mask: "url('/icons/brands/ascend.svg') center / contain no-repeat",
      }}
    />
  );
}

export type ActivityBarItemMeta = {
  icon: ReactNode;
  tooltip: string;
};

/**
 * Shared icon + label catalog for every activity bar item. Used by the
 * activity bars themselves and by the settings UI that configures them.
 */
export function buildActivityBarItemRegistry(
  t: TFunction,
  recordingActive: boolean,
): Record<string, ActivityBarItemMeta> {
  return {
    fileExplorer: { icon: <FaRegFolder />, tooltip: t("panel.fileExplorer") },
    notes: { icon: <MdOutlineStickyNote2 />, tooltip: t("panel.notes") },
    network: { icon: <MdLan />, tooltip: t("panel.network") },
    securityAuth: { icon: <LuKeyRound />, tooltip: t("securityAuth.title") },
    syncBackupHistory: {
      icon: <MdBackup />,
      tooltip: t("panel.syncBackupHistory"),
    },
    settings: { icon: <MdSettings />, tooltip: t("settings.title") },
    savedConnections: {
      icon: <BiServer />,
      tooltip: t("panel.savedConnections"),
    },
    aiAssistant: { icon: <MdAutoAwesome />, tooltip: t("ai.title") },
    activeSessions: { icon: <MdLink />, tooltip: t("panel.activeSessions") },
    commandHistory: { icon: <MdHistory />, tooltip: t("panel.commandHistory") },
    resourceMonitor: {
      icon: <MdOutlineMonitorHeart />,
      tooltip: t("panel.resourceMonitor"),
    },
    gpuMonitor: { icon: <SiNvidia />, tooltip: t("panel.gpuMonitor") },
    ascendNpuMonitor: {
      icon: <AscendIcon />,
      tooltip: t("panel.ascendNpuMonitor"),
    },
    processManager: { icon: <MdListAlt />, tooltip: t("panel.processManager") },
    dockerManager: { icon: <SiDocker />, tooltip: t("panel.dockerManager") },
    quickCmdBar: { icon: <MdBolt />, tooltip: t("panel.quickCommands") },
    serialSend: {
      icon: <MdSend />,
      tooltip: t("panel.serialSend", "Command Send"),
    },
    recording: {
      icon: (
        <PiRecordFill className={recordingActive ? "animate-pulse" : undefined} />
      ),
      tooltip: t("recording.panelTitle"),
    },
    lock: { icon: <MdLock />, tooltip: t("statusBar.lock") },
  };
}
