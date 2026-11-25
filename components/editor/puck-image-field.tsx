"use client";

import { useGetPuck } from "@puckeditor/core";
import { ImageUploadField } from "./image-upload-field";
import { replaceImage } from "@/lib/editor/media";
import { aiImageSuggestion } from "@/lib/editor/ai-image-suggestions";
import type { MediaImage } from "@/lib/media";

export function PuckImageField({ name, value, onChange, readOnly }: {
  name: string; value: string; onChange: (value: string) => void; readOnly?: boolean;
}) {
  const getPuck = useGetPuck();
  const current = getPuck().selectedItem;
  const heading = current?.props.heading || current?.props.title;
  const query = typeof heading === "string" ? heading.replace(/<[^>]*>|\[[^\]]*\]/g, "").trim().slice(0, 100) : undefined;
  const suggestion = aiImageSuggestion(current?.props, name);
  function select(image: MediaImage) {
    const { selectedItem, appState, dispatch } = getPuck();
    if (readOnly || getPuck().getPermissions({ item: selectedItem }).edit === false) throw new Error("This image is read-only.");
    if (selectedItem?.props.id !== current?.props.id) throw new Error("The selected block changed. Please reopen its image picker.");
    if (selectedItem && appState.ui.itemSelector) {
      dispatch({ type: "replace", destinationIndex: appState.ui.itemSelector.index,
        destinationZone: appState.ui.itemSelector.zone ?? "root:default-zone",
        data: { ...selectedItem, props: { ...selectedItem.props, ...replaceImage(selectedItem.props, name, image) } }, recordHistory: true });
    } else {
      dispatch({ type: "setData", data: { ...appState.data, root: {
        ...appState.data.root, props: replaceImage(appState.data.root.props ?? {}, name, image),
      } }, recordHistory: true });
    }
  }
  return <ImageUploadField value={value} onChange={onChange} onSelect={select} readOnly={readOnly}
    initialQuery={query} aiSuggestion={suggestion} />;
}
