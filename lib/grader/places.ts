import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchGraderUrl } from "./fetch";
import { graderRpc } from "./worker";
import type { Check, GraderInput } from "./types";

const placeSchema = z.object({
  displayName: z.object({ text: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
});
const placesSchema = z.object({ places: z.array(placeSchema).default([]) });
const beginSchema = z.union([
  z.object({ cached: placesSchema }),
  z.object({ limited: z.literal(true) }),
  z.object({ call_id: z.uuid() }),
]);
type Place = z.infer<typeof placeSchema>;

const fields = [
  "displayName", "formattedAddress", "nationalPhoneNumber", "rating",
  "userRatingCount", "websiteUri", "googleMapsUri",
];
export const PLACES_FIELD_MASK = fields.map((field) => `places.${field}`).join(",");
export function isPlacesEnabled() { return Boolean(process.env.GOOGLE_PLACES_API_KEY); }

function unknownChecks(reason: string): Check[] {
  return ["places_rating", "places_reviews", "places_phone", "places_address"].map((id) => ({
    id, category: "local", status: "unknown", value: null,
    detail: `Couldn't check Google Places: ${reason}`,
    fix: "Review the correct Google Business Profile and its details.",
  }));
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function selectedPlace(places: Place[], finalUrl: string, query: string, input: GraderInput): Place | undefined {
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  const websiteMatches = (place: Place) => {
    if (!place.websiteUri) return false;
    try { return new URL(place.websiteUri).hostname.replace(/^www\./, "") === host; }
    catch { return false; }
  };
  const matches = places.filter((place) => {
    const name = normalized(place.displayName?.text ?? "");
    const requested = normalized(input.businessName ?? query);
    if (name.length < 3 || requested.length < 3 || !(name.includes(requested) || requested.includes(name))) return false;
    return !input.city || websiteMatches(place)
      || normalized(place.formattedAddress ?? "").includes(normalized(input.city));
  });
  if (matches.length === 1) return matches[0];
  const website = matches.filter(websiteMatches);
  return website.length === 1 ? website[0] : undefined;
}

function mapsQuery(raw: string | undefined) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(url.hostname)) return "";
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
    return (url.searchParams.get("query") ?? url.searchParams.get("q") ?? (place ? decodeURIComponent(place.replace(/\+/g, " ")) : "")).trim().slice(0, 320);
  } catch { return ""; }
}

