"use client";

import { useContext, useState, type ReactNode } from "react";
import { Smartphone } from "lucide-react";
import { DEFAULT_COLORS } from "@/lib/theme/presets";
import {
  bestContrastingTextColor,
  resolveContrastBackgrounds,
} from "@/lib/theme/contrast";
import {
  safeHexColor,
  videoEmbedUrl,
  type BlockDesign,
  type DesignLevel,
  type DeviceId,
  type SpacingBox,
} from "@/lib/sections/design";
import { SPACING_SCALE, snapSpacing } from "@/lib/layout/spacing";
import { SectionLibraryContext } from "@/components/editor/section-library";
import { ImageUploadField } from "@/components/editor/image-upload-field";
import { VideoUploadField } from "@/components/editor/video-upload-field";
import { InteractionContext } from "./interaction-context";
import { ContrastNotice } from "./contrast-notice";

/**
 * Editor UI for the "design" object every block carries (SectionShell).
 * Four tabs: Settings, Style, Animation, Spacing. Only typed, bounded
 * values are stored — colors are hex, numbers are clamped at render
 * time, video URLs are allowlisted. Never raw CSS or HTML.
 */

type TabId = "settings" | "style" | "animation" | "spacing";

const TABS: { id: TabId; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "style", label: "Style" },
  { id: "animation", label: "Animation" },
  { id: "spacing", label: "Spacing" },
];

