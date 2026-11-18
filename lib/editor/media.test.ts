import { describe, expect, it } from "vitest";
import { cleanPhotoCredits, replaceImage } from "./media";

const old = "https://images.unsplash.com/old";
const other = "https://images.unsplash.com/other";
describe("media selection in block props", () => {
  it("updates nested gallery URLs and alt text, removing only the replaced credit", () => {
    const props = { images: [{ url: old, alt: "Old" }, { url: other, alt: "Other" }],
      photoCredits: [{ url: old }, { url: other }] };
    expect(replaceImage(props, "images[0].url", { url: "/storage/new.jpg", alt: "Tools" })).toEqual({
      images: [{ url: "/storage/new.jpg", alt: "Tools" }, { url: other, alt: "Other" }], photoCredits: [{ url: other }],
    });
    expect(props.images[0].url).toBe(old);
  });
  it("retains a credit when another field still uses its image", () => {
    const props = { image: old, secondaryImage: old, photoCredits: [{ url: old }] };
    expect(replaceImage(props, "image", { url: "/new.jpg", alt: "New" }).photoCredits).toEqual([{ url: old }]);
  });
  it("fills optional alt fields, handles image elements, and never overwrites partner names", () => {
    expect(replaceImage({ backgroundImage: old }, "backgroundImage", { url: "/new.jpg", alt: "Team" }))
      .toEqual({ backgroundImage: "/new.jpg", backgroundImageAlt: "Team" });
    expect(replaceImage({ src: old, alt: "" }, "src", { url: "/new.jpg", alt: "Tools" }).alt).toBe("Tools");
    const updated = replaceImage({ logos: [{ name: "Partner", image: old }] }, "logos[0].image", { url: "/new.jpg", alt: "Logo" });
    expect(updated.logos).toEqual([{ name: "Partner", image: "/new.jpg", imageAlt: "Logo" }]);
  });
  it("cleans credits after decorative backgrounds change and rejects unsafe/missing paths", () => {
    expect(cleanPhotoCredits({ design: { background: { images: ["/new.jpg"] } }, photoCredits: [{ url: old }] }).photoCredits).toEqual([]);
    expect(() => replaceImage({}, "__proto__.url", { url: "/new", alt: "" })).toThrow("Invalid image field");
    expect(() => replaceImage({}, "images[0].url", { url: "/new", alt: "" })).toThrow("no longer available");
  });
});
