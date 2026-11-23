import { z } from "zod";
import { ICON_NAMES } from "@/lib/icons";

type Issue = z.core.$ZodIssue;
type Path = PropertyKey[];
export type LenientOptions = {
  /** Collects what was left out of the input, in words the model can act on. */
  notes?: string[];
  /** Names the input in notes, such as "design" or "props.services". */
  label?: string;
};

// "8", "8.5", "8px" and "0.5rem". Percentages and words mean something else and are left alone.
const NUMERIC = /^\s*(-?\d+(?:\.\d+)?)\s*(px|rem|em)?\s*$/i;
const ROOT = "value";

export function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = typeof value === "string" ? NUMERIC.exec(value) : null;
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] && match[2].toLowerCase() !== "px" ? Math.round(amount * 16 * 100) / 100 : amount;
}

/** Other words models use for an option. The first one the schema allows is taken. */
const OPTION_WORDS: Record<string, string[]> = {
  centre: ["center"], centered: ["center"], middle: ["center"], start: ["left", "top"], end: ["right", "bottom"],
  small: ["sm"], medium: ["md", "base"], large: ["lg"], "extra-large": ["xl"], xlarge: ["xl"], s: ["sm"], m: ["md", "base"], l: ["lg"],
  md: ["base", "medium"], base: ["md"], normal: ["base", "md", "medium"], regular: ["base", "md"], default: ["none", "theme", "base", "md"],
  outline: ["ghost", "secondary"], outlined: ["ghost", "secondary"], link: ["ghost"], text: ["ghost", "plain"], tertiary: ["ghost"],
  filled: ["solid", "primary"], fill: ["solid", "cover"], solid: ["primary"], subtle: ["soft"], light: ["soft", "default"],
  rounded: ["theme", "large"], round: ["rounded", "pill"], circle: ["round", "pill"], circular: ["round", "pill"], full: ["round", "pill", "100"],
  square: ["none"], sharp: ["none", "square"], grey: ["soft", "muted"], gray: ["soft", "muted"], accent: ["secondary"],
  white: ["background"], black: ["text"], brand: ["primary"], heavy: ["strong"], big: ["strong", "lg"],
  "fade-in": ["fade"], "slide-up": ["fade-up"], "slide-down": ["fade-down"], zoom: ["zoom-in"], "slide-in-left": ["slide-left"],
  "slide-in-right": ["slide-right"], "on-scroll": ["scroll"], load: ["entrance"], "on-load": ["entrance"], dash: ["dashed"], dots: ["dotted"],
  stretch: ["full"], wide: ["full"], boxed: ["contained"], container: ["contained"], highlighted: ["highlight"],
};
/** Icon names models reach for that are not in the curated set, and the curated icon that stands for them. */
const ICON_WORDS: Record<string, string> = Object.fromEntries(Object.entries({
  wrench: "tool tools spanner settings cog gear screwdriver repair", "shield-check": "shield security secure shield-alt safe protection",
  check: "tick checkmark check-circle circle-check check-circle-2 check-square done ok", "badge-check": "verified certified badge approved",
  award: "certificate medal ribbon rosette", droplet: "water drop tint", droplets: "plumbing leak", flame: "fire hot burn heating boiler",
  zap: "bolt lightning electric electricity power energy fast", clock: "time timer watch hourglass alarm-clock clock-3 clock-4 punctual",
  calendar: "schedule calendar-check calendar-days date booking", phone: "telephone call phone-call mobile smartphone",
  mail: "email envelope at-sign message send inbox", "map-pin": "location pin map marker navigation map-pinned place",
  home: "house", building: "building-2 office company", store: "shop storefront shopping-bag cart", users: "people team user group person user-check users-round staff",
  "thumbs-up": "like thumb-up thumbsup approve", heart: "love care", "heart-handshake": "handshake partnership trust honest honesty",
  smile: "happy face emoji friendly", truck: "van delivery shipping", lightbulb: "idea bulb light", leaf: "eco environment plant green sprout",
  "tree-pine": "tree trees", snowflake: "snow cold freeze ice frozen", thermometer: "heat temperature", "shower-head": "shower", bath: "bathtub bathroom",
  paintbrush: "paint brush paint-roller", ruler: "measure tape", plug: "electrical socket outlet", plus: "add", sparkles: "clean cleaning shine magic wand sparkle tidy broom",
  gem: "diamond premium quality crown", trophy: "cup winner", star: "rating favorite favourite", key: "keys access", lock: "padlock private", briefcase: "work job business",
  "graduation-cap": "education training apprentice school", camera: "photo image picture", gift: "present offer", recycle: "recycling reuse", hammer: "build construction",
}).flatMap(([icon, words]) => words.split(" ").map((word) => [word, icon])));
const isIconList = (allowed: unknown[]) => allowed.length === ICON_NAMES.length && ICON_NAMES.every((name) => allowed.includes(name));

/** "ShieldCheck", "shield_check" and "Shield Check" all read as "shield-check". */
function word(text: string) {
  return text.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[\s_]+/g, "-");
}

