import { puckConfig, type PuckConfig } from "@/lib/puck/config";
import { EMBED_TYPE } from "@/lib/layout/embed";
import { ELEMENT_TYPES } from "@/lib/layout/structure";
import { linkContextFrom, resolveDataLinks } from "@/lib/links";
import type { ComponentConfig, PuckContext } from "@puckeditor/core";

const { Column, Embed } = puckConfig.components;

/**
 * Clients may see, move or remove an agency embed — never add, duplicate
 * or edit one. This is UX only: the updatePage action and the
 * guard_page_embeds trigger enforce the same rule server-side.
 */
const clientConfig: PuckConfig = {
  ...puckConfig,
  categories: {
    ...Object.fromEntries(
      Object.entries(puckConfig.categories ?? {}).map(([key, category]) => [
        key,
        { ...category, components: category.components?.filter((type) => type !== EMBED_TYPE) },
      ]),
    ),
    // Uncategorized components would show under "Other"; keep Embed hidden.
    agencyOnly: { title: "Agency only", components: [EMBED_TYPE], visible: false },
  },
  components: {
    ...puckConfig.components,
    Column: {
      ...Column,
      fields: {
        ...Column.fields,
        content: {
          type: "slot",
          allow: ELEMENT_TYPES.filter((type) => type !== EMBED_TYPE),
        },
      } as typeof Column.fields,
    },
    Embed: {
      ...Embed,
      permissions: { edit: false, duplicate: false, insert: false },
    },
  },
};

/**
 * Resolves typed page links against `metadata.siteLinks` before each block
 * renders, so blocks show current slugs in the canvas. The public renderer
 * does the same pre-pass over the page data instead.
 */
function withLinkResolution(config: PuckConfig): PuckConfig {
  const components = Object.fromEntries(Object.entries(config.components).map(([type, component]) => {
    // Puck's per-component render props are generic; this wrapper is prop-agnostic.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = component as ComponentConfig<any>;
    return [type, {
      ...original,
      render: (props: Record<string, unknown> & { puck: PuckContext }) => {
        const context = linkContextFrom(props.puck?.metadata);
        if (!context) return original.render(props as Parameters<typeof original.render>[0]);
        const { puck, ...rest } = props;
        return original.render({ ...resolveDataLinks(rest, context, { richText: false }), puck } as Parameters<typeof original.render>[0]);
      },
    }];
  }));
  return { ...config, components } as unknown as PuckConfig;
}

const superAdminEditorConfig = withLinkResolution(puckConfig);
const clientEditorConfig = withLinkResolution(clientConfig);

/** Editor config for the current user (Embed is super-admin only). */
export function editorConfig(isSuperAdmin: boolean): PuckConfig {
  return isSuperAdmin ? superAdminEditorConfig : clientEditorConfig;
}
