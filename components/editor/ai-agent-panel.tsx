"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGetPuck } from "@puckeditor/core";
import { Check, ChevronDown, LoaderCircle, MessageSquarePlus, Pencil, Sparkles, Square, Trash2, X } from "lucide-react";
import { applyAgentChanges } from "@/app/editor/[pageId]/agent-actions";
import { appliedChangesSchema, type AppliedAgentChanges } from "@/lib/ai/agent-apply-types";
import { unfinishedStepSchema, type UnfinishedStep } from "@/lib/ai/agent-plan";
import { agentReviewPayloadSchema, type AgentReviewPayload } from "@/lib/ai/agent-review";
import { agentRunUsageSchema, describeAgentUsage, type AgentRunUsage } from "@/lib/ai/agent-usage";
import { useInteractions } from "./interaction-context";
import { ROOT_ZONE } from "@/lib/editor/tree";
import { AgentReviewCanvas, AgentReviewCard, newAgentReview, type AgentReviewState } from "./agent-review-card";
import { AgentAppliedCard, applyToast, undoAgentApply, type AgentApplyReport } from "./agent-applied-card";
import {
  PanelContext, useAiAgentPanel, type AgentEditorBridge, type AgentRequest, type ReviewSession,
} from "./ai-agent-context";

type SectionContext = { id: string; label: string; pageId: string };
type InsertContext = { position: number; pageId: string };
type ReviewSelection = Pick<AgentReviewState, "decisions" | "activeChangeId" | "comparison">;
type Composer = {
  prompt: string; setPrompt: (value: string) => void;
  contexts: string[]; setContexts: (update: (previous: string[]) => string[]) => void;
  section: SectionContext | null;
  insert: InsertContext | null; clearInsert: () => void;
};

/** The canvas shows the pending changeset while it is under review. */
export function AgentCanvas({ children, pageId }: { children: React.ReactNode; pageId: string }) {
  const { reviewSession, editor } = useAiAgentPanel();
  return reviewSession
    ? <AgentReviewCanvas review={reviewSession.review} pageId={pageId} metadata={editor.previewMetadata} />
    : children;
}

/** A short confirmation that stays visible above the canvas, the chat and any open dialog. */
function AgentToast({ toast }: { toast: { id: number; message: string } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    // The top layer keeps it above a modal dialog such as History; without it the message shows in place.
    if (!toast || !element || typeof element.showPopover !== "function") return;
    element.showPopover();
    return () => { if (element.isConnected && element.matches(":popover-open")) element.hidePopover(); };
  }, [toast]);
  return <div ref={ref} popover="manual" role="status" aria-live="polite" data-agent-toast
    className="pointer-events-none fixed bottom-6 left-1/2 right-auto top-auto z-[200] m-0 -translate-x-1/2 overflow-visible border-0 bg-transparent p-0">
    {toast ? <p key={toast.id} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
      <Check size={15} className="shrink-0 text-green-400" />{toast.message}
    </p> : null}
  </div>;
}

