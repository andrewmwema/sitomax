// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: function MockScript({ onReady }: { onReady: () => void }) {
    useEffect(() => { onReady(); }, [onReady]);
    return null;
  },
}));
import { Turnstile } from "./turnstile";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete window.turnstile; });

it("clears expired tokens, resets failed attempts and removes its widget", async () => {
  const callback = vi.fn();
  const render = vi.fn().mockReturnValue("widget");
  const reset = vi.fn();
  const remove = vi.fn();
  window.turnstile = { render, reset, remove };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Turnstile onToken={callback} resetKey={0} />));
  const options = render.mock.calls[0][1];
  await act(async () => options.callback("token"));
  expect(callback).toHaveBeenLastCalledWith("token");
  await act(async () => options["expired-callback"]());
  expect(callback).toHaveBeenLastCalledWith("");
  await act(async () => root.render(<Turnstile onToken={callback} resetKey={1} />));
  expect(reset).toHaveBeenCalledWith("widget");
  await act(async () => root.unmount());
  expect(remove).toHaveBeenCalledWith("widget");
});
