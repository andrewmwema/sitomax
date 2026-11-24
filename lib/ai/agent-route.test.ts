import { describe, expect, it } from "vitest";
import { contextSections, reportsMisalignment, routeAgentRequest, scopeExceeded, widenScope } from "./agent-route";

const selected = 'Focus on this context: selected section "Hero" (pageId 00000000-0000-4000-8000-000000000010, sectionId home-hero).';

describe("AI agent model routing by request", () => {
  it("starts edits to what is already in a section with the small model", () => {
    for (const message of [
      "Change the hero button to say Book a visit",
      "Make this heading shorter and punchier",
      "Write an SEO title and description for the Pricing page.",
      "Fix the typo in the About heading",
      "Give the hero more padding and center its text",
      "Écris un titre plus court",
    ]) expect(routeAgentRequest({ message }), message).toBe("small");
    // With a section selected, the words are about that section unless they say otherwise.
    for (const message of ["Write alt text for the image in this section.", "Add a badge to this section", "Use our brand colour here"]) {
      expect(routeAgentRequest({ message, context: selected }), message).toBe("small");
    }
  });

  it("starts planning, new sections and pages, and anything site-wide with the main model", () => {
    for (const message of [
      "Make the site feel more premium.", "Improve SEO on every page.", "Use our brand colors: navy and gold", "Write a fuller About page.",
      "Add an FAQ to Pricing.", "Add a customer reviews section to the home page", "Create a Careers page and add it to the menu",
      "Draft a blog post about frozen pipes", "Give the footer a dark background", "Rewrite all the headings", "Translate everything into Spanish",
      "x".repeat(601),
    ]) expect(routeAgentRequest({ message }), message.slice(0, 40)).toBe("main");
    expect(routeAgentRequest({ message: "Make every heading like this one", context: selected })).toBe("main");
    expect(routeAgentRequest({ message: "A pricing table", context: "Insert the new section on the page with pageId x at position 2 (0 is the top of the page)." })).toBe("main");
    expect(routeAgentRequest({ message: "Make it sticky", context: "Focus on this context: the global site header." })).toBe("main");
    expect(routeAgentRequest({ message: "Carry on", openPlan: true })).toBe("main");
  });

  it("recognises a report of misalignment and the sections the editor names with it", () => {
    for (const message of [
      "This section is misaligned", "The paragraph looks off-center", "Why is the heading not centred?", "Center the text under the heading",
      "The text is shifted to the right", "Fix the alignment here", "It looks lopsided on mobile",
    ]) expect(reportsMisalignment(message), message).toBe(true);
    for (const message of ["Make the heading shorter", "Add more padding at the top", "Use our brand colours", "Write alt text for this image"]) {
      expect(reportsMisalignment(message), message).toBe(false);
    }
    const measured = 'Layout check, measured in the editor at 1280px wide: in section id home-why-section on the page with pageId 00000000-0000-4000-8000-000000000010, the box of the centered text "We turn up" has 0px free on its left and 486px on its right, so it is off-center.';
    expect(contextSections(`${selected}\n\n${measured}`)).toEqual([
      { pageId: "00000000-0000-4000-8000-000000000010", sectionId: "home-hero" },
      { pageId: "00000000-0000-4000-8000-000000000010", sectionId: "home-why-section" },
    ]);
    expect(contextSections(undefined)).toEqual([]);
    // What the editor measured names its section without the word that marks a selection.
    expect(routeAgentRequest({ message: "Add a pricing page", context: measured })).toBe("main");
  });

  it("bounds what may be changed without a plan, and by the small model, to one page and three sections", () => {
    let scope = widenScope(undefined, { pageId: "home", sectionId: "a" });
    expect(scopeExceeded(scope, { pageId: "home", sectionId: "a" })).toBeNull();
    expect(scopeExceeded(scope, { pageId: "about", sectionId: "x" })).toContain("second page");
    scope = widenScope(widenScope(scope, { pageId: "home", sectionId: "b" }), { pageId: "home", sectionId: "c" });
    expect(scope).toEqual({ pageId: "home", sections: ["a", "b", "c"] });
    expect(scopeExceeded(scope, { pageId: "home", sectionId: "c" })).toBeNull();
    expect(scopeExceeded(scope, { pageId: "home", sectionId: "d" })).toContain("three parts");
    // A section that is being added counts, though it has no id yet.
    expect(scopeExceeded(scope, { pageId: "home", adds: true })).toContain("three parts");
    expect(scopeExceeded(widenScope(undefined, { pageId: "home", sectionId: "a" }), { pageId: "home", adds: true })).toBeNull();
    // Page settings name no section and count against the page alone; site-wide settings name neither.
    expect(scopeExceeded(scope, { pageId: "home" })).toBeNull();
    expect(scopeExceeded(scope, {})).toBeNull();
    expect(widenScope(scope, {})).toEqual(scope);
  });
});
