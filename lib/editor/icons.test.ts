import { describe, expect, it } from "vitest";
import { createElement } from "react";
import type { Field } from "@puckeditor/core";
import { getEditableIcon, replaceIcon } from "./icons";
import { iconValueSchema } from "@/lib/icons";

const iconField = { type: "custom" as const, aiKind: "icon", render: () => createElement("span") };
const fields: Record<string, Field> = {
  services: { type: "array", arrayFields: { icon: iconField, title: { type: "text" } } },
};
const props = { services: [{ icon: "wrench", title: "Repairs" }, { icon: "plug", title: "Electrical" }] };

describe("editable icons", () => {
  it("changes the exact array item without mutating its siblings or the original draft", () => {
    const value = { name: "droplets", size: 48, color: "primary" };
    const result = replaceIcon(props, fields, "services.1.icon", value);
    expect(getEditableIcon(result, fields, "services.1.icon")).toEqual(value);
    expect(result.services).toEqual([props.services[0], { icon: value, title: "Electrical" }]);
    expect(props.services[1].icon).toBe("plug");
  });

  it("rejects undeclared fields, invalid indexes and prototype paths", () => {
    for (const path of ["services.9.icon", "services.-1.icon", "services.01.icon", "services.0.title", "__proto__.icon"]) {
      expect(() => replaceIcon(props, fields, path, "leaf")).toThrow();
    }
  });

  it("accepts legacy names but rejects unknown icons, unsafe colors and unbounded sizes", () => {
    expect(iconValueSchema.parse("wrench")).toBe("wrench");
    for (const value of ["not-a-real-icon", { name: "wrench", size: 500 }, { name: "leaf", color: "url(evil)" }, { name: "leaf", size: 2 }, { name: "leaf", code: "<script>" }]) {
      expect(() => replaceIcon(props, fields, "services.0.icon", value)).toThrow();
    }
  });

  it("lets users replace an old unsupported icon that is already rendered as a fallback", () => {
    const old = { services: [{ icon: "old-unsupported-name", title: "Repairs" }] };
    expect(getEditableIcon(old, fields, "services.0.icon", "star")).toBe("star");
    expect(getEditableIcon(replaceIcon(old, fields, "services.0.icon", "wrench"), fields, "services.0.icon")).toBe("wrench");
  });
});
