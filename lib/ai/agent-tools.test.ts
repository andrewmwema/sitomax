import { describe, expect, it } from "vitest";
import { z } from "zod";
import { agentToolRegistry, agentTools } from "./agent-tools";

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
  if (!schema.type && !("const" in schema) && !("enum" in schema)) {
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
    expect(agentTools).toHaveLength(agentToolRegistry.length);
    let totalBytes = 0;
    for (const tool of agentToolRegistry) {
      const schema = z.toJSONSchema(tool.schema, { io: "input", reused: "ref" });
      totalBytes += JSON.stringify(schema).length;
      expect(schema.type, tool.name).toBe("object");
      assertTypedSchema(schema, schema, tool.name);
      expect(agentTools.find((registered) => registered.name === tool.name)?.strict).toBe(false);
    }
    expect(totalBytes).toBeLessThan(60_000);
  });
});
