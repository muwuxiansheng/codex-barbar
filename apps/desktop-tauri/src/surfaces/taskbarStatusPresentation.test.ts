import { describe, expect, it, vi } from "vitest";
import type { UseStatusSurfaceResult } from "../hooks/useStatusSurface";
import { buildStatusSurfaceViewModel } from "../lib/statusSurfaceViewModel";
import {
  bootstrapWithTwoProfiles,
  profileUsageFixture,
  readyTwoWindowFixture,
  staleOfflineFixture,
  weeklyOnlyUsage,
} from "../test/profileUsageFixtures";
import { buildTaskbarStatusPresentation } from "./taskbarStatusPresentation";

function surfaceFrom(
  bootstrap = bootstrapWithTwoProfiles(),
): UseStatusSurfaceResult {
  const profile = bootstrap.profiles[0]!;
  const state = bootstrap.usageByProfile.personal!;
  const model = buildStatusSurfaceViewModel({
    profile,
    state,
    displayMode: bootstrap.settings.displayMode,
    language: bootstrap.settings.language,
    nowMs: Date.parse("2026-08-14T00:00:00Z"),
  });

  return {
    ...model,
    bootstrap,
    profile,
    state,
    isDragging: false,
    closeFailedBySurface: {
      taskbarStatus: false,
      floatBall: false,
    },
    setIsDragging: vi.fn(),
    openPanel: vi.fn(async () => {}),
    disableSurface: vi.fn(async () => {}),
    setFloatBallExpanded: vi.fn(async () => {}),
  };
}

function weeklySurface(): UseStatusSurfaceResult {
  const bootstrap = bootstrapWithTwoProfiles();
  bootstrap.profiles[0]!.accountDisplayName = "ProofUser";
  bootstrap.profiles[0]!.presentationName = "ProofUser";
  bootstrap.usageByProfile.personal = weeklyOnlyUsage();
  return surfaceFrom(bootstrap);
}

