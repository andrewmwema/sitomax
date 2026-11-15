import { DM_Serif_Display, Inter, Plus_Jakarta_Sans } from "next/font/google";

/**
 * All platform fonts, loaded with next/font (self-hosted, no layout
 * shift). Each exposes a CSS variable that the style presets map onto
 * --font-heading / --font-body.
 */

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

/**
 * Class names that define the font CSS variables. Applied to the root
 * layout AND to the Puck page root, so the variables also exist inside
 * the editor's preview iframe.
 */
export const fontVariables = `${inter.variable} ${dmSerifDisplay.variable} ${plusJakartaSans.variable}`;