async function lookupQuery(input: GraderInput) {
  if (input.businessName && input.city) return `${input.businessName} ${input.city}`;
  const direct = mapsQuery(input.googleMapsUrl);
  if (direct || !input.googleMapsUrl) return direct;
  try {
    const url = new URL(input.googleMapsUrl);
    if (url.protocol !== "https:" || !(url.hostname === "maps.app.goo.gl"
      || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/")))) return "";
    const resolved = await fetchGraderUrl(url.href);
    return mapsQuery(resolved.url);
  } catch {
    console.warn("Could not resolve Google Maps link for a grader report");
    return "";
  }
}

function placeChecks(place: Place, pageText: string): Check[] {
  const digits = (value: string) => value.replace(/\D/g, "");
  const phone = digits(place.nationalPhoneNumber ?? "");
  const pagePhones = (pageText.match(/\+?\d[\d\s().-]{5,}\d/g) ?? []).map(digits);
  const phoneFound = pagePhones.some((candidate) => candidate === phone);
  const address = normalized(place.formattedAddress ?? "");
  const inPage = normalized(pageText);
  const rating = place.rating;
  const count = place.userRatingCount;
  return [
    { id: "places_rating", category: "local", value: rating ?? null,
      status: rating === undefined ? "unknown" : rating >= 4 ? "pass" : rating >= 3 ? "warn" : "fail",
      detail: rating === undefined ? "Couldn't check the Google rating." : `Google rating: ${rating}/5.`,
      fix: "Respond to genuine customer feedback and improve the customer experience." },
    { id: "places_reviews", category: "local", value: count ?? null,
      status: count === undefined ? "unknown" : count > 0 ? "pass" : "warn",
      detail: count === undefined ? "Couldn't check the Google review count." : `Google reports ${count} reviews.`,
      fix: "Invite customers to leave honest reviews, following Google's rules." },
    { id: "places_phone", category: "local", value: place.nationalPhoneNumber ?? null,
      status: phone.length < 7 || !pageText ? "unknown" : phoneFound ? "pass" : "warn",
      detail: phone.length < 7 || !pageText ? "Couldn't compare the phone number."
        : phoneFound ? "The Google phone number appears in the page text."
        : "The Google phone number was not found in the page text; verify manually.",
      fix: "Ensure your website and Google Business Profile show the same current phone number." },
    { id: "places_address", category: "local", value: place.formattedAddress ?? null,
      status: !address || !pageText ? "unknown" : inPage.includes(address) ? "pass" : "warn",
      detail: !address || !pageText ? "Couldn't compare the address."
        : inPage.includes(address) ? "The Google address appears in the page text."
        : "The complete Google address was not found in the page text; verify manually.",
      fix: "Ensure your website and Google Business Profile show the same current address." },
  ];
}

export async function placesChecks(reportId: string, input: GraderInput, finalUrl: string, pageText: string): Promise<Check[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const query = await lookupQuery(input);
  if (!query) return unknownChecks("a business name and city or a usable Google Maps link is needed.");
  const key = createHash("sha256").update(query.toLowerCase().replace(/\s+/g, " ")).digest("hex");
  let reservation: z.infer<typeof beginSchema>;
  try {
    reservation = beginSchema.parse(await graderRpc("grader_places_begin", { p_report_id: reportId, p_key: key }));
  } catch {
    console.error("Could not reserve a Google Places lookup");
    return unknownChecks("the usage limit could not be verified.");
  }
  let responseData: z.infer<typeof placesSchema>;
  if ("limited" in reservation) return unknownChecks("the lookup limit has been reached.");
  if ("cached" in reservation) responseData = reservation.cached;
  else {
    let response: Response;
    try {
      response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_FIELD_MASK },
        body: JSON.stringify({ textQuery: query }),
        signal: AbortSignal.timeout(10_000), cache: "no-store",
      });
    } catch {
      console.warn("Google Places request failed");
      try { await graderRpc("grader_places_finish", { p_call_id: reservation.call_id, p_status: "error", p_http_status: null, p_result: null }); }
      catch { console.error("Could not record Google Places failure"); }
      return unknownChecks("the request failed.");
    }
    if (!response.ok) {
      console.warn("Google Places request returned an error", { status: response.status });
      try {
        await graderRpc("grader_places_finish", { p_call_id: reservation.call_id,
          p_status: [402, 403, 429].includes(response.status) ? "quota" : "error",
          p_http_status: response.status, p_result: null });
      } catch { console.error("Could not record Google Places error"); }
      return unknownChecks("Google could not complete the lookup.");
    }
    const parsed = placesSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      console.warn("Google Places returned an invalid response");
      try { await graderRpc("grader_places_finish", { p_call_id: reservation.call_id, p_status: "error", p_http_status: response.status, p_result: null }); }
      catch { console.error("Could not record invalid Google Places response"); }
      return unknownChecks("Google returned an invalid response.");
    }
    responseData = parsed.data;
    try {
      await graderRpc("grader_places_finish", {
        p_call_id: reservation.call_id, p_status: "ok", p_http_status: response.status, p_result: responseData,
      });
    } catch {
      console.error("Could not record Google Places result");
      return unknownChecks("the lookup result could not be recorded.");
    }
  }
  const place = selectedPlace(responseData.places, finalUrl, query, input);
  return place ? placeChecks(place, pageText) : unknownChecks("no unambiguous business match was found.");
}