describe("buildTaskbarStatusPresentation", () => {
  it("derives the weekly proof fields once for visible and measurement routes", () => {
    const presentation = buildTaskbarStatusPresentation(weeklySurface());

    expect(presentation.displayName).toBe("ProofUser");
    expect(presentation.compactIdentity).toBe("ProofU");
    expect(presentation.resetDateText).toBe("8/20");
    expect(presentation.resetCountdownText).toBe("6天");
    expect(presentation.surfaceAlpha).toBe("0.8");
    expect(presentation.ariaLabel).toBe(
      "打开完整面板，ProofUser，W 98%，6天，已更新，8天前",
    );
  });

  it("renders both five-hour and weekly parts when both windows exist", () => {
    const presentation = buildTaskbarStatusPresentation(
      surfaceFrom(readyTwoWindowFixture()),
    );

    expect(presentation.quotaParts.map((part) => part.text)).toEqual([
      "5H 42%",
      "W 61%",
    ]);
    expect(presentation.ariaLabel).toContain("5H 42%，W 61%");
  });

  it("degrades to the weekly part when five-hour data is missing", () => {
    const presentation = buildTaskbarStatusPresentation(weeklySurface());

    expect(presentation.quotaParts.map((part) => part.key)).toEqual(["weekly"]);
    expect(presentation.quotaParts[0]!.text).toBe("W 98%");
    expect(presentation.ariaLabel).not.toContain("5H");
  });

  it("degrades to the five-hour part when weekly data is missing", () => {
    const presentation = buildTaskbarStatusPresentation(
      surfaceFrom(bootstrapWithTwoProfiles()),
    );

    expect(presentation.quotaParts.map((part) => part.key)).toEqual([
      "fiveHour",
    ]);
    expect(presentation.quotaParts[0]!.text).toBe("5H 42%");
    expect(presentation.resetDateText).toBeNull();
    expect(presentation.ariaLabel).not.toContain("W 42%");
  });

  it("falls back to the shared no-quota copy when no windows exist", () => {
    const bootstrap = bootstrapWithTwoProfiles();
    bootstrap.usageByProfile.personal = {
      ...profileUsageFixture("personal"),
      primary: null,
      secondary: null,
      additionalWindows: [],
      freshness: "missing",
    };

    const presentation = buildTaskbarStatusPresentation(surfaceFrom(bootstrap));

    expect(presentation.quotaParts).toEqual([]);
    expect(presentation.ariaLabel).toContain("无可用额度");
  });

  it.each([
    ["remaining", ["5H 42%", "W 61%"]],
    ["used", ["5H 58%", "W 39%"]],
  ] as const)(
    "follows the shared %s display mode without recomputing percentages",
    (displayMode, texts) => {
      const bootstrap = readyTwoWindowFixture();
      bootstrap.settings.displayMode = displayMode;

      const presentation = buildTaskbarStatusPresentation(
        surfaceFrom(bootstrap),
      );

      expect(presentation.quotaParts.map((part) => part.text)).toEqual(texts);
    },
  );

  it("renders the deduped five-hour and weekly windows and drops extras", () => {
    const bootstrap = readyTwoWindowFixture();
    bootstrap.usageByProfile.personal!.primary!.resetsAt =
      "2026-08-21T00:00:00Z";
    bootstrap.usageByProfile.personal!.secondary!.resetsAt =
      "2026-08-20T00:00:00Z";
    bootstrap.usageByProfile.personal!.additionalWindows = [
      {
        limitId: "spark",
        label: "Spark",
        usedPercent: 12,
        remainingPercent: 88,
        windowDurationMinutes: 1_440,
        resetsAt: "2026-08-19T00:00:00Z",
        reachedType: null,
      },
    ];

    const presentation = buildTaskbarStatusPresentation(surfaceFrom(bootstrap));

    expect(presentation.quotaParts.map((part) => part.key)).toEqual([
      "fiveHour",
      "weekly",
    ]);
    expect(presentation.resetDateText).toBe("8/20");
    expect(presentation.ariaLabel).toContain("5H 42%");
    expect(presentation.ariaLabel).toContain("W 61%");
    expect(presentation.ariaLabel).not.toContain("Spark");
  });

  it("announces cached data and update age from the shared model", () => {
    const bootstrap = staleOfflineFixture();
    bootstrap.usageByProfile.personal!.secondary = weeklyOnlyUsage({
      remainingPercent: 42,
      usedPercent: 58,
    }).primary;
    const presentation = buildTaskbarStatusPresentation(surfaceFrom(bootstrap));

    expect(presentation.trustState).toBe("cached");
    expect(presentation.ariaLabel).toContain("缓存数据");
    expect(presentation.ariaLabel).toContain("8天前");
  });

  it.each([
    [-20, "1"],
    [0, "1"],
    [20, "0.8"],
    [80, "0.2"],
    [100, "0"],
    [140, "0"],
  ])("maps taskbar transparency %s to background alpha %s", (opacity, alpha) => {
    const bootstrap = bootstrapWithTwoProfiles();
    bootstrap.settings.taskbarTransparencyPercent = opacity;

    expect(
      buildTaskbarStatusPresentation(surfaceFrom(bootstrap)).surfaceAlpha,
    ).toBe(alpha);
  });

  it("exposes preference-aware fields with default all-visible behavior", () => {
    const presentation = buildTaskbarStatusPresentation(weeklySurface());

    expect(presentation.showIcon).toBe(true);
    expect(presentation.showAccount).toBe(true);
    expect(presentation.showWeeklyLabel).toBe(true);
    expect(presentation.showWeeklyPercent).toBe(true);
    expect(presentation.showResetDate).toBe(true);
    expect(presentation.density).toBe("compact");
    expect(presentation.compactIdentity).toBe("ProofU");
    expect(presentation.quotaParts.map((part) => part.text)).toEqual(["W 98%"]);
    expect(presentation.resetDateText).toBe("8/20");
  });

  it("filters every taskbar field from the shared presentation", () => {
    const bootstrap = bootstrapWithTwoProfiles();
    bootstrap.profiles[0]!.accountDisplayName = "ProofUser";
    bootstrap.profiles[0]!.presentationName = "ProofUser";
    bootstrap.usageByProfile.personal = weeklyOnlyUsage();
    bootstrap.settings.taskbarPresentation = {
      showTaskbarIcon: false,
      showTaskbarAccount: false,
      showWeeklyLabel: false,
      showWeeklyPercent: false,
      showResetDate: false,
      density: "standard",
      hideStatusSurfacesInFullscreen: true,
    };

    const presentation = buildTaskbarStatusPresentation(surfaceFrom(bootstrap));

    expect(presentation.showIcon).toBe(false);
    expect(presentation.showAccount).toBe(false);
    expect(presentation.showWeeklyLabel).toBe(false);
    expect(presentation.showWeeklyPercent).toBe(false);
    expect(presentation.showResetDate).toBe(false);
    expect(presentation.density).toBe("standard");
    expect(presentation.compactIdentity).toBeNull();
    expect(presentation.quotaParts).toEqual([]);
    expect(presentation.resetDateText).toBeNull();
  });

  it("combines the weekly label and percent independently", () => {
    const base = weeklySurface();
    const prefs = base.bootstrap!.settings.taskbarPresentation;
    const withPrefs = (
      overrides: Partial<NonNullable<typeof prefs>>,
    ): UseStatusSurfaceResult => ({
      ...base,
      bootstrap: {
        ...base.bootstrap!,
        settings: {
          ...base.bootstrap!.settings,
          taskbarPresentation: { ...prefs, ...overrides },
        },
      },
    });

    const labelOnly = buildTaskbarStatusPresentation(
      withPrefs({ showWeeklyPercent: false }),
    );
    expect(labelOnly.quotaParts.map((part) => part.text)).toEqual(["W"]);

    const percentOnly = buildTaskbarStatusPresentation(
      withPrefs({ showWeeklyLabel: false }),
    );
    expect(percentOnly.quotaParts.map((part) => part.text)).toEqual(["98%"]);
  });
});
