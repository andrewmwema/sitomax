import "server-only";

import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  preheader: string;
};

export async function renderEmail(
  subject: string,
  preheader: string,
  element: ReactElement,
): Promise<RenderedEmail> {
  const html = await render(element);
  const text = await toPlainText(html);
  return { subject, html, text, preheader };
}
