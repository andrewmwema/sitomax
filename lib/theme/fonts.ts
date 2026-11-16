/** Font names are also the allowlist for rich text and saved themes. */
export const CURATED_FONTS = [
  { name: "DM Serif Display", category: "Serif", weights: "400" },
  { name: "Playfair Display", category: "Serif", weights: "400;600;700" },
  { name: "Lora", category: "Serif", weights: "400;600;700" },
  { name: "Merriweather", category: "Serif", weights: "400;600;700" },
  { name: "Cormorant Garamond", category: "Serif", weights: "400;600;700" },
  { name: "Libre Baskerville", category: "Serif", weights: "400;700" },
  { name: "Fraunces", category: "Serif", weights: "400;600;700" },
  { name: "Inter", category: "Sans-serif", weights: "400;600;700" },
  { name: "Plus Jakarta Sans", category: "Sans-serif", weights: "400;600;700" },
  { name: "Poppins", category: "Sans-serif", weights: "400;600;700" },
  { name: "Montserrat", category: "Sans-serif", weights: "400;600;700" },
  { name: "Open Sans", category: "Sans-serif", weights: "400;600;700" },
  { name: "Lato", category: "Sans-serif", weights: "400;700" },
  { name: "Raleway", category: "Sans-serif", weights: "400;600;700" },
  { name: "Nunito", category: "Sans-serif", weights: "400;600;700" },
  { name: "Work Sans", category: "Sans-serif", weights: "400;600;700" },
  { name: "Manrope", category: "Sans-serif", weights: "400;600;700" },
  { name: "Outfit", category: "Sans-serif", weights: "400;600;700" },
  { name: "DM Sans", category: "Sans-serif", weights: "400;600;700" },
  { name: "Source Sans 3", category: "Sans-serif", weights: "400;600;700" },
  { name: "Bebas Neue", category: "Display", weights: "400" },
  { name: "Oswald", category: "Display", weights: "400;600;700" },
  { name: "Archivo Black", category: "Display", weights: "400" },
  { name: "Caveat", category: "Handwriting", weights: "400;600;700" },
  { name: "Dancing Script", category: "Handwriting", weights: "400;600;700" },
] as const;

export type CuratedFont = (typeof CURATED_FONTS)[number]["name"];
export const FONT_CATEGORIES = ["Serif", "Sans-serif", "Display", "Handwriting"] as const;
export const CURATED_FONT_NAMES = CURATED_FONTS.map((font) => font.name);

export function isCuratedFont(value: unknown): value is CuratedFont {
  return CURATED_FONTS.some((font) => font.name === value);
}

export function fontFamily(name: CuratedFont): string {
  const font = CURATED_FONTS.find((item) => item.name === name);
  const fallback = font?.category === "Serif"
    ? "Georgia, serif"
    : font?.category === "Handwriting" ? "cursive" : "system-ui, sans-serif";
  return `"${name}", ${fallback}`;
}

export function googleFontsUrl(names: readonly CuratedFont[]): string {
  const families = [...new Set(names)].map((name) => {
    const font = CURATED_FONTS.find((item) => item.name === name);
    if (!font) throw new Error(`Unknown font: ${name}`);
    return `family=${encodeURIComponent(font.name).replace(/%20/g, "+")}:wght@${font.weights}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
