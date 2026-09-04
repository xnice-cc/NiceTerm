import { useTranslation } from "react-i18next";
import type { SplitEdgeDirection } from "@/lib/tabWindows";

export type DropZone =
  | {
      type: "center";
    }
  | {
      type: "edge";
      direction: SplitEdgeDirection;
    };

interface DropZoneOverlayProps {
  zone: DropZone;
}

const edgePlacement: Record<SplitEdgeDirection, string> = {
  left: "inset-y-3 left-3 w-[38%]",
  right: "inset-y-3 right-3 w-[38%]",
  top: "inset-x-3 top-3 h-[38%]",
  bottom: "inset-x-3 bottom-3 h-[38%]",
};

const edgeLabelKey: Record<SplitEdgeDirection, string> = {
  left: "terminal.tabDockSplitLeft",
  right: "terminal.tabDockSplitRight",
  top: "terminal.tabDockSplitTop",
  bottom: "terminal.tabDockSplitBottom",
};

export default function DropZoneOverlay({ zone }: DropZoneOverlayProps) {
  const { t } = useTranslation();

  const label =
    zone.type === "center" ? t("terminal.tabDockMerge") : t(edgeLabelKey[zone.direction]);
  const placement = zone.type === "center" ? "inset-3" : edgePlacement[zone.direction];

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className={`absolute ${placement} flex items-center justify-center rounded border-2 border-dashed`}
        style={{
          borderColor: "var(--df-primary)",
          backgroundColor: "color-mix(in srgb, var(--df-primary) 16%, transparent)",
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--df-primary) 20%, transparent)",
        }}
      >
        <div
          className="rounded border px-3 py-1.5 text-xs font-medium shadow-lg"
          style={{
            borderColor: "var(--df-primary)",
            backgroundColor: "var(--df-bg-panel)",
            color: "var(--df-text)",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
