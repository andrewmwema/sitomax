import { describe, expect, it } from "vitest";
import {
  autoTextScheme,
  normalizeDesign,
  safeUploadedVideoUrl,
  videoEmbedUrl,
} from "./design";

describe("videoEmbedUrl (allowlist)", () => {
  it("converts YouTube URLs to privacy-friendly nocookie embeds", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const embed = videoEmbedUrl(url);
      expect(embed).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      expect(embed).toContain("mute=1");
    }
  });

  it("converts Vimeo URLs to dnt embeds", () => {
    const embed = videoEmbedUrl("https://vimeo.com/123456789");
    expect(embed).toContain("https://player.vimeo.com/video/123456789");
    expect(embed).toContain("dnt=1");
  });

  it("rejects every other host and scheme", () => {
    for (const url of [
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://dailymotion.com/video/x123456",
      "javascript:alert(1)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "data:text/html,<script>alert(1)</script>" as any,
      "not a url",
      "",
      null,
    ]) {
      expect(videoEmbedUrl(url)).toBeNull();
    }
  });

  it("rejects malformed video ids", () => {
    expect(videoEmbedUrl("https://vimeo.com/not-a-number")).toBeNull();
    expect(videoEmbedUrl('https://youtu.be/"onload=alert(1)')).toBeNull();
  });
});

describe("safeUploadedVideoUrl", () => {
  it("accepts only https mp4/webm files", () => {
    expect(safeUploadedVideoUrl("https://cdn.example/video.mp4")).not.toBeNull();
    expect(safeUploadedVideoUrl("https://cdn.example/video.webm")).not.toBeNull();
    expect(safeUploadedVideoUrl("http://cdn.example/video.mp4")).toBeNull();
    expect(safeUploadedVideoUrl("https://cdn.example/video.mov")).toBeNull();
    expect(safeUploadedVideoUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("normalizeDesign", () => {
  it("drops invalid colors, clamps numbers and slugifies anchors", () => {
    const normalized = normalizeDesign({
      settings: { anchorId: '#Pricing Table"<script>' },
      background: { type: "color", color: "url(javascript:alert(1))" },
      border: { width: 100, color: "expression(alert(1))", radius: -5 },
      animation: { trigger: "entrance", type: "fade-up", duration: 999999, delay: -50 },
      spacing: { mobile: { paddingTop: 9999, marginLeft: -20 } },
    });
    expect(normalized.anchorId).toBe("pricingtablescript");
    // Invalid color → background disabled entirely.
    expect(normalized.background).toEqual({ kind: "none" });
    expect(normalized.border?.width).toBe(8);
    expect(normalized.border?.color).toBe("#d4d4d8");
    expect(normalized.animation).toMatchObject({ duration: 3000, delay: 0 });
    expect(normalized.spacing.mobile).toEqual({ paddingTop: 128, marginLeft: 0 });
  });

  it("snaps spacing to the 0–128 spacing scale", () => {
    const normalized = normalizeDesign({
      spacing: { desktop: { paddingTop: 40, paddingBottom: 13, marginTop: 70 } },
    });
    expect(normalized.spacing.desktop).toEqual({
      paddingTop: 32,
      paddingBottom: 12,
      marginTop: 64,
    });
  });

  it("keeps only https image URLs and caps the slider at 8", () => {
    const normalized = normalizeDesign({
      background: {
        type: "image",
        images: [
          "https://cdn.example/a.jpg",
          "javascript:alert(1)",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { not: "a string" } as any,
          ...Array.from({ length: 10 }, (_, i) => `https://cdn.example/${i}.jpg`),
        ],
        overlayOpacity: 200,
      },
    });
    expect(normalized.background.kind).toBe("image");
    if (normalized.background.kind === "image") {
      expect(normalized.background.images).toHaveLength(8);
      expect(
        normalized.background.images.every((url) => url.startsWith("https://")),
      ).toBe(true);
      // Opacity clamped to the 0–80 range.
      expect(normalized.background.overlay?.opacity).toBe(80);
    }
  });

  it("only produces allowlisted video embeds", () => {
    const good = normalizeDesign({
      background: {
        type: "video",
        video: { source: "url", embedUrl: "https://youtu.be/dQw4w9WgXcQ" },
      },
    });
    expect(good.background.kind).toBe("video");

    const bad = normalizeDesign({
      background: {
        type: "video",
        video: { source: "url", embedUrl: "https://evil.example/embed/1" },
      },
    });
    expect(bad.background).toEqual({ kind: "none" });
  });

  it("keeps a poster-only video background as a static frame", () => {
    const posterOnly = normalizeDesign({
      background: {
        type: "video",
        video: { poster: "/samples/kitchen.jpg" },
      },
    });
    expect(posterOnly.background).toMatchObject({
      kind: "video",
      embedUrl: null,
      fileUrl: null,
      poster: "/samples/kitchen.jpg",
    });

    // No poster and no valid video still collapses to none.
    const empty = normalizeDesign({
      background: { type: "video", video: {} },
    });
    expect(empty.background).toEqual({ kind: "none" });
  });

  it("resolves auto text color for WCAG contrast", () => {
    expect(autoTextScheme("#0a0e14")).toBe("light");
    expect(autoTextScheme("#ffffff")).toBe("dark");
    const normalized = normalizeDesign({
      background: { type: "color", color: "#0a0e14" },
      textColor: "auto",
    });
    expect(normalized.textScheme).toBe("light");
    expect(normalizeDesign({ background: { type: "color", color: "#ffffff" } }).textScheme)
      .toBe("dark");
    expect(normalizeDesign({
      background: { type: "gradient", from: "#020617", to: "#ffffff" },
      textColor: "auto",
    }).textScheme).toBe("dark");
  });

  it("defaults cleanly for an empty design", () => {
    const normalized = normalizeDesign({});
    expect(normalized).toMatchObject({
      fullBleed: true,
      anchorId: null,
      background: { kind: "none" },
      border: null,
      shadow: null,
      textScheme: null,
      animation: null,
    });
  });
});
