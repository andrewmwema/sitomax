import { describe, expect, it } from "vitest";
import { dayLabel, relativeLeadTime, untilLabel } from "./format";

const now = new Date(2026, 10, 22, 15, 0, 0).getTime();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

describe("lead times", () => {
  it("shortens recent times and switches to a date after a week", () => {
    expect(relativeLeadTime(at(0.5), now)).toBe("now");
    expect(relativeLeadTime(at(12), now)).toBe("12m");
    expect(relativeLeadTime(at(125), now)).toBe("2h");
    expect(relativeLeadTime(at(3 * 1440 + 5), now)).toBe("3d");
    expect(relativeLeadTime(new Date(2026, 10, 1, 9).toISOString(), now)).toBe("Nov 1");
    expect(relativeLeadTime(new Date(2025, 11, 30, 9).toISOString(), now)).toBe("Dec 30, 2025");
    expect(relativeLeadTime(null, now)).toBe("");
  });

  it("labels thread days by the calendar, not by elapsed hours", () => {
    expect(dayLabel(new Date(2026, 10, 22, 0, 5).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 21, 23, 55).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 20, 12).toISOString(), now)).toBe("Nov 20");
  });

  it("describes when a reminder or snooze is due", () => {
    expect(untilLabel(new Date(now + 3 * 86_400_000).toISOString(), now)).toBe("in 3 days");
    expect(untilLabel(new Date(now + 86_400_000).toISOString(), now)).toBe("tomorrow");
    expect(untilLabel(new Date(now + 5 * 3_600_000).toISOString(), now)).toBe("in 5 hours");
    expect(untilLabel(new Date(now - 1000).toISOString(), now)).toBe("now");
  });
});
