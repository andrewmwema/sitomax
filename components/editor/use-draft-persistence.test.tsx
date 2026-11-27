// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Data } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: { content: [], root: { props: { title: "Team" } } } as Data,
  dispatch: vi.fn(), build: vi.fn(), save: vi.fn(), draftSaved: vi.fn(),
}));
vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => (selector: (value: unknown) => unknown) => selector({ appState: { data: mocks.data } }),
  useGetPuck: () => () => ({ appState: { data: mocks.data }, dispatch: mocks.dispatch }),
}));
vi.mock("@/app/editor/[pageId]/actions", () => ({
  savePageDraft: vi.fn(), publishPage: vi.fn(), restorePageVersion: vi.fn(), saveAiEdit: vi.fn(),
}));
vi.mock("@/app/editor/[pageId]/empty-page-actions", () => ({
  buildEmptyPageWithAi: mocks.build, saveEmptyPageWithAi: mocks.save,
}));

import { useDraftPersistence } from "./use-draft-persistence";
import { publishPage, restorePageVersion, saveAiEdit, savePageDraft } from "@/app/editor/[pageId]/actions";
import { defaultHeader } from "@/lib/header";

const base = { content: [], root: { props: { title: "Team", description: "Keep local SEO." } } };
const generated: Data = { content: [{ type: "Section", props: { id: "generated" } }], root: { props: { title: "Stored title" } } };
const theme = {};
const INITIAL_VERSION = "00000000-0000-4000-8000-000000000001";
const NEXT_VERSION = "00000000-0000-4000-8000-000000000002";
let persistence: ReturnType<typeof useDraftPersistence>;
let root: ReturnType<typeof createRoot>;
function Harness() {
  const value = useDraftPersistence("page", theme, undefined, mocks.draftSaved, INITIAL_VERSION);
  useEffect(() => { persistence = value; }, [value]);
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(savePageDraft).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
  vi.mocked(saveAiEdit).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
  mocks.data = structuredClone(base);
  mocks.build.mockResolvedValue({ status: "success", data: generated, expectedDraft: {}, warnings: ["Review imagery."] });
  mocks.save.mockResolvedValue({ status: "success", version: NEXT_VERSION });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("empty-page persistence", () => {
  it("reports a saved page draft so the editor can update its unpublished indicator", async () => {
    mocks.data = { ...base, root: { props: { ...base.root.props, title: "Edited" } } };
    vi.mocked(savePageDraft).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
    await act(async () => { expect(await persistence.save()).toBe(true); });
    expect(mocks.draftSaved).toHaveBeenCalledWith(mocks.data, "save");
  });

  it("saves pending global header edits before a body-only AI build", async () => {
    const header = defaultHeader("Example");
    const props = { ...base.root.props, __editorHeader: header };
    mocks.data = { ...base, root: { props } };
    vi.mocked(savePageDraft).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
    await act(async () => { expect(await persistence.buildEmptyPage()).toBe(true); });
    expect(savePageDraft).toHaveBeenCalledWith("page", { ...mocks.data, root: { props: { ...props, __expectedHeader: null } } }, INITIAL_VERSION);
    expect(mocks.build).toHaveBeenCalledOnce();
    expect(vi.mocked(savePageDraft).mock.invocationCallOrder[0]).toBeLessThan(mocks.build.mock.invocationCallOrder[0]);
  });
  it("advances the header baseline only after successful saves", async () => {
    const initial = defaultHeader("Initial");
    const changed = defaultHeader("Changed");
    const final = defaultHeader("Final");
    vi.mocked(savePageDraft).mockResolvedValueOnce({ status: "success", message: "Saved.", version: NEXT_VERSION })
      .mockResolvedValueOnce({ status: "error", message: "Retry." })
      .mockResolvedValueOnce({ status: "success", message: "Saved.", version: NEXT_VERSION });
    for (const header of [initial, changed, final]) {
      const props = { ...base.root.props, __editorHeader: header };
      mocks.data = { ...base, root: { props } };
      await act(async () => { await persistence.save(); });
    }
    const calls = vi.mocked(savePageDraft).mock.calls;
    expect(calls[0][1]).toMatchObject({ root: { props: { __expectedHeader: null } } });
    expect(calls[1][1]).toMatchObject({ root: { props: { __expectedHeader: initial } } });
    expect(calls[2][1]).toMatchObject({ root: { props: { __expectedHeader: initial } } });
    expect(calls.map((call) => call[2])).toEqual([INITIAL_VERSION, NEXT_VERSION, NEXT_VERSION]);
  });
  it("saves generated content without losing local root settings and marks only the persisted draft saved", async () => {
    await act(async () => { expect(await persistence.buildEmptyPage()).toBe(true); });
    expect(mocks.save).toHaveBeenCalledWith("page", {
      ...generated, root: { props: { ...base.root.props, generationWarnings: ["Review imagery."] } },
    }, {}, INITIAL_VERSION);
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "setData", recordHistory: true }));
    expect(persistence.buildNotes).toEqual(["Review imagery."]);
    expect(persistence.busy).toBeNull();
  });

  it("does not overwrite edits made while AI was generating", async () => {
    let finish!: (value: unknown) => void;
    mocks.build.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let operation!: Promise<boolean>;
    await act(async () => { operation = persistence.buildEmptyPage(); });
    mocks.data = { ...base, content: [{ type: "Text", props: { id: "local", text: "My new content" } }] };
    await act(async () => {
      finish({ status: "success", data: generated, expectedDraft: {}, warnings: [] });
      expect(await operation).toBe(false);
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(persistence.error).toContain("page changed");
  });

  it("does not replace the local canvas after a server comparison conflict", async () => {
    mocks.save.mockResolvedValue({ status: "error", message: "Another editor changed this page." });
    await act(async () => { expect(await persistence.buildEmptyPage()).toBe(false); });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(persistence.error).toBe("Another editor changed this page.");
  });

  it("retains edits made while the guarded save was in flight", async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let operation!: Promise<boolean>;
    await act(async () => { operation = persistence.buildEmptyPage(); });
    const props = { ...base.root.props, description: "Newer local SEO." };
    mocks.data = { ...base, root: { props } };
    await act(async () => { finish({ status: "success", version: NEXT_VERSION }); expect(await operation).toBe(false); });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(persistence.error).toContain("newer local changes were retained");
  });

  it("blocks nonempty pages and simultaneous builds before spending another AI request", async () => {
    mocks.data = generated;
    await act(async () => { expect(await persistence.buildEmptyPage()).toBe(false); });
    expect(mocks.build).not.toHaveBeenCalled();
    mocks.data = structuredClone(base);
    let finish!: (value: unknown) => void;
    mocks.build.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let operation!: Promise<boolean>;
    await act(async () => {
      operation = persistence.buildEmptyPage();
      expect(await persistence.buildEmptyPage()).toBe(false);
    });
    expect(mocks.build).toHaveBeenCalledOnce();
    await act(async () => { finish({ status: "error", message: "Unavailable" }); await operation; });
  });

  it("adopts a server-written draft as one undoable step and continues from its version and header", async () => {
    const header = defaultHeader("Applied");
    const props = { title: "Team", __editorHeader: header };
    const applied: Data = { content: [{ type: "Hero", props: { id: "ai" } }], root: { props } };
    await act(async () => {
      expect(await persistence.adopt({ data: applied, version: NEXT_VERSION, theme: { style: "modern" }, draftHeader: header })).toBe(true);
    });
    const adopted = mocks.dispatch.mock.calls.find(([action]) => action.type === "setData")![0];
    expect(adopted).toMatchObject({ recordHistory: true, data: { content: applied.content, root: { props: { __editorTheme: { style: "modern" } } } } });
    mocks.data = adopted.data;
    mocks.data = { ...mocks.data, root: { props: { ...mocks.data.root.props, title: "Edited after adoption" } } };
    vi.mocked(savePageDraft).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
    await act(async () => { expect(await persistence.save()).toBe(true); });
    expect(saveAiEdit).not.toHaveBeenCalled();
    expect(savePageDraft).toHaveBeenCalledWith("page",
      expect.objectContaining({ root: { props: expect.objectContaining({ __expectedHeader: header }) } }), NEXT_VERSION);
  });

  async function edit(title: string) {
    mocks.data = { ...mocks.data, root: { props: { ...mocks.data.root.props, title } } };
    await act(async () => root.render(<Harness />));
  }

  describe("bounded autosave", () => {
    it("does not save on load, identity-only renders or reordered keys", async () => {
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      const reordered = { root: { props: { description: "Keep local SEO.", title: "Team" } }, content: [] };
      mocks.data = reordered;
      await act(async () => root.render(<Harness />));
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      await act(async () => { expect(await persistence.save()).toBe(true); });
      expect(savePageDraft).not.toHaveBeenCalled();
      expect(persistence.dirty).toBe(false);
    });

    it("debounces rapid edits and keeps only the latest state behind an in-flight save", async () => {
      let finish!: (value: Awaited<ReturnType<typeof savePageDraft>>) => void;
      vi.mocked(savePageDraft).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      await edit("First");
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      await edit("Second");
      await act(async () => vi.advanceTimersByTimeAsync(1_799));
      expect(savePageDraft).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(savePageDraft).toHaveBeenCalledOnce();
      expect(persistence.busy).toBe("save");
      await edit("Third");
      await edit("Latest");
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(savePageDraft).toHaveBeenCalledOnce();
      await act(async () => { finish({ status: "success", message: "Saved.", version: NEXT_VERSION }); });
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(savePageDraft).toHaveBeenCalledTimes(2);
      expect(vi.mocked(savePageDraft).mock.calls[1][1]).toMatchObject({ root: { props: { title: "Latest" } } });
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(savePageDraft).toHaveBeenCalledTimes(2);
      expect(persistence.dirty).toBe(false);
    });

    it("coalesces simultaneous manual saves into one latest queued save", async () => {
      let finish!: (value: Awaited<ReturnType<typeof savePageDraft>>) => void;
      vi.mocked(savePageDraft).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      await edit("First");
      let first!: Promise<boolean>;
      await act(async () => { first = persistence.save(); });
      await edit("Latest");
      let second!: Promise<boolean>;
      let third!: Promise<boolean>;
      await act(async () => { second = persistence.save(); third = persistence.save(); });
      expect(savePageDraft).toHaveBeenCalledOnce();
      await act(async () => {
        finish({ status: "success", message: "Saved.", version: NEXT_VERSION });
        expect(await first).toBe(true);
        expect(await second).toBe(true);
        expect(await third).toBe(true);
      });
      expect(savePageDraft).toHaveBeenCalledTimes(2);
    });

    it("backs off transient failures and stops after five attempts, even with further edits", async () => {
      vi.mocked(savePageDraft).mockResolvedValue({ status: "error", message: "Couldn't save.", retryable: true });
      await edit("Edited");
      await act(async () => vi.advanceTimersByTimeAsync(1_800));
      expect(savePageDraft).toHaveBeenCalledOnce();
      for (const [index, delay] of [2_000, 4_000, 8_000, 16_000].entries()) {
        await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
        expect(savePageDraft).toHaveBeenCalledTimes(index + 1);
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(savePageDraft).toHaveBeenCalledTimes(index + 2);
      }
      await edit("Still unsaved");
      await act(async () => vi.advanceTimersByTimeAsync(600_000));
      expect(savePageDraft).toHaveBeenCalledTimes(5);
      expect(persistence.error).toBe("Couldn't save.");
      expect(persistence.dirty).toBe(true);
      vi.mocked(savePageDraft).mockResolvedValue({ status: "success", message: "Saved.", version: NEXT_VERSION });
      await act(async () => { expect(await persistence.save()).toBe(true); });
      expect(savePageDraft).toHaveBeenCalledTimes(6);
      expect(persistence.error).toBeNull();
    });

    it("does not automatically retry validation or permission failures", async () => {
      vi.mocked(savePageDraft).mockResolvedValue({ status: "error", message: "Invalid page data." });
      await edit("Invalid");
      await act(async () => vi.advanceTimersByTimeAsync(1_800));
      await act(async () => vi.advanceTimersByTimeAsync(600_000));
      expect(savePageDraft).toHaveBeenCalledOnce();
    });

    it("pauses after five hidden minutes and flushes once with keepalive on return", async () => {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await act(async () => document.dispatchEvent(new Event("visibilitychange")));
      await act(async () => vi.advanceTimersByTimeAsync(300_001));
      await edit("While hidden");
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(savePageDraft).not.toHaveBeenCalled();
      const fetch = vi.fn().mockResolvedValue(Response.json({ status: "success", message: "Saved.", version: NEXT_VERSION }));
      vi.stubGlobal("fetch", fetch);
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      await act(async () => document.dispatchEvent(new Event("visibilitychange")));
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledWith("/api/editor/draft", expect.objectContaining({ method: "POST", keepalive: true }));
      await act(async () => window.dispatchEvent(new Event("pagehide")));
      expect(fetch).toHaveBeenCalledOnce();
      expect(persistence.dirty).toBe(false);
      vi.restoreAllMocks();
    });
    it("flushes a paused dirty tab on unload without duplicating the in-flight request", async () => {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await act(async () => document.dispatchEvent(new Event("visibilitychange")));
      await act(async () => vi.advanceTimersByTimeAsync(300_001));
      await edit("Closing hidden tab");
      let finish!: (response: Response) => void;
      const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
      vi.stubGlobal("fetch", fetch);
      await act(async () => window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
      await act(async () => window.dispatchEvent(new Event("pagehide")));
      expect(fetch).toHaveBeenCalledOnce();
      await act(async () => { finish(Response.json({ status: "success", message: "Saved.", version: NEXT_VERSION })); });
      expect(persistence.dirty).toBe(false);
      vi.restoreAllMocks();
    });
  });

  it("refuses to adopt a server-written draft over unsaved local edits", async () => {
    mocks.data = { ...base, content: [{ type: "Text", props: { id: "local" } }] };
    await act(async () => {
      expect(await persistence.adopt({ data: generated, version: NEXT_VERSION, theme, draftHeader: null })).toBe(false);
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(persistence.reloadRequired).toBe(true);
  });

  it("blocks all later saves after a conflict without replacing local content", async () => {
    mocks.data = { ...base, root: { props: { title: "Keep my unsaved changes" } } };
    vi.mocked(savePageDraft).mockResolvedValueOnce({ status: "error", conflict: true, message: "This page changed. Reload before saving." });
    await act(async () => { expect(await persistence.save()).toBe(false); });
    expect(persistence.reloadRequired).toBe(true);
    await act(async () => {
      expect(await persistence.save()).toBe(false);
      expect(await persistence.restore("version")).toBe(false);
      expect(await persistence.buildEmptyPage()).toBe(false);
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(savePageDraft).toHaveBeenCalledOnce();
    expect(persistence.dirty).toBe(true);
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(persistence.error).toContain("Reload");
  });

  it("carries successful replacement versions through AI edits, history restoration and publishing", async () => {
    const restoredVersion = "00000000-0000-4000-8000-000000000003";
    vi.mocked(saveAiEdit).mockResolvedValueOnce({ status: "success", message: "Saved", version: NEXT_VERSION });
    vi.mocked(restorePageVersion).mockResolvedValueOnce({
      status: "success", message: "Restored", version: restoredVersion, data: base, theme: undefined,
    });
    vi.mocked(publishPage).mockResolvedValueOnce({ status: "success", message: "Published", version: INITIAL_VERSION });
    await act(async () => { expect(await persistence.applyAi(base, base)).toBe(true); });
    expect(saveAiEdit).toHaveBeenCalledWith("page", base, { snapshot: true }, INITIAL_VERSION);
    await act(async () => { expect(await persistence.restore("history")).toBe(true); });
    expect(restorePageVersion).toHaveBeenCalledWith("page", "history", NEXT_VERSION);
    await act(async () => { expect(await persistence.save("publish")).toBe(true); });
    expect(publishPage).toHaveBeenCalledWith("page", base, restoredVersion);
  });
});
