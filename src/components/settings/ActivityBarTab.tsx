import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import {
  hideActivityBarItem,
  resetActivityBarLayout,
  showActivityBarItem,
} from "@/lib/appWorkspace";
import { buildActivityBarItemRegistry } from "@/lib/activityBarItemRegistry";
import type { ActivityBarLayout, ActivityBarZone } from "@/types/global";
import { SettingRow, SettingSection, SettingSwitch } from "./SettingFormItems";

const ZONE_CONFIGS: { zone: ActivityBarZone; labelKey: string }[] = [
  { zone: "left_top", labelKey: "settings.activityBarZoneLeftTop" },
  { zone: "left_bottom", labelKey: "settings.activityBarZoneLeftBottom" },
  { zone: "right_top", labelKey: "settings.activityBarZoneRightTop" },
  { zone: "right_bottom", labelKey: "settings.activityBarZoneRightBottom" },
];

function removeItemId(ids: string[], itemId: string) {
  return ids.filter((id) => id !== itemId);
}

export function ActivityBarTab() {
  const { t } = useTranslation();
  const { appSettings, updateUi } = useApp();
  const layout = appSettings.ui.activity_bar_layout;
  const registry = useMemo(
    () => buildActivityBarItemRegistry(t, false),
    [t],
  );

  const writeLayout = useCallback(
    (next: ActivityBarLayout) => updateUi({ activity_bar_layout: next }),
    [updateUi],
  );

  const moveItemToZone = useCallback(
    (itemId: string, targetZone: ActivityBarZone) => {
      const next: ActivityBarLayout = {
        ...layout,
        left_top: removeItemId(layout.left_top, itemId),
        left_bottom: removeItemId(layout.left_bottom, itemId),
        right_top: removeItemId(layout.right_top, itemId),
        right_bottom: removeItemId(layout.right_bottom, itemId),
        hidden_items: removeItemId(layout.hidden_items ?? [], itemId),
      };
      next[targetZone] = [...next[targetZone], itemId];
      writeLayout(next);
    },
    [layout, writeLayout],
  );

  const moveWithinZone = useCallback(
    (zone: ActivityBarZone, index: number, delta: -1 | 1) => {
      const ids = [...layout[zone]];
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      const moved = ids[index];
      ids[index] = ids[target];
      ids[target] = moved;
      writeLayout({ ...layout, [zone]: ids });
    },
    [layout, writeLayout],
  );

  const hiddenItems = useMemo(
    () => (layout.hidden_items ?? []).filter((id) => id in registry),
    [layout.hidden_items, registry],
  );

  const renderZone = (zone: ActivityBarZone, labelKey: string) => {
    const ids = layout[zone].filter((id) => id in registry);
    return (
      <div
        key={zone}
        className="rounded-md border"
        style={{ borderColor: "var(--df-border)" }}
      >
        <div
          className="px-3 py-1.5 text-xs font-medium border-b"
          style={{
            borderColor: "var(--df-border)",
            color: "var(--df-text-muted)",
          }}
        >
          {t(labelKey)}
        </div>
        {ids.length === 0 ? (
          <div
            className="px-3 py-3 text-xs"
            style={{ color: "var(--df-text-dimmed)" }}
          >
            {t("settings.activityBarEmptyZone")}
          </div>
        ) : (
          ids.map((id, index) => (
            <ActivityBarItemRow
              key={id}
              icon={registry[id].icon}
              label={registry[id].tooltip}
              currentZone={zone}
              canMoveUp={index > 0}
              canMoveDown={index < ids.length - 1}
              onMoveUp={() => moveWithinZone(zone, index, -1)}
              onMoveDown={() => moveWithinZone(zone, index, 1)}
              onMoveToZone={(targetZone) => moveItemToZone(id, targetZone)}
              onHide={() =>
                writeLayout(hideActivityBarItem(layout, id))
              }
            />
          ))
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <SettingSection
        title={t("settings.activityBarSection")}
        desc={t("settings.activityBarSectionDesc")}
        contentClassName="space-y-4"
      >
        <SettingRow
          label={t("settings.activityBarShowLabels")}
          desc={t("settings.activityBarShowLabelsDesc")}
        >
          <SettingSwitch
            checked={layout.show_labels}
            onChange={(v) => writeLayout({ ...layout, show_labels: v })}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.activityBarReset")}
          desc={t("settings.activityBarResetDesc")}
        >
          <Button variant="outline" size="sm" onClick={() => writeLayout(resetActivityBarLayout())}>
            {t("settings.activityBarReset")}
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection
        title={t("settings.activityBarZonesTitle")}
        desc={t("settings.activityBarZonesDesc")}
        contentClassName="space-y-3"
      >
        {ZONE_CONFIGS.map(({ zone, labelKey }) => renderZone(zone, labelKey))}
      </SettingSection>

      <SettingSection
        title={t("settings.activityBarHidden")}
        desc={t("settings.activityBarHiddenDesc")}
        contentClassName="space-y-2"
      >
        {hiddenItems.length === 0 ? (
          <div className="text-xs" style={{ color: "var(--df-text-dimmed)" }}>
            {t("settings.activityBarNoHidden")}
          </div>
        ) : (
          hiddenItems.map((id) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              style={{ borderColor: "var(--df-border)" }}
            >
              <span className="text-base shrink-0">{registry[id].icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {registry[id].tooltip}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  writeLayout(showActivityBarItem(layout, id))
                }
              >
                <MdVisibility className="mr-1 h-3.5 w-3.5" />
                {t("settings.activityBarShowItem")}
              </Button>
            </div>
          ))
        )}
      </SettingSection>
    </div>
  );
}

interface ActivityBarItemRowProps {
  icon: ReactNode;
  label: string;
  currentZone: ActivityBarZone;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToZone: (zone: ActivityBarZone) => void;
  onHide: () => void;
}

function ActivityBarItemRow({
  icon,
  label,
  currentZone,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onMoveToZone,
  onHide,
}: ActivityBarItemRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: "var(--df-border)" }}
    >
      <span className="text-base shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-md"
          disabled={!canMoveUp}
          aria-label={t("settings.activityBarMoveUp")}
          title={t("settings.activityBarMoveUp")}
          onClick={onMoveUp}
        >
          <MdKeyboardArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-md"
          disabled={!canMoveDown}
          aria-label={t("settings.activityBarMoveDown")}
          title={t("settings.activityBarMoveDown")}
          onClick={onMoveDown}
        >
          <MdKeyboardArrowDown className="h-4 w-4" />
        </Button>

        <Select
          value={currentZone}
          onValueChange={(zone) => onMoveToZone(zone as ActivityBarZone)}
        >
          <SelectTrigger className="h-6 w-40 rounded-md text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZONE_CONFIGS.map(({ zone, labelKey }) => (
              <SelectItem key={zone} value={zone}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
          aria-label={t("settings.activityBarHideItem")}
          title={t("settings.activityBarHideItem")}
          onClick={onHide}
        >
          <MdVisibilityOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
