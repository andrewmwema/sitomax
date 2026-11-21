// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { HexColorInput } from "./hex-color-input";

describe("hex color input", () => {
  it("applies a valid hex on blur and reports invalid values without applying them", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    await act(async () => root.render(<HexColorInput label="Primary" value="#123456" onChange={onChange} />));
    const input = container.querySelector("input")!;
    const enter = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await enter("abcdef");
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onChange).toHaveBeenCalledWith("#abcdef");
    await enter("#bad");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("previous color remains applied");
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onChange).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<HexColorInput label="Primary" value="#654321" onChange={onChange} />));
    expect(input.value).toBe("#654321");
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
