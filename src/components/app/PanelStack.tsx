import { Fragment, type ReactNode, useRef } from "react";
import ResizeHandle from "@/components/layout/ResizeHandle";

interface PanelStackProps {
  panelIds: string[];
  /** Exclusive panel (e.g. AI assistant) shown on its own instead of the stack. */
  overlayPanelId: string | null;
  /**
   * Multi-open switch mode: only this panel is visible while the remaining
   * open panels stay mounted but hidden (state-preserving switching). When
   * omitted, all panels are stacked visibly (legacy stacked layout).
   */
  activePanelId?: string | null;
  sizes: Record<string, number>;
  renderPanel: (panelId: string | null) => ReactNode;
  onResizePair: (aboveId: string, belowId: string, delta: number, containerHeight: number) => void;
}

/**
 * Renders the side panel stack. In multi-open switch mode only the active
 * panel is visible; the other open panels stay mounted but hidden so their
 * state survives switching. When `overlayPanelId` is set, that panel is shown
 * alone while the stack stays mounted but hidden.
 */
export default function PanelStack({
  panelIds,
  overlayPanelId,
  activePanelId,
  sizes,
  renderPanel,
  onResizePair,
}: PanelStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayEverShownRef = useRef(false);
  const lastOverlayIdRef = useRef<string | null>(null);
  if (overlayPanelId) {
    overlayEverShownRef.current = true;
    lastOverlayIdRef.current = overlayPanelId;
  }
  const overlayActive = Boolean(overlayPanelId);
  const switchMode = activePanelId !== undefined;
  const visibleId =
    activePanelId === undefined ? (panelIds[0] ?? null) : activePanelId;

  // Switch mode renders only the visible panel: hidden panels are unmounted
  // so switching terminals never pays for re-rendering background panels.
  const stack = switchMode ? (
    visibleId ? (
      <div className="h-full min-h-0 overflow-hidden">{renderPanel(visibleId)}</div>
    ) : null
  ) : panelIds.length <= 1 ? (
    renderPanel(panelIds[0] ?? null)
  ) : (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      {panelIds.map((panelId, index) => (
        <Fragment key={panelId}>
          {index > 0 && (
            <ResizeHandle
              direction="vertical"
              onResize={(delta) =>
                onResizePair(
                  panelIds[index - 1],
                  panelId,
                  delta,
                  containerRef.current?.clientHeight ?? 0,
                )
              }
            />
          )}
          <div
            className="min-h-0 overflow-hidden"
            style={{ flexGrow: sizes[panelId] ?? 1, flexShrink: 1, flexBasis: 0, minHeight: 48 }}
          >
            {renderPanel(panelId)}
          </div>
        </Fragment>
      ))}
    </div>
  );

  if (!overlayEverShownRef.current) {
    return <>{stack}</>;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className={overlayActive ? "hidden" : "h-full min-h-0"}>{stack}</div>
      <div className={overlayActive ? "h-full min-h-0" : "hidden"}>
        {renderPanel(lastOverlayIdRef.current)}
      </div>
    </div>
  );
}
