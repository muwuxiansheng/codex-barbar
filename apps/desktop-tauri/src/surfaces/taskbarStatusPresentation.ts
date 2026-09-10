import type { UseStatusSurfaceResult } from "../hooks/useStatusSurface";
import type {
  QuotaBand,
  StatusQuotaMetric,
  TrustState,
} from "../lib/statusSurfaceViewModel";
import { surfaceAlphaFromTransparency } from "../lib/surfaceTransparency";

const FIVE_HOUR_LABEL = "5H";
const WEEKLY_LABEL = "W";
const NO_QUOTA_TEXT = "无可用额度";

export interface TaskbarQuotaPart {
  key: "fiveHour" | "weekly";
  text: string;
  band: QuotaBand;
}

export interface TaskbarStatusPresentation {
  displayName: string;
  compactIdentity: string | null;
  avatarKind: "default" | "official" | "manual";
  avatarAssetUri: string | null;
  showIcon: boolean;
  showAccount: boolean;
  showWeeklyLabel: boolean;
  showWeeklyPercent: boolean;
  showResetDate: boolean;
  density: "compact" | "standard";
  quotaParts: readonly TaskbarQuotaPart[];
  resetDateText: string | null;
  resetCountdownText: string | null;
  trustState: TrustState;
  ariaLabel: string;
  surfaceAlpha: string;
}

export function compactTaskbarMetric(metric: StatusQuotaMetric): string {
  return `${metric.shortLabel} ${metric.displayedPercent}%`;
}

function quotaPart(
  metric: StatusQuotaMetric,
  key: TaskbarQuotaPart["key"],
  label: string,
  showLabel: boolean,
  showPercent: boolean,
): TaskbarQuotaPart | null {
  const parts: string[] = [];
  if (showLabel) parts.push(label);
  if (showPercent) parts.push(`${metric.displayedPercent}%`);
  return parts.length > 0 ? { key, text: parts.join(" "), band: metric.band } : null;
}

function resetDateText(metric: StatusQuotaMetric | null): string | null {
  if (!metric?.resetsAt) return null;
  const date = new Date(metric.resetsAt);
  return Number.isNaN(date.valueOf())
    ? null
    : `${date.getMonth() + 1}/${date.getDate()}`;
}

export function buildTaskbarStatusPresentation(
  surface: UseStatusSurfaceResult,
): TaskbarStatusPresentation {
  const prefs = surface.bootstrap?.settings.taskbarPresentation;
  const showIcon = prefs?.showTaskbarIcon ?? true;
  const showAccount = prefs?.showTaskbarAccount ?? true;
  const showWeeklyLabel = prefs?.showWeeklyLabel ?? true;
  const showWeeklyPercent = prefs?.showWeeklyPercent ?? true;
  const showResetDate = prefs?.showResetDate ?? true;
  const density = prefs?.density ?? "compact";
  // The taskbar pins its own short labels (5H / W) so the tray and panel keep
  // their localized wording; percentages come from the shared view model and
  // already follow the global displayMode.
  const fiveHourPart = surface.primaryMetric
    ? quotaPart(surface.primaryMetric, "fiveHour", FIVE_HOUR_LABEL, true, true)
    : null;
  const weeklyPart = surface.secondaryMetric
    ? quotaPart(
        surface.secondaryMetric,
        "weekly",
        WEEKLY_LABEL,
        showWeeklyLabel,
        showWeeklyPercent,
      )
    : null;
  const quotaParts = [fiveHourPart, weeklyPart].filter(
    (part): part is TaskbarQuotaPart => part !== null,
  );
  const reset = surface.secondaryMetric;
  const resetDate = showResetDate ? resetDateText(reset) : null;
  const metricsText =
    quotaParts.map((part) => part.text).join("，") ||
    (surface.universalMetric ? compactTaskbarMetric(surface.universalMetric) : "") ||
    NO_QUOTA_TEXT;
  const trustText =
    surface.trustState === "cached" ? "缓存数据" : surface.refreshStatus;
  const ariaLabel = [
    "打开完整面板",
    surface.displayName,
    metricsText,
    reset?.resetText,
    trustText,
    surface.updatedText,
  ]
    .filter(Boolean)
    .join("，");

  return {
    displayName: surface.displayName,
    compactIdentity: showAccount ? surface.compactIdentity : null,
    avatarKind: surface.avatarKind,
    avatarAssetUri: surface.avatarAssetUri,
    showIcon,
    showAccount,
    showWeeklyLabel,
    showWeeklyPercent,
    showResetDate,
    density,
    quotaParts,
    resetDateText: resetDate,
    resetCountdownText: reset?.resetText ?? null,
    trustState: surface.trustState,
    ariaLabel,
    surfaceAlpha: String(
      surfaceAlphaFromTransparency(
        surface.bootstrap?.settings.taskbarTransparencyPercent ?? 20,
      ),
    ),
  };
}
