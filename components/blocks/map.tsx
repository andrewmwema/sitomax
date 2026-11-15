import type { ComponentConfig } from "@puckeditor/core";

export type MapProps = {
  address: string;
  heading: string;
};

export const Map: ComponentConfig<MapProps> = {
  label: "Map",
  fields: {
    heading: { type: "text", label: "Heading", contentEditable: true },
    address: { type: "text", label: "Address", placeholder: "123 Main St, Springfield" },
  },
  defaultProps: {
    heading: "Find us",
    address: "",
  },
  render: ({ heading, address }) => (
    <section className="w-full" style={{ backgroundColor: "var(--color-background)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 md:py-16">
        {heading ? (
          <h2
            className="text-center text-3xl font-bold"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
          >
            {heading}
          </h2>
        ) : null}
        {address ? (
          <iframe
            title={`Map of ${address}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
            className="h-80 w-full rounded-2xl border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div
            className="flex h-80 w-full items-center justify-center rounded-2xl text-sm opacity-60"
            style={{
              background: "color-mix(in srgb, var(--color-text) 8%, var(--color-background))",
              color: "var(--color-text)",
            }}
          >
            Enter an address to show the map
          </div>
        )}
      </div>
    </section>
  ),
};