export function AiAgentPanelProvider({ children, siteId, pageId, editor }: {
  children: React.ReactNode; siteId: string; pageId: string; editor: AgentEditorBridge;
}) {
  const getPuck = useGetPuck();
  const { pages } = useInteractions();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastCount = useRef(0);
  const notify = useCallback((message: string) => setToast({ id: ++toastCount.current, message }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const [section, setSection] = useState<SectionContext | null>(null);
  const [insert, setInsert] = useState<InsertContext | null>(null);
  const [prompt, setPrompt] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [focusRequest, setFocusRequest] = useState(0);
  const [reviewSession, setReviewSessionState] = useState<ReviewSession | null>(null);
  const reviewCache = useRef(new Map<string, ReviewSelection>());
  const setReviewSession = useCallback((next: ReviewSession | null) => {
    if (next) {
      const previous = reviewCache.current.get(next.threadId);
      if (previous) {
        const ids = new Set(next.review.changes.map((change) => change.id));
        next = {
          ...next,
          review: {
            ...next.review,
            decisions: { ...previous.decisions, ...next.review.decisions },
            activeChangeId: next.review.activeChangeId && ids.has(next.review.activeChangeId)
              ? next.review.activeChangeId
              : previous.activeChangeId && ids.has(previous.activeChangeId) ? previous.activeChangeId : null,
            comparison: next.review.activeChangeId ? next.review.comparison : previous.comparison,
          },
        };
      }
      reviewCache.current.set(next.threadId, {
        decisions: next.review.decisions,
        activeChangeId: next.review.activeChangeId,
        comparison: next.review.comparison,
      });
    }
    setReviewSessionState(next);
  }, []);

  const sectionContext = useCallback((sectionId?: string): SectionContext | null => {
    const { appState, selectedItem, config, getPermissions } = getPuck();
    const selector = appState.ui.itemSelector;
    const selected = sectionId ? appState.data.content.find((item) => item.props.id === sectionId)
      : selector && (!selector.zone || selector.zone === ROOT_ZONE) && selectedItem
        && appState.data.content[selector.index]?.props.id === selectedItem.props.id
        ? appState.data.content[selector.index] : undefined;
    if (!selected || selected.type === "Embed" || getPermissions({ item: selected }).edit === false) return null;
    return { id: String(selected.props.id), label: config.components[selected.type]?.label ?? selected.type, pageId };
  }, [getPuck, pageId]);

  const show = useCallback((request: AgentRequest) => {
    const { appState, dispatch } = getPuck();
    const target = request.header || request.insertAt !== undefined ? null : sectionContext(request.sectionId);
    setSection(target);
    setContexts([...(target ? ["section"] : []), ...(request.header ? ["header"] : [])]);
    // The agent counts positions among editable sections; the header and footer stay fixed.
    setInsert(request.insertAt === undefined ? null : {
      pageId, position: appState.data.content.slice(0, request.insertAt)
        .filter((item) => item.type !== "Footer" && item.type !== "Navigation").length,
    });
    // A request without its own prompt keeps whatever the user had started typing.
    if (request.prompt !== undefined) setPrompt(request.prompt);
    setFocusRequest((value) => value + 1);
    dispatch({ type: "setUi", ui: { rightSideBarVisible: false } });
    setOpen(true);
  }, [getPuck, pageId, sectionContext]);
  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else show({});
  }, [open, show]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      // Ctrl/Cmd+K was the old Ask AI shortcut and now opens the same agent.
      if (event.defaultPrevented || (!event.metaKey && !event.ctrlKey) || !["j", "k"].includes(event.key.toLowerCase())) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", shortcut);
    let frameDoc: Document | null = null;
    const attach = () => {
      const current = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument ?? null;
      if (frameDoc === current) return;
      frameDoc?.removeEventListener("keydown", shortcut);
      frameDoc = current;
      frameDoc?.addEventListener("keydown", shortcut);
    };
    attach();
    const timer = setInterval(attach, 500);
    return () => {
      clearInterval(timer);
      document.removeEventListener("keydown", shortcut);
      frameDoc?.removeEventListener("keydown", shortcut);
    };
  }, [toggle]);

  const composer: Composer = {
    prompt, setPrompt, contexts, setContexts, section, insert, clearInsert: () => setInsert(null),
  };
  return <PanelContext.Provider value={{ open, toggle, openWith: show, reviewSession, setReviewSession, editor, notify }}>
    {children}
    {open ? <AiAgentPanel siteId={siteId} pageId={pageId} pages={pages} composer={composer} focusRequest={focusRequest}
      reviewSession={reviewSession} setReviewSession={setReviewSession} editor={editor} notify={notify}
      onClose={() => setOpen(false)} /> : null}
    <AgentToast toast={toast} />
  </PanelContext.Provider>;
}

type Page = { id: string; slug: string; title: string | null; nav_label?: string | null };
type Thread = { id: string; title: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; streaming?: boolean };
type Step = { callId: string; label: string; status: "running" | "done" | "error" | "waiting"; error?: string };
type Pending =
  | { kind: "plan"; steps: string[]; rationale?: string }
  | { kind: "question"; question: string; options: string[] }
  | { kind: "credit"; message: string; credits: number };
type Run = { id: string; status: string };
/** What a run did not get to, and why it stopped if it can be continued. */
type Unfinished = { steps: UnfinishedStep[]; reason: string | null };
type LatestRun = Run & {
  awaiting?: { kind: string; payload: Record<string, unknown> } | null;
  review: AgentReviewPayload | null;
  applied: AppliedAgentChanges | null;
  usage: AgentRunUsage | null;
  unfinished: Unfinished;
};
type ThreadResponse = {
  threads: Thread[];
  messages: Message[];
  latestRun: LatestRun | null;
};

