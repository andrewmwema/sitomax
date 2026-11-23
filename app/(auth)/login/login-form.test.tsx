// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ signInWithPassword: vi.fn() }));
vi.mock("next/link", () => ({ default: () => null }));
import { LoginForm } from "./login-form";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const path = "/dashboard/leads/00000000-0000-4000-8000-000000000003";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/login#reply");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

it("preserves reply intent through login without changing unrelated destinations", async () => {
  await act(async () => root.render(<LoginForm next={path} />));
  expect(container.querySelector<HTMLInputElement>('[name="next"]')?.value).toBe(`${path}#reply`);
  await act(async () => root.render(<LoginForm next="/dashboard" />));
  expect(container.querySelector<HTMLInputElement>('[name="next"]')?.value).toBe("/dashboard");
  await act(async () => root.render(<LoginForm next={`${path}#reply`} />));
  expect(container.querySelector<HTMLInputElement>('[name="next"]')?.value).toBe(`${path}#reply`);
});

it("leaves a plain conversation link unchanged when no reply was requested", async () => {
  window.history.replaceState(null, "", "/login");
  await act(async () => root.render(<LoginForm next={path} />));
  expect(container.querySelector<HTMLInputElement>('[name="next"]')?.value).toBe(path);
});
