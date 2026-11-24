import { describe, expect, it } from "vitest";
import { z } from "zod";
import { agentToolRegistry, agentTools, compactSchema, SMALL_AGENT_TOOLS, smallAgentTools } from "./agent-tools";

function assertTypedSchema(raw: unknown, root: Record<string, unknown>, path: string, visited = new Set<string>()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${path} is not a schema object.`);
  const schema = raw as Record<string, unknown>;
  if (typeof schema.$ref === "string") {
    if (visited.has(schema.$ref)) return;
    const refPath = schema.$ref.replace(/^#\/\$defs\//, "");
    const definitions = root.$defs as Record<string, unknown> | undefined;
    if (!definitions?.[refPath]) throw new Error(`${path} has an unresolved schema reference.`);
    visited.add(schema.$ref);
    assertTypedSchema(definitions[refPath], root, `${path}.$ref`, visited);
    return;
  }
  if (schema.anyOf || schema.oneOf || schema.allOf) {
    for (const [index, branch] of ((schema.anyOf ?? schema.oneOf ?? schema.allOf) as unknown[]).entries()) {
      assertTypedSchema(branch, root, `${path}.union[${index}]`, visited);
    }
    return;
  }
  // A definition the compacted schema no longer points at any typed part of is an open value.
  if (!schema.type && !("const" in schema) && !("enum" in schema) && Object.keys(schema).length) {
    throw new Error(`${path} has no JSON schema type.`);
  }
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, property] of Object.entries(schema.properties)) {
      const propertySchema = property as Record<string, unknown>;
      if (!propertySchema.type && !propertySchema.$ref && !propertySchema.anyOf && !propertySchema.oneOf && !propertySchema.allOf) {
        throw new Error(`${path}.properties.${key} has no type.`);
      }
      assertTypedSchema(property, root, `${path}.properties.${key}`, visited);
    }
  }
  if (schema.items) assertTypedSchema(schema.items, root, `${path}.items`, visited);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    assertTypedSchema(schema.additionalProperties, root, `${path}.additionalProperties`, visited);
  }
}

describe("AI agent tool schemas", () => {
  it("converts every registered tool to typed JSON schema within the request budget", () => {
    // hand_off is the small model's way out; the main model has nobody to hand off to.
    expect(agentTools.map((tool) => tool.name)).toEqual(agentToolRegistry.map((tool) => tool.name).filter((name) => name !== "hand_off"));
    for (const tool of [...agentTools, ...smallAgentTools]) {
      const schema = tool.input_schema as Record<string, unknown>;
      expect(schema.type, tool.name).toBe("object");
      assertTypedSchema(schema, schema, tool.name);
      expect(tool.strict).toBe(false);
    }
    // Every definition is sent with every model request, so their size is paid for on each step.
    expect(JSON.stringify(agentTools).length).toBeLessThan(46_000);
    expect(JSON.stringify(smallAgentTools).length).toBeLessThan(14_000);
  });

  it("gives the small model only what edits to existing sections need, and a way to hand the rest off", () => {
    expect(smallAgentTools.map((tool) => tool.name).sort()).toEqual([...SMALL_AGENT_TOOLS].sort());
    const names = new Set(smallAgentTools.map((tool) => tool.name));
    for (const name of ["get_section", "update_section_props", "update_section_design", "update_page_settings", "set_image", "hand_off"]) expect(names.has(name), name).toBe(true);
    for (const name of ["plan", "insert_section", "create_page", "update_theme", "apply_theme_preset", "update_header", "update_footer", "create_blog_post_draft"]) {
      expect(names.has(name), name).toBe(false);
    }
  });

  it("sends schemas without what only a validator reads, keeping every key, option and bound the model needs", () => {
    const schema = z.toJSONSchema(z.object({
      pageId: z.uuid(), position: z.number().int().min(0).optional(), props: z.record(z.string(), z.unknown()),
      levels: z.array(z.enum(["h1", "h2"])), again: z.array(z.enum(["h1", "h2"])),
    }), { io: "input", reused: "ref" });
    const text = JSON.stringify(compactSchema(schema));
    expect(text).toContain('"pageId":{"type":"string","format":"uuid"}');
    expect(text).toContain('"position":{"type":"integer","minimum":0}');
    expect(text).not.toMatch(/9007199254740991|propertyNames|__schema/);
    expect(text).toContain('"enum":["h1","h2"]');
    expect(text).toContain('"required":["pageId","props","levels","again"]');
  });

  it("shows the model the exact keys, allowed values and an example for the inputs it most often gets wrong", () => {
    const tool = (name: string) => agentTools.find((entry) => entry.name === name)!;
    const shown = (name: string) => JSON.stringify(tool(name).input_schema);
    // Design: the real keys and options, not an opaque object.
    expect(shown("update_section_design")).toContain('"enum":["none","soft","medium","strong"]');
    expect(shown("update_section_design")).toContain('"paddingTop"');
    expect(shown("update_section_design")).toContain('"textColor"');
    // A shape that is spelled out in one tool is pointed to from the others, not sent again.
    expect(shown("update_footer")).toContain("update_section_design's design");
    expect(shown("create_page")).toContain("insert_section's customSection");
    expect(shown("update_blog_post_draft")).toContain("create_blog_post_draft");
    expect(shown("apply_theme_preset")).toContain('"enum":["compact","comfortable","spacious"]');
    expect(shown("update_theme")).toContain('"enum":["rounded","square","pill"]');
    expect(shown("update_theme")).toContain('"Playfair Display"');
    expect(shown("update_header")).toContain('"enum":["400","500","600","700"]');
    expect(shown("update_footer")).toContain('"enum":["columns","centered","compact"]');
    expect(shown("insert_section")).toContain('"enum":["24","32","48","64"]');
    for (const name of ["update_theme", "update_header", "update_footer", "update_section_props", "update_section_design", "insert_section",
      "create_page", "set_image", "plan", "report_progress", "create_blog_post_draft", "get_page", "get_section", "apply_theme_preset"]) {
      expect(tool(name).description, name).toMatch(/Example[^:]*: \{/);
    }
    // The examples are themselves valid input.
    for (const name of ["update_theme", "apply_theme_preset", "update_header", "update_footer", "plan", "report_progress", "get_site_settings"]) {
      const example = JSON.parse(tool(name).description!.slice(tool(name).description!.lastIndexOf("Example: ") + 9)) as unknown;
      expect(agentToolRegistry.find((entry) => entry.name === name)!.schema.safeParse(example).success, name).toBe(true);
    }
  });
});
