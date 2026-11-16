import { puckConfig, type PuckConfig } from "@/lib/puck/config";
import { EMBED_TYPE } from "@/lib/layout/embed";
import { ELEMENT_TYPES } from "@/lib/layout/structure";

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

/** Editor config for the current user (Embed is super-admin only). */
export function editorConfig(isSuperAdmin: boolean): PuckConfig {
  return isSuperAdmin ? puckConfig : clientConfig;
}