export function DesignField({
  value,
  onChange,
  readOnly,
  level = "section",
  panelTab,
}: {
  value: BlockDesign | undefined;
  onChange: (value: BlockDesign) => void;
  readOnly?: boolean;
  level?: DesignLevel;
  panelTab?: TabId;
}) {
  const tabs = level === "section" ? TABS : TABS.filter((entry) => entry.id !== "settings");
  const [tab, setTab] = useState<TabId>(tabs[0].id);
  const design = value ?? {};
  const activeTab = panelTab ?? tab;

  const patch = (next: Partial<BlockDesign>) => {
    if (!readOnly) onChange({ ...design, ...next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2">
      {!panelTab ? <div
        className="grid gap-1 rounded-md bg-zinc-100 p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded px-1 py-1.5 text-[11px] font-medium transition ${
              tab === entry.id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div> : null}
      <div className="flex flex-col gap-3 px-1 pb-1">
        {activeTab === "settings" ? (
          <SettingsTab design={design} patch={patch} />
        ) : null}
        {activeTab === "style" ? (
          <StyleTab design={design} patch={patch} level={level} />
        ) : null}
        {activeTab === "animation" ? (
          <AnimationTab design={design} patch={patch} />
        ) : null}
        {activeTab === "spacing" ? <SpacingTab design={design} patch={patch} /> : null}
      </div>
    </div>
  );
}

type TabProps = {
  design: BlockDesign;
  patch: (next: Partial<BlockDesign>) => void;
};

/* ------------------------------------------------------------------ */
/* Shared controls                                                     */
/* ------------------------------------------------------------------ */

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-medium text-zinc-600">
      {label}
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-600">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-zinc-900"
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <FieldRow label={`${label} (${value}${unit})`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-zinc-900"
      />
    </FieldRow>
  );
}

function SegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <FieldRow label={label}>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md border px-2 py-1 text-[11px] transition ${
              value === option.value
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

function ColorControl({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allowNone?: boolean;
}) {
  const library = useContext(SectionLibraryContext);
  const colors = { ...DEFAULT_COLORS, ...library?.theme.colors };
  const swatches = [
    colors.primary,
    colors.secondary,
    colors.background,
    colors.text,
    "#0a0e14",
    "#ffffff",
  ];

  return (
    <FieldRow label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Use ${swatch}`}
            onClick={() => onChange(swatch)}
            className={`h-6 w-6 rounded-full border ${
              value?.toLowerCase() === swatch.toLowerCase()
                ? "border-zinc-900 ring-2 ring-zinc-900/20"
                : "border-zinc-300"
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <input
          type="color"
          aria-label={`${label} custom color`}
          value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#1e3a5f"}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
        />
        {allowNone ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`rounded-md border px-2 py-1 text-[11px] ${
              !value
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-600"
            }`}
          >
            None
          </button>
        ) : null}
      </div>
    </FieldRow>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsTab({ design, patch }: TabProps) {
  const settings = design.settings ?? {};
  const patchSettings = (next: Partial<NonNullable<BlockDesign["settings"]>>) =>
    patch({ settings: { ...settings, ...next } });

  return (
    <>
      <Toggle
        label="Full width background"
        checked={settings.fullBleed !== false}
        onChange={(checked) => patchSettings({ fullBleed: checked })}
      />
      <FieldRow label="Anchor ID (menu links, e.g. pricing)">
        <input
          type="text"
          value={settings.anchorId ?? ""}
          placeholder="pricing"
          maxLength={60}
          onChange={(event) =>
            patchSettings({
              anchorId: event.target.value
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, ""),
            })
          }
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
        />
      </FieldRow>
      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2.5">
        <p className="text-[11px] font-semibold text-zinc-700">Visibility</p>
        <Toggle
          label="Hide on desktop"
          checked={settings.hideOnDesktop === true}
          onChange={(checked) => patchSettings({ hideOnDesktop: checked })}
        />
        <Toggle
          label="Hide on tablet"
          checked={settings.hideOnTablet === true}
          onChange={(checked) => patchSettings({ hideOnTablet: checked })}
        />
        <Toggle
          label="Hide on mobile"
          checked={settings.hideOnMobile === true}
          onChange={(checked) => patchSettings({ hideOnMobile: checked })}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Style                                                               */
/* ------------------------------------------------------------------ */

function StyleTab({ design, patch, level }: TabProps & { level: DesignLevel }) {
  const library = useContext(SectionLibraryContext);
  const background = design.background ?? {};
  const border = design.border ?? {};
  const patchBackground = (
    next: Partial<NonNullable<BlockDesign["background"]>>,
  ) => patch({ background: { ...background, ...next } });
  const patchVideo = (
    next: Partial<NonNullable<NonNullable<BlockDesign["background"]>["video"]>>,
  ) => patchBackground({ video: { ...background.video, ...next } });
  const patchBorder = (next: Partial<NonNullable<BlockDesign["border"]>>) =>
    patch({ border: { ...border, ...next } });

  const backgroundType = background.type ?? "none";
  const images = background.images ?? [];
  const video = background.video ?? {};
  const embedInvalid =
    video.source !== "upload" &&
    Boolean(video.embedUrl) &&
    videoEmbedUrl(video.embedUrl) === null;
  const backgrounds = resolveContrastBackgrounds({ background });
  const themeText = safeHexColor(library?.theme.colors?.text) ?? DEFAULT_COLORS.text;
  const foreground = design.textColor === "light"
    ? "#f8fafc"
    : design.textColor === "dark"
      ? "#17202b"
      : design.textColor === "auto"
        ? bestContrastingTextColor(backgrounds) ?? themeText
        : themeText;

  return (
    <>
      <SegmentedRow
        label="Background"
        value={backgroundType}
        options={[
          { value: "none" as const, label: "None" },
          { value: "color" as const, label: "Color" },
          { value: "gradient" as const, label: "Gradient" },
          ...(level !== "element" ? [{ value: "image" as const, label: "Image" }] : []),
          ...(level === "section" ? [{ value: "video" as const, label: "Video" }] : []),
        ]}
        onChange={(type) => patchBackground(type === "gradient"
          ? { type, from: background.from ?? "#ffffff", to: background.to ?? "#e4e9f0", angle: background.angle ?? 135 } : { type })}
      />

      {backgroundType === "color" ? (
        <ColorControl
          label="Background color"
          value={background.color}
          onChange={(color) => patchBackground({ color })}
        />
      ) : null}
      {backgroundType === "gradient" ? <>
        <ColorControl label="Gradient start" value={background.from} onChange={(from) => patchBackground({ from })} />
        <ColorControl label="Gradient end" value={background.to} onChange={(to) => patchBackground({ to })} />
        <SliderRow label="Gradient angle" value={background.angle ?? 135} min={0} max={360} onChange={(angle) => patchBackground({ angle })} />
      </> : null}

      {backgroundType === "image" ? (
        <>
          <FieldRow
            label={`Images (${images.length ? images.length : "none"}; several = slider)`}
          >
            <div className="flex flex-col gap-2">
              {images.map((url, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <ImageUploadField
                    value={url}
                    onChange={(next) => {
                      const list = [...images];
                      if (next) list[index] = next;
                      else list.splice(index, 1);
                      patchBackground({ images: list });
                    }}
                  />
                </div>
              ))}
              {images.length < 8 ? (
                <ImageUploadField
                  value=""
                  onChange={(next) => {
                    if (next) patchBackground({ images: [...images, next] });
                  }}
                />
              ) : null}
            </div>
          </FieldRow>
          <FieldRow label="Focal point">
            <div className="grid w-20 grid-cols-3 gap-1">
              {[0, 50, 100].map((y) =>
                [0, 50, 100].map((x) => (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    aria-label={`Focus ${x}% ${y}%`}
                    onClick={() => patchBackground({ focalX: x, focalY: y })}
                    className={`h-5 rounded border ${
                      (background.focalX ?? 50) === x &&
                      (background.focalY ?? 50) === y
                        ? "border-zinc-900 bg-zinc-900"
                        : "border-zinc-300 bg-white hover:bg-zinc-100"
                    }`}
                  />
                )),
              )}
            </div>
          </FieldRow>
        </>
      ) : null}

      {backgroundType === "video" ? (
        <>
          <SegmentedRow
            label="Video source"
            value={video.source ?? "url"}
            options={[
              { value: "url", label: "YouTube / Vimeo" },
              { value: "upload", label: "Upload" },
            ]}
            onChange={(source) => patchVideo({ source })}
          />
          {(video.source ?? "url") === "url" ? (
            <FieldRow label="Video URL (YouTube or Vimeo only)">
              <input
                type="url"
                value={video.embedUrl ?? ""}
                placeholder="https://youtube.com/watch?v=…"
                onChange={(event) => patchVideo({ embedUrl: event.target.value })}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs"
              />
              {embedInvalid ? (
                <p className="text-[11px] font-normal text-red-600">
                  Only youtube.com, youtu.be and vimeo.com links are supported.
                </p>
              ) : null}
            </FieldRow>
          ) : (
            <FieldRow label="Video file (MP4/WebM, up to 50MB)">
              <VideoUploadField
                value={video.uploadUrl ?? ""}
                onChange={(uploadUrl) => patchVideo({ uploadUrl })}
              />
            </FieldRow>
          )}
          <FieldRow label="Poster image (shown while loading)">
            <ImageUploadField
              value={video.poster ?? ""}
              onChange={(poster) => patchVideo({ poster })}
            />
          </FieldRow>
        </>
      ) : null}

      {backgroundType === "image" || backgroundType === "video" ? (
        <>
          <ColorControl
            label="Overlay color"
            value={background.overlayColor}
            onChange={(overlayColor) => patchBackground({ overlayColor })}
          />
          <SliderRow
            label="Overlay opacity"
            value={background.overlayOpacity ?? 40}
            min={0}
            max={80}
            unit="%"
            onChange={(overlayOpacity) => patchBackground({ overlayOpacity })}
          />
        </>
      ) : null}

      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2.5">
        <p className="text-[11px] font-semibold text-zinc-700">Border</p>
        <SliderRow
          label="Width"
          value={border.width ?? 0}
          min={0}
          max={8}
          onChange={(width) => patchBorder({ width })}
        />
        {(border.width ?? 0) > 0 ? (
          <ColorControl
            label="Border color"
            value={border.color}
            onChange={(color) => patchBorder({ color })}
          />
        ) : null}
        <SliderRow
          label="Corner radius"
          value={border.radius ?? 0}
          min={0}
          max={48}
          onChange={(radius) => patchBorder({ radius })}
        />
      </div>

      <SegmentedRow
        label="Shadow"
        value={design.shadow ?? "none"}
        options={[
          { value: "none", label: "None" },
          { value: "soft", label: "Soft" },
          { value: "medium", label: "Medium" },
          { value: "strong", label: "Strong" },
        ]}
        onChange={(shadow) => patch({ shadow })}
      />

      <SegmentedRow
        label="Text color"
        value={design.textColor ?? "auto"}
        options={[
          { value: "auto", label: "Auto (contrast)" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onChange={(textColor) => patch({ textColor })}
      />
      <ContrastNotice foreground={foreground} backgrounds={backgrounds} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Animation                                                           */
/* ------------------------------------------------------------------ */

function AnimationTab({ design, patch }: TabProps) {
  const animation = design.animation ?? {};
  const patchAnimation = (
    next: Partial<NonNullable<BlockDesign["animation"]>>,
  ) => patch({ animation: { ...animation, ...next } });

  const trigger = animation.trigger ?? "none";

  return (
    <>
      <SegmentedRow
        label="Trigger"
        value={trigger}
        options={[
          { value: "none", label: "None" },
          { value: "entrance", label: "On entrance" },
          { value: "scroll", label: "On scroll" },
        ]}
        onChange={(next) => patchAnimation({ trigger: next })}
      />
      {trigger !== "none" ? (
        <>
          <SegmentedRow
            label="Animation"
            value={animation.type ?? "fade"}
            options={[
              { value: "fade", label: "Fade" },
              { value: "fade-up", label: "Fade up" },
              { value: "fade-down", label: "Fade down" },
              { value: "slide-left", label: "Slide left" },
              { value: "slide-right", label: "Slide right" },
              { value: "zoom-in", label: "Zoom in" },
            ]}
            onChange={(type) => patchAnimation({ type })}
          />
          <SliderRow
            label="Duration"
            value={animation.duration ?? 600}
            min={100}
            max={3000}
            step={50}
            unit="ms"
            onChange={(duration) => patchAnimation({ duration })}
          />
          <SliderRow
            label="Delay"
            value={animation.delay ?? 0}
            min={0}
            max={2000}
            step={50}
            unit="ms"
            onChange={(delay) => patchAnimation({ delay })}
          />
          <p className="text-[11px] text-zinc-500">
            Animations never play while editing, and are skipped for
            visitors who prefer reduced motion.
          </p>
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Spacing                                                             */
/* ------------------------------------------------------------------ */

const SPACING_SIDES = ["Top", "Right", "Bottom", "Left"] as const;

function SpacingTab({ design, patch }: TabProps) {
  const context = useContext(InteractionContext);
  const [localDevice, setLocalDevice] = useState<DeviceId>("desktop");
  const device = context?.device ?? localDevice;
  const setDevice = context?.setDevice ?? setLocalDevice;
  const spacing = design.spacing ?? {};
  const box = spacing[device] ?? {};
  const mobileOverrides = (kind: "margin" | "padding") => SPACING_SIDES.map((side) => {
    const key = `${kind}${side}` as keyof SpacingBox;
    return spacing.mobile?.[key] !== undefined && spacing.mobile[key] !== spacing.desktop?.[key];
  });

  const patchBox = (next: Partial<SpacingBox>) =>
    patch({ spacing: { ...spacing, [device]: { ...box, ...next } } });

  const clearAllPadding = () => {
    const cleared: Partial<Record<DeviceId, SpacingBox>> = { ...spacing };
    for (const id of ["desktop", "tablet", "mobile"] as const) {
      cleared[id] = {
        ...cleared[id],
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      };
    }
    patch({ spacing: cleared });
  };

  return (
    <>
      {!context ? <SegmentedRow
        label="Device"
        value={device}
        options={[
          { value: "desktop", label: "Desktop" },
          { value: "tablet", label: "Tablet" },
          { value: "mobile", label: "Mobile" },
        ]}
        onChange={setDevice}
      /> : null}

      {/* Margin box (outer) wrapping the padding box (inner). */}
      <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/60 p-1.5">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Margin
        </p>
        <SpacingSides
          mobileOverrides={mobileOverrides("margin")}
          values={SPACING_SIDES.map(
            (side) => box[`margin${side}` as keyof SpacingBox],
          )}
          onChange={(side, value) =>
            patchBox({ [`margin${SPACING_SIDES[side]}`]: value })
          }
        >
          <div className="rounded-md border-2 border-dashed border-sky-300 bg-sky-50/70 p-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Padding
            </p>
            <SpacingSides
              mobileOverrides={mobileOverrides("padding")}
              values={SPACING_SIDES.map(
                (side) => box[`padding${side}` as keyof SpacingBox],
              )}
              onChange={(side, value) =>
                patchBox({ [`padding${SPACING_SIDES[side]}`]: value })
              }
            >
              <div className="rounded bg-white py-2 text-center text-[10px] text-zinc-400">
                Content
              </div>
            </SpacingSides>
          </div>
        </SpacingSides>
      </div>

      <p className="text-[11px] text-zinc-500">
        Empty fields use the theme default. Values are in px on the
        spacing scale; tablet and mobile fall back to the desktop values.
      </p>
      <button
        type="button"
        onClick={clearAllPadding}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Clear all padding
      </button>
    </>
  );
}

/** Top / left+right / bottom numeric inputs around a child box. */
function SpacingSides({
  values,
  mobileOverrides,
  onChange,
  children,
}: {
  values: (number | undefined)[];
  mobileOverrides: boolean[];
  onChange: (sideIndex: number, value: number | undefined) => void;
  children: ReactNode;
}) {
  // Guardrail: spacing is picked from the scale, never typed freely.
  const input = (sideIndex: number) => (
    <span className="inline-flex items-center gap-0.5">
    <select
      // Older values off the scale display (and render) snapped.
      value={values[sideIndex] === undefined ? "" : snapSpacing(values[sideIndex])}
      aria-label={`${SPACING_SIDES[sideIndex]} spacing`}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(sideIndex, raw === "" ? undefined : Number(raw));
      }}
      className="h-6 w-12 rounded border border-zinc-300 bg-white text-center text-[10px]"
    >
      <option value="">–</option>
      {SPACING_SCALE.map((step) => (
        <option key={step} value={step}>
          {step}
        </option>
      ))}
    </select>
    {mobileOverrides[sideIndex] ? <Smartphone size={10} aria-label="Mobile override" /> : null}
    </span>
  );

  return (
    <div className="flex flex-col items-center gap-1 py-1">
      {input(0)}
      <div className="flex w-full items-center gap-1">
        {input(3)}
        <div className="min-w-0 flex-1">{children}</div>
        {input(1)}
      </div>
      {input(2)}
    </div>
  );
}