/** The allowed option a value most plainly means, or undefined. */
function closestOption(value: unknown, allowed: unknown[], notes: string[] | undefined, where: string): unknown {
  const numbers = allowed.filter((option) => typeof option === "number");
  // "8px" for 8, and "h2" for a heading level of 2.
  const amount = readNumber(value) ?? (typeof value === "string" && /^\s*[a-z]{1,2}\d+\s*$/i.test(value) ? Number(value.replace(/\D/g, "")) : null);
  if (numbers.length && typeof value === "string" && amount !== null && numbers.includes(amount)) return amount;
  const options = allowed.filter((option): option is string => typeof option === "string");
  if (!options.length || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) return undefined;
  if (options.includes(String(value))) return String(value);
  // 24, "24px" and "100%" for "24" and "100"; 2 for "h2".
  const digits = typeof value === "number" ? String(value) : /^\s*\d+(?:\.\d+)?\s*(?:px|%)?\s*$/.test(String(value)) ? String(value).replace(/[^\d.]/g, "") : null;
  if (digits !== null) {
    const matches = options.filter((option) => option.replace(/[^\d.]/g, "") === digits);
    if (matches.length === 1) return matches[0];
  }
  if (typeof value !== "string") return undefined;
  const key = word(value.replace(":", "/"));
  const same = options.find((option) => word(option) === key);
  if (same) return same;
  const alias = lookup(OPTION_WORDS, key)?.find((option) => options.includes(option));
  if (alias) return alias;
  if (isIconList(allowed)) {
    const icon = lookup(ICON_WORDS, key) ?? lookup(ICON_WORDS, key.replace(/-(?:icon|circle|2|alt)$/, ""))
      ?? key.split("-").map((part) => lookup(ICON_WORDS, part) ?? (options.includes(part) ? part : undefined)).find(Boolean);
    if (icon) return icon;
    // An icon the set does not have must not cost the whole call: a neutral one is used and the model is told.
    addNote(notes, `${where}: there is no "${value.slice(0, 40)}" icon, so "check" was used. Available icons: ${options.join(", ")}.`);
    return "check";
  }
  return undefined;
}

/** A table entry by a model-written key. Words such as "constructor" must not find what every object inherits. */
export function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
/** Adds a note once, however many branches of a schema report the same thing. */
export function addNote(notes: string[] | undefined, text: string) {
  if (notes && !notes.includes(text)) notes.push(text);
}
export function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}
function at(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((value, part) => value !== null && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[part] : undefined, root);
}
function describe(label: string | undefined, path: Path) {
  return [label, ...path.slice(1).map(String)].filter(Boolean).join(".") || "input";
}

/** Each branch of a union reports paths from the union's own position. */
function leaves(issues: Issue[], prefix: Path): { issue: Issue; path: Path }[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    return issue.code === "invalid_union" ? leaves(issue.errors.flat(), path) : [{ issue, path }];
  });
}

/** Rewrites the value an issue points at when it plainly means something the schema accepts. Returns whether it did. */
function repair(box: Record<PropertyKey, unknown>, issue: Issue, path: Path, options: LenientOptions): boolean {
  const value = at(box, path);
  const parent = at(box, path.slice(0, -1));
  const key = path[path.length - 1];
  if (parent === null || typeof parent !== "object") return false;
  const set = (next: unknown) => {
    (parent as Record<PropertyKey, unknown>)[key] = next;
    return true;
  };
  if (issue.code === "unrecognized_keys") {
    if (value === null || typeof value !== "object") return false;
    for (const extra of issue.keys) {
      delete (value as Record<string, unknown>)[extra];
      addNote(options.notes, `${describe(options.label, [...path, extra])} is not a setting here and was ignored.`);
    }
    return issue.keys.length > 0;
  }
  if (issue.code === "invalid_value") {
    const option = closestOption(value, issue.values, options.notes, describe(options.label, path));
    return option === undefined ? false : set(option);
  }
  if (issue.code !== "invalid_type") return false;
  const { expected } = issue;
  if (expected === "number" && typeof value === "string") {
    const amount = readNumber(value);
    return amount === null ? false : set(amount);
  }
  if (expected === "boolean" && typeof value === "string" && /^\s*(?:true|false)\s*$/i.test(value)) return set(value.trim().toLowerCase() === "true");
  if (expected === "string" && typeof value === "number" && Number.isFinite(value)) return set(String(value));
  if ((expected === "object" || expected === "record" || expected === "array") && typeof value === "string") {
    // An object or list written as a JSON string.
    const parsed = parseJson(value);
    if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed) === (expected === "array")) return set(parsed);
  }
  // One item where a list is expected.
  if (expected === "array" && value !== undefined && value !== null && !Array.isArray(value)) return set([value]);
  return false;
}

/**
 * Parses model-written input, first rewriting the slips models commonly make
 * into what they plainly mean, wherever the schema reports them:
 * numbers written as text or with a unit ("8", "8px", "0.5rem"), options
 * written as numbers or in another spelling (24 for "24", 2 for "h2",
 * "Center"), objects and lists written as JSON strings, and one item where a
 * list is expected. Keys the schema does not know are left out and noted
 * instead of failing the call. Refusing any of these costs a retry and has
 * made the model drop the rest of an edit. Every other rule of the schema
 * still applies, and the input itself is never changed.
 */
export function parseLenient<T extends z.ZodType>(schema: T, input: unknown, options: LenientOptions = {}): z.output<T> {
  let result = schema.safeParse(input);
  let box: Record<PropertyKey, unknown> = { [ROOT]: input };
  // Fixing one value can reveal the next, for example inside a list item that failed as a whole.
  for (let pass = 0; pass < 8 && !result.success; pass++) {
    const next = structuredClone(box);
    let changed = false;
    for (const { issue, path } of leaves(result.error.issues, [ROOT])) {
      if (repair(next, issue, path, options)) changed = true;
    }
    if (!changed) break;
    box = next;
    result = schema.safeParse(box[ROOT]);
  }
  if (!result.success) throw result.error;
  return result.data;
}
