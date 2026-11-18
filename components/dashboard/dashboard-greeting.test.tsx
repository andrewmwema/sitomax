// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardGreeting } from "./dashboard-greeting";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser-local dashboard greeting", () => {
  it.each([[11, "morning"], [12, "afternoon"], [17, "afternoon"], [18, "evening"], [23, "evening"]])(
    "uses the browser's local hour at %i",
    async (hour, greeting) => {
      vi.setSystemTime(new Date(2026, 10, 17, hour, 30));
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<DashboardGreeting displayName="Alex" />));
      expect(container.querySelector("h1")?.textContent).toBe(`Good ${greeting}, Alex`);
      expect(container.querySelector(".platform-eyebrow")?.textContent).toBe("Tuesday, November 17");
      await act(async () => root.unmount());
    },
  );

  it("hydrates a neutral server greeting and refreshes across local midnight", async () => {
    vi.setSystemTime(new Date(2026, 10, 17, 23, 59, 30));
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DashboardGreeting displayName="Alex" />);
    expect(container.textContent).toContain("Welcome, Alex");
    expect(container.textContent).not.toContain("November");
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <DashboardGreeting displayName="Alex" />, { onRecoverableError });
    });
    expect(container.textContent).toContain("Good evening, Alex");
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toContain("Good morning, Alex");
    expect(container.textContent).toContain("Wednesday, November 18");
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