const suggestedPrompts = [
  "Make the site feel more premium",
  "Write a fuller About page",
  "Use our brand colors",
  "Improve SEO on every page",
  "Add an FAQ to Pricing",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEvent(line: string): Record<string, unknown> | null {
  if (!line.startsWith("data:")) return null;
  try {
    const event: unknown = JSON.parse(line.slice(5).trim());
    return isRecord(event) && typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
}

function unfinishedWork(steps: unknown, reason: unknown): Unfinished {
  return {
    steps: Array.isArray(steps) ? steps.flatMap((step) => unfinishedStepSchema.safeParse(step).data ?? []) : [],
    reason: typeof reason === "string" && reason ? reason : null,
  };
}

function responseMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === "string" ? payload.message : "The request could not be completed.";
}

function threadRunResponse(value: unknown): ThreadResponse | null {
  if (!isRecord(value) || !Array.isArray(value.threads) || !Array.isArray(value.messages)) return null;
  const threads = value.threads.filter((item): item is Thread =>
    isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.updated_at === "string");
  const messages = value.messages.filter((item): item is Message =>
    isRecord(item) && typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant") && typeof item.content === "string");
  const rawRun = value.latestRun;
  const latestRun = isRecord(rawRun) && typeof rawRun.id === "string" && typeof rawRun.status === "string"
    ? {
      id: rawRun.id,
      status: rawRun.status,
      ...(isRecord(rawRun.awaiting) && typeof rawRun.awaiting.kind === "string" && isRecord(rawRun.awaiting.payload)
        ? { awaiting: { kind: rawRun.awaiting.kind, payload: rawRun.awaiting.payload } } : {}),
      review: agentReviewPayloadSchema.safeParse(rawRun.review).data ?? null,
      applied: appliedChangesSchema.safeParse(rawRun.applied).data ?? null,
      usage: agentRunUsageSchema.safeParse(rawRun.usage).data ?? null,
      unfinished: unfinishedWork(rawRun.unfinished, rawRun.pauseReason),
    }
    : null;
  return { threads, messages, latestRun };
}

function makePending(latestRun: ThreadResponse["latestRun"]): Pending | null {
  if (!latestRun?.awaiting) return null;
  if (latestRun.awaiting.kind === "plan") {
    const { steps, rationale } = latestRun.awaiting.payload;
    if (Array.isArray(steps)) return {
      kind: "plan", steps: steps.filter((step): step is string => typeof step === "string"),
      ...(typeof rationale === "string" ? { rationale } : {}),
    };
  }
  if (latestRun.awaiting.kind === "question") {
    const { question, options } = latestRun.awaiting.payload;
    if (typeof question === "string") return {
      kind: "question", question,
      options: Array.isArray(options) ? options.filter((option): option is string => typeof option === "string") : [],
    };
  }
  if (latestRun.awaiting.kind === "credit") return {
    kind: "credit", message: "This run needs 3 credits to continue.", credits: 3,
  };
  return null;
}

function toolLabel(name: unknown, rawInput: unknown, pages: Page[]) {
  const input = isRecord(rawInput) ? rawInput : {};
  const page = pages.find((item) => item.id === input.pageId);
  const pageName = page?.title?.trim() || (page?.slug ? page.slug.replaceAll("/", " / ") : "Home");
  switch (name) {
    case "get_site_overview": return "Reading the site overview";
    case "get_page": return `Reading ${pageName}`;
    case "search_site": return "Searching site content";
    case "list_section_designs": return "Checking section designs";
    case "update_theme": return "Updating the site theme";
    case "update_header": return "Updating the header";
    case "update_footer": return "Updating the footer on every page";
    case "report_progress": return "Checking off the plan";
    case "insert_section": return `Adding a section to ${pageName}`;
    case "create_page": return `Creating ${String(input.title ?? "a page")}`;
    case "update_page_settings": return `Updating ${pageName} settings`;
    case "get_blog_posts":
    case "get_post":
    case "create_blog_post_draft":
    case "update_blog_post_draft": return "Working on blog content";
    case "set_image": return `Choosing an image for ${pageName}`;
    case "plan": return "Preparing a plan";
    case "ask_user": return "Asking for your input";
    default: return page ? `Updating ${pageName}` : `Working on ${String(name ?? "the site")}`;
  }
}

function AiAgentPanel({ siteId, pageId, pages, composer, focusRequest, reviewSession, setReviewSession, editor, notify, onClose }: {
  siteId: string; pageId: string; pages: Page[]; composer: Composer; focusRequest: number;
  reviewSession: ReviewSession | null; setReviewSession: (value: ReviewSession | null) => void;
  editor: AgentEditorBridge; notify: (message: string) => void; onClose: () => void;
}) {
  const { prompt, setPrompt, contexts, setContexts, section, insert, clearInsert } = composer;
  const router = useRouter();
  const homePage = pages.find((page) => page.slug === "");
  const currentPage = pages.find((page) => page.id === pageId);
  const [width, setWidth] = useState(420);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [planChange, setPlanChange] = useState("");
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [error, setError] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedAgentChanges | null>(null);
  const [applyReport, setApplyReport] = useState<AgentApplyReport | null>(null);
  const [working, setWorking] = useState<"apply" | "undo" | null>(null);
  const [usage, setUsage] = useState<AgentRunUsage | null>(null);
  const [unfinished, setUnfinished] = useState<Unfinished | null>(null);
  const threadIdRef = useRef<string | null>(threadId);
  const controller = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);
  const responseHasText = useRef(false);
  const promptField = useRef<HTMLTextAreaElement>(null);

  const updateSteps = useCallback((callId: string, value: Partial<Step> & Pick<Step, "label">) => {
    setSteps((previous) => {
      const index = previous.findIndex((step) => step.callId === callId);
      if (index < 0) return [...previous, { callId, status: "running", ...value }];
      const next = [...previous];
      next[index] = { ...next[index], ...value };
      return next;
    });
  }, []);

  const loadThread = useCallback(async (nextThreadId: string | null) => {
    const sequence = ++loadSequence.current;
    setThreadId(nextThreadId);
    threadIdRef.current = nextThreadId;
    setReviewSession(null);
    setApplied(null);
    setApplyReport(null);
    setUsage(null);
    setUnfinished(null);
    setError("");
    setPending(null);
    setRun(null);
    setSteps([]);
    if (!nextThreadId) {
      setMessages([]);
      return;
    }
    try {
      const query = new URLSearchParams({ siteId, threadId: nextThreadId });
      const response = await fetch(`/api/ai/agent/threads?${query}`);
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload));
      const data = threadRunResponse(payload);
      if (!data) throw new Error("Could not read this AI conversation.");
      if (sequence !== loadSequence.current) return;
      setThreads(data.threads);
      setMessages(data.messages);
      setRun(data.latestRun);
      setPending(makePending(data.latestRun));
      setApplied(data.latestRun?.applied ?? null);
      setUsage(data.latestRun?.usage ?? null);
      setUnfinished(data.latestRun?.unfinished ?? null);
      setReviewSession(data.latestRun?.review?.changes.length
        ? { threadId: nextThreadId, review: newAgentReview(data.latestRun.review) } : null);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : "Could not load this AI conversation.");
    }
  }, [setReviewSession, siteId]);

  const fetchThreads = useCallback(async () => {
    const response = await fetch(`/api/ai/agent/threads?siteId=${encodeURIComponent(siteId)}`);
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(responseMessage(payload));
    const data = threadRunResponse(payload);
    if (!data) throw new Error("Could not read AI conversations.");
    return data.threads;
  }, [siteId]);
  const refreshThreads = useCallback(async () => {
    setThreads(await fetchThreads());
  }, [fetchThreads]);

  useEffect(() => {
    let active = true;
    void fetchThreads().then((items) => {
      if (active) setThreads(items);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load AI conversations.");
    });
    return () => { active = false; };
  }, [fetchThreads]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    const field = promptField.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [focusRequest]);

  function addAssistantText(text: string) {
    setMessages((previous) => {
      const last = previous.at(-1);
      if (last?.role === "assistant" && last.streaming) {
        return [...previous.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...previous, { id: crypto.randomUUID(), role: "assistant", content: text, streaming: true }];
    });
  }

  async function handleEvent(event: Record<string, unknown>) {
    if (event.type === "run" && typeof event.threadId === "string" && typeof event.runId === "string") {
      setThreadId(event.threadId);
      threadIdRef.current = event.threadId;
      if (reviewSession?.threadId !== event.threadId) setReviewSession(null);
      setApplied(null);
      setApplyReport(null);
      setUsage(null);
      setUnfinished(null);
      setRun({ id: event.runId, status: "running" });
      setPending(null);
      try { await refreshThreads(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh AI conversations."); }
    } else if (event.type === "text" && typeof event.text === "string") {
      responseHasText.current = true;
      addAssistantText(event.text);
    } else if (event.type === "step" && typeof event.callId === "string") {
      updateSteps(event.callId, { label: toolLabel(event.name, event.input, pages), status: "running" });
    } else if (event.type === "tool" && typeof event.callId === "string") {
      updateSteps(event.callId, { label: toolLabel(event.name, event.input, pages), status: "done" });
    } else if (event.type === "tool_error" && typeof event.callId === "string") {
      updateSteps(event.callId, {
        label: toolLabel(event.name, event.input, pages), status: "error",
        ...(typeof event.message === "string" ? { error: event.message } : {}),
      });
    } else if (event.type === "plan" && typeof event.callId === "string") {
      const steps = Array.isArray(event.steps) ? event.steps.filter((step): step is string => typeof step === "string") : [];
      setPending({ kind: "plan", steps, ...(typeof event.rationale === "string" ? { rationale: event.rationale } : {}) });
      updateSteps(event.callId, { label: "Plan ready for your approval", status: "waiting" });
    } else if (event.type === "question" && typeof event.callId === "string" && typeof event.question === "string") {
      setPending({
        kind: "question", question: event.question,
        options: Array.isArray(event.options) ? event.options.filter((option): option is string => typeof option === "string") : [],
      });
      updateSteps(event.callId, { label: "Waiting for your answer", status: "waiting" });
    } else if (event.type === "credit_confirmation" && typeof event.callId === "string") {
      setPending({
        kind: "credit", message: typeof event.message === "string" ? event.message : "This run needs 3 credits to continue.",
        credits: typeof event.credits === "number" ? event.credits : 3,
      });
      updateSteps(event.callId, { label: "Waiting for credit approval", status: "waiting" });
    } else if (event.type === "error") {
      setError(typeof event.message === "string" ? event.message : "The agent could not complete this request.");
    } else if (event.type === "done" || event.type === "paused" ||
      event.type === "awaiting_approval" || event.type === "awaiting_input") {
      setStreaming(false);
      setRun((previous) => previous ? {
        ...previous,
        status: typeof event.status === "string" ? event.status : event.type === "done" ? "completed" : event.type as string,
      } : previous);
      if (event.type === "done" || event.type === "paused") {
        setUnfinished(unfinishedWork(event.unfinished, event.type === "paused" ? event.summary : null));
      }
      if (event.type === "done") {
        if (!responseHasText.current && typeof event.summary === "string" && event.summary) {
          addAssistantText(event.summary);
        }
        const parsedReview = agentReviewPayloadSchema.safeParse(event.review);
        const activeThreadId = typeof event.threadId === "string" ? event.threadId : threadIdRef.current;
        if (activeThreadId && parsedReview.success && parsedReview.data.changes.length) {
          setReviewSession({ threadId: activeThreadId, review: newAgentReview(parsedReview.data) });
        } else setReviewSession(null);
        setUsage(agentRunUsageSchema.safeParse(event.usage).data ?? null);
        setPending(null);
        try { await refreshThreads(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh AI conversations."); }
      }
    }
  }

  async function streamRequest(body: Record<string, unknown>) {
    const activeController = new AbortController();
    controller.current = activeController;
    responseHasText.current = false;
    setStreaming(true);
    setError("");
    try {
      const response = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: activeController.signal,
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        throw new Error(responseMessage(payload));
      }
      if (!response.body) throw new Error("The agent did not return a response stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const eventLine = frame.split(/\r?\n/).find((line) => line.startsWith("data:"));
          const event = eventLine ? parseEvent(eventLine) : null;
          if (event) await handleEvent(event);
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const eventLine = buffer.split(/\r?\n/).find((line) => line.startsWith("data:"));
        const event = eventLine ? parseEvent(eventLine) : null;
        if (event) await handleEvent(event);
      }
    } catch (cause) {
      if (!activeController.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "The agent could not complete this request.");
      }
    } finally {
      if (controller.current === activeController) controller.current = null;
      setStreaming(false);
      setMessages((previous) => previous.map((message) => message.streaming ? { ...message, streaming: false } : message));
      const stoppedThreadId = threadIdRef.current;
      if (activeController.signal.aborted && stoppedThreadId) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await loadThread(stoppedThreadId);
      }
    }
  }

  function contextualPrompt(value: string) {
    // The agent addresses a section by its page and its id together.
    const selected = contexts.includes("section") && section
      ? `selected section "${section.label}" (pageId ${section.pageId}, sectionId ${section.id})`
      : null;
    const context = [
      contexts.includes("home") && homePage ? `Home page (pageId ${homePage.id})` : null,
      contexts.includes("header") ? "the global site header" : null,
      selected,
    ].filter(Boolean);
    const focused = context.length ? `${value}\n\nFocus on this context: ${context.join("; ")}.` : value;
    return insert
      ? `${focused}\n\nInsert the new section on the page with pageId ${insert.pageId} at position ${insert.position} (0 is the top of the page).`
      : focused;
  }

  async function applyChanges() {
    if (!reviewSession || !run || !threadId || working || streaming) return;
    setWorking("apply");
    setError("");
    try {
      // Unsaved edits are saved first so the changes are rebased on them, not over them.
      if (!await editor.saveDraft()) {
        setError("Your draft could not be saved, so nothing was applied. Check the editor status and try again.");
        return;
      }
      const undone = Object.entries(reviewSession.review.decisions)
        .filter(([, decision]) => decision === "undone").map(([id]) => id);
      const result = await applyAgentChanges({ siteId, threadId, runId: run.id, pageId, undone });
      if (result.status === "error") {
        setError(result.message);
        setApplyReport(result.dropped?.length ? { dropped: result.dropped, notes: [] } : null);
        return;
      }
      setApplied(result.applied);
      setApplyReport({ dropped: result.dropped, notes: result.notes });
      setReviewSession(null);
      notify(applyToast(result.applied));
      if (!await editor.adopt(result.editor)) setError("The changes were applied. Reload the editor to continue editing.");
    } catch (cause) {
      console.error("Could not apply AI changes", { type: cause instanceof Error ? cause.name : "Unknown" });
      setError("Could not confirm that the AI changes were applied. Reload the editor before trying again.");
    } finally {
      setWorking(null);
    }
  }

  async function undoChanges() {
    if (!applied || working || streaming) return;
    setWorking("undo");
    setError("");
    try {
      const result = await undoAgentApply(editor, { siteId, applyId: applied.id, pageId });
      if (result.status === "error") setError(result.message);
      else if (result.status === "success") {
        setApplied(result.applied);
        notify(applyToast(result.applied));
        if (result.left) router.push(homePage && homePage.id !== pageId ? `/editor/${homePage.id}` : "/dashboard");
      }
    } finally {
      setWorking(null);
    }
  }

  async function sendPrompt(value: string) {
    const text = value.trim();
    if (!text || streaming || pending || working || text.length > 3600) return;
    setPrompt("");
    clearInsert();
    setSteps([]);
    setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content: text }]);
    await streamRequest({
      action: "start", siteId, ...(threadId ? { threadId } : {}), message: contextualPrompt(text),
    });
  }

  async function respond(action: string, answer?: string) {
    if (!run || !threadId || streaming) return;
    if ((action === "change_plan" || action === "answer") && !answer?.trim()) return;
    if (answer?.trim()) {
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content: answer.trim() }]);
    }
    if (action === "answer") setPrompt("");
    if (action === "change_plan") { setPlanChange(""); setPlanChangeOpen(false); }
    setPending(null);
    await streamRequest({ action, threadId, runId: run.id, ...(answer ? { answer: answer.trim() } : {}) });
  }

  async function renameThread(id: string) {
    const title = renameValue.trim();
    if (!title) return;
    setError("");
    try {
      const response = await fetch("/api/ai/agent/threads", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: id, title }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload));
      setThreads((previous) => previous.map((thread) => thread.id === id ? { ...thread, title } : thread));
      setRenameId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename this conversation.");
    }
  }

  async function deleteThread(id: string) {
    setError("");
    try {
      const response = await fetch("/api/ai/agent/threads", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: id }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseMessage(payload));
      setThreads((previous) => previous.filter((thread) => thread.id !== id));
      setDeleteId(null);
      if (threadId === id) await loadThread(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this conversation.");
    }
  }

  const selectedThread = threads.find((thread) => thread.id === threadId);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStart.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    setWidth(Math.max(320, Math.min(680, resizeStart.current.width + resizeStart.current.x - event.clientX)));
  };

  return <aside
    className="platform-ui editor-agent-panel fixed right-0 z-120 flex flex-col border-l border-zinc-200 bg-white shadow-2xl"
    aria-label="AI site agent" style={{ width: `min(${width}px, 100vw)` }}
    onKeyDown={(event) => { if (event.key === "Escape" && !streaming) onClose(); }}>
    <div role="separator" aria-label="Resize AI panel" aria-orientation="vertical" aria-valuenow={width}
      tabIndex={0} className="editor-agent-resize" onPointerDown={startResize} onPointerMove={resize}
      onPointerUp={() => { resizeStart.current = null; }} onPointerCancel={() => { resizeStart.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setWidth((current) => Math.max(320, Math.min(680, current + (event.key === "ArrowLeft" ? 16 : -16))));
      }} />
    <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
      <Sparkles size={17} className="text-violet-600" />
      <h2 className="flex-1 text-sm font-semibold">AI site agent</h2>
      <button type="button" aria-label="Close AI chat" title="Close AI chat" onClick={onClose} className="rounded p-1.5 hover:bg-zinc-100"><X size={17} /></button>
    </header>
    <section className="border-b border-zinc-200 px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Chats</p>
        <button type="button" onClick={() => void loadThread(null)} disabled={streaming}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
          <MessageSquarePlus size={13} />New chat
        </button>
      </div>
      <div className="max-h-28 space-y-1 overflow-y-auto">
        {threads.map((thread) => <div key={thread.id} className={`flex items-center gap-1 rounded-lg px-2 ${thread.id === threadId ? "bg-violet-50" : "hover:bg-zinc-50"}`}>
          {renameId === thread.id ? <form className="flex min-w-0 flex-1 items-center gap-1 py-1" onSubmit={(event) => {
            event.preventDefault(); void renameThread(thread.id);
          }}>
            <input aria-label="Conversation name" value={renameValue} maxLength={120} onChange={(event) => setRenameValue(event.currentTarget.value)}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" />
            <button type="submit" aria-label="Save name" className="rounded p-1 text-green-700"><Check size={14} /></button>
            <button type="button" aria-label="Cancel rename" onClick={() => setRenameId(null)} className="rounded p-1"><X size={14} /></button>
          </form> : <>
            <button type="button" onClick={() => void loadThread(thread.id)} disabled={streaming}
              className="min-w-0 flex-1 truncate py-2 text-left text-xs disabled:opacity-50" title={thread.title}>{thread.title}</button>
            <button type="button" aria-label={`Rename ${thread.title}`} title="Rename" disabled={streaming}
              onClick={() => { setRenameId(thread.id); setRenameValue(thread.title); }}
              className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-800"><Pencil size={13} /></button>
            {deleteId === thread.id ? <><button type="button" onClick={() => void deleteThread(thread.id)} className="rounded p-1 text-red-700">Delete</button>
              <button type="button" aria-label="Cancel delete" onClick={() => setDeleteId(null)} className="rounded p-1"><X size={13} /></button></>
              : <button type="button" aria-label={`Delete ${thread.title}`} title="Delete" disabled={streaming}
                onClick={() => setDeleteId(thread.id)} className="rounded p-1 text-zinc-400 hover:bg-white hover:text-red-700"><Trash2 size={13} /></button>}
          </>}
        </div>)}
        {!threads.length ? <p className="px-2 py-1 text-xs text-zinc-400">Your conversations will appear here.</p> : null}
      </div>
    </section>
    <div className="flex flex-wrap gap-1.5 border-b border-zinc-100 px-4 py-2">
      {([
        ["home", "@Home", Boolean(homePage)],
        ["header", "@Header", true],
        ["section", "@This section", Boolean(section)],
      ] as const).map(([id, label, enabled]) => <button key={id} type="button" disabled={!enabled}
        aria-pressed={contexts.includes(id)} title={id === "section" ? section?.label : label}
        onClick={() => setContexts((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id])}
        className={`rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40 ${contexts.includes(id) ? "border-violet-200 bg-violet-50 text-violet-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>{label}</button>)}
      {insert ? <button type="button" aria-pressed title="Remove the insert position" onClick={clearInsert}
        className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] text-violet-800">
        @Insert at position {insert.position + 1} <X size={10} className="inline" /></button> : null}
      {selectedThread ? <span className="ml-auto self-center truncate text-[10px] text-zinc-400">{selectedThread.title}</span> : null}
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
      {!messages.length && !streaming ? <section className="pt-6">
        <p className="text-center text-sm font-medium text-zinc-700">What would you like to improve?</p>
        <p className="mt-1 text-center text-xs text-zinc-500">I can review the whole site and stage changes for you to review.</p>
        <div className="mt-5 grid gap-2">
          {suggestedPrompts.map((suggestion) => <button key={suggestion} type="button" disabled={Boolean(pending)}
            onClick={() => void sendPrompt(suggestion)}
            className="rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-xs text-zinc-700 hover:border-violet-200 hover:bg-violet-50">{suggestion}</button>)}
        </div>
      </section> : messages.map((message) => <article key={message.id}
        className={`max-w-[94%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${message.role === "user" ? "ml-auto bg-zinc-900 text-white" : "mr-auto border border-zinc-200 bg-zinc-50 text-zinc-800"}`}>
        <p className="whitespace-pre-wrap">{message.content || (message.streaming ? " " : "")}</p>
        {message.streaming ? <span className="mt-1 inline-block h-3 w-1 animate-pulse bg-violet-500" aria-label="Streaming response" /> : null}
      </article>)}
      {steps.length ? <details open={streaming} className="rounded-lg border border-zinc-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700">
          {streaming ? <LoaderCircle size={13} className="animate-spin text-violet-600" /> : <ChevronDown size={13} />}
          {streaming ? "Working on your request" : "Agent steps"}
        </summary>
        <ol className="space-y-2 border-t border-zinc-100 px-3 py-2">
          {steps.map((step) => <li key={step.callId} className="flex items-start gap-2 text-xs">
            {step.status === "running" ? <LoaderCircle size={13} className="mt-0.5 animate-spin text-violet-600" />
              : step.status === "done" ? <Check size={13} className="mt-0.5 text-green-700" />
                : step.status === "error" ? <X size={13} className="mt-0.5 text-red-600" />
                  : <span className="mt-0.5 h-3 w-3 rounded-full border border-amber-500" />}
            <span className="text-zinc-700">{step.label}{step.error ? <span className="block text-red-600">{step.error}</span> : null}</span>
          </li>)}
        </ol>
      </details> : null}
      {usage && !streaming ? <p className="text-[10px] text-zinc-500">This request: {describeAgentUsage(usage)}</p> : null}
      {reviewSession?.threadId === threadId ? <AgentReviewCard review={reviewSession.review}
        onChange={(review) => setReviewSession({ ...reviewSession, review })} currentPageId={pageId}
        onApply={() => void applyChanges()} applying={working === "apply"}
        disabled={streaming || working !== null || !run || !["completed", "stopped", "failed"].includes(run.status)} /> : null}
      {applied || applyReport ? <AgentAppliedCard applied={applied} report={applyReport} siteId={siteId}
        undoing={working === "undo"} disabled={streaming || working !== null} onUndo={() => void undoChanges()} /> : null}
      {pending?.kind === "plan" ? <section className="rounded-xl border border-violet-200 bg-violet-50 p-3" aria-label="Proposed plan">
        <h3 className="text-xs font-semibold text-violet-950">Proposed plan</h3>
        {pending.rationale ? <p className="mt-1 text-xs text-violet-900">{pending.rationale}</p> : null}
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-violet-950">{pending.steps.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={streaming} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" onClick={() => void respond("approve_plan")}>Approve</button>
          <button type="button" disabled={streaming} className="rounded-lg border border-violet-300 px-3 py-2 text-xs disabled:opacity-50" onClick={() => setPlanChangeOpen(true)}>Change plan</button>
          <button type="button" disabled={streaming} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50" onClick={() => void respond("reject_plan")}>Cancel</button>
        </div>
        {planChangeOpen ? <form className="mt-3 space-y-2" onSubmit={(event) => {
          event.preventDefault(); void respond("change_plan", planChange);
        }}>
          <label className="block text-xs font-medium">How should I change the plan?
            <textarea autoFocus value={planChange} onChange={(event) => setPlanChange(event.currentTarget.value)}
              maxLength={2000} rows={2} placeholder="Tell me what to revise…" className="mt-1 w-full rounded-lg border p-2 text-xs" />
          </label>
          <button type="submit" disabled={!planChange.trim() || streaming} className="rounded-lg bg-violet-700 px-3 py-2 text-xs text-white disabled:opacity-50">Send feedback</button>
        </form> : null}
      </section> : null}
      {pending?.kind === "question" ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-xs font-semibold text-amber-950">{pending.question}</h3>
        {pending.options.length ? <div className="mt-2 flex flex-wrap gap-2">{pending.options.map((option) =>
          <button key={option} type="button" disabled={streaming} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs hover:bg-amber-100 disabled:opacity-50"
            onClick={() => void respond("answer", option)}>{option}</button>)}</div>
          : <form className="mt-2 flex gap-2" onSubmit={(event) => {
            event.preventDefault(); void respond("answer", prompt);
          }}>
            <input aria-label="Your answer" value={prompt} onChange={(event) => setPrompt(event.currentTarget.value)}
              className="min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs" />
            <button type="submit" disabled={streaming || !prompt.trim()} className="rounded-lg bg-amber-700 px-3 py-2 text-xs text-white disabled:opacity-50">Answer</button>
          </form>}
      </section> : null}
      {pending?.kind === "credit" ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-xs font-semibold text-amber-950">Credit approval</h3>
        <p className="mt-1 text-xs text-amber-900">{pending.message}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={streaming} className="rounded-lg bg-amber-700 px-3 py-2 text-xs text-white disabled:opacity-50" onClick={() => void respond("approve_large_run")}>Approve {pending.credits} credits</button>
          <button type="button" disabled={streaming} className="rounded-lg border border-amber-300 px-3 py-2 text-xs disabled:opacity-50" onClick={() => void respond("reject_large_run")}>Decline</button>
        </div>
      </section> : null}
      {!pending && !streaming && (run?.status === "paused" || unfinished?.steps.length) ? <section aria-label="Unfinished work"
        className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <h3 className="text-xs font-semibold text-amber-950">{run?.status === "paused" ? "Paused before everything was done" : "Not everything was done"}</h3>
        {run?.status === "paused" ? <p className="mt-1 text-xs text-amber-900">{unfinished?.reason ?? "This run was paused. Everything so far is saved."}</p> : null}
        {unfinished?.steps.length ? <>
          <p className="mt-2 text-xs font-medium text-amber-950">{run?.status === "paused" ? "Still to do:" : "Not done:"}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-950">{unfinished.steps.map((item, index) => <li key={`${index}-${item.step}`}>
            {item.step}{item.reason ? <span className="block text-amber-800">{item.reason}</span> : null}
          </li>)}</ul>
        </> : null}
        {run?.status === "paused" ? <button type="button" className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-xs font-medium text-white"
          onClick={() => void respond("continue")}>Continue</button> : null}
      </section> : null}
    </div>
    {error ? <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    {pending?.kind !== "plan" && pending?.kind !== "question" && pending?.kind !== "credit" ? <div className="border-t border-zinc-200 p-3">
      <form className="rounded-xl border border-zinc-300 bg-white p-2 focus-within:border-violet-400" onSubmit={(event) => {
        event.preventDefault(); void sendPrompt(prompt);
      }}>
        <textarea ref={promptField} aria-label="Message the AI site agent" value={prompt} maxLength={3600} rows={3}
          disabled={streaming || Boolean(run && run.status === "paused")}
          placeholder={currentPage ? `Ask me to improve ${currentPage.title || "this page"}…` : "Ask me to improve your site…"}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(prompt); }
          }} className="w-full resize-none border-0 p-1 text-xs outline-none focus:ring-0" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-400">Enter to send · Shift+Enter for a new line</span>
          {streaming ? <button type="button" onClick={() => {
            controller.current?.abort();
            setStreaming(false);
            setRun((previous) => previous ? { ...previous, status: "stopped" } : previous);
            setSteps((previous) => previous.map((step) => step.status === "running"
              ? { ...step, status: "error", error: "Stopped" } : step));
          }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-700"><Square size={12} />Stop</button>
            : <button type="submit" disabled={!prompt.trim() || Boolean(pending) || prompt.length > 3600}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Send</button>}
        </div>
      </form>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">Changes stay staged for review. Nothing is published automatically.</p>
    </div> : null}
  </aside>;
}
