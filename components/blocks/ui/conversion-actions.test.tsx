import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversionActions } from "./conversion-actions";

describe("conversion actions", () => {
  it("renders typed contact links, popup forms and the optional trust line", () => {
    const html = renderToStaticMarkup(
      <ConversionActions
        primary={{ label: "Call our team", link: { type: "phone", phone: "+12025550123" } }}
        secondary={{ label: "Request a quote", mode: "form-popup", formName: "project-quote" }}
        trustLine="No obligation. We usually reply within one business day."
      />,
    );

    expect(html).toContain('href="tel:+12025550123"');
    expect(html).toContain("Request a quote");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain('name="_form_name" value="project-quote"');
    expect(html).toContain("No obligation. We usually reply within one business day.");
  });
});
