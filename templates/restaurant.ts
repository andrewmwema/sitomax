import { createTemplate } from "./shared";

export const restaurantTemplate = createTemplate({
  key: "restaurant", name: "Restaurant",
  theme: { style: "classic", headingFont: "Lora", bodyFont: "Open Sans", colors: { primary: "#1d6a43", secondary: "#b98a2f", background: "#fdfdf9", text: "#1a2e22" } },
  hero: { design: "hero-overlay-photo", heading: "Make time for good company", text: "A table, a conversation and something to look forward to. Discover {{businessName}} in {{city}}." },
  services: { design: "services-icon-grid", heading: "Pull up a chair", items: [
    { title: "Around the table", icon: "utensils", text: "<p>Ask about our current menu and find something for your next visit.</p>", image: "/samples/kitchen.jpg", imageAlt: "Sample kitchen" },
    { title: "Something to celebrate", icon: "wine", text: "<p>Planning a get-together? Tell us the occasion and we can talk through the options.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample gathering space" },
    { title: "Before you visit", icon: "calendar", text: "<p>Check opening times, table availability and any dietary needs with the team.</p>", image: "/samples/home-exterior.jpg", imageAlt: "Sample welcoming exterior" },
  ] },
  about: { design: "about-two-column", heading: "Good company is always on the menu", text: "<p>{{businessName}} is a local restaurant in {{city}}. Our story is about the people who gather, the conversations that unfold and the small details of a shared meal.</p><p>Get in touch to ask about our current menu, opening times or your next visit.</p>" },
  gallery: "gallery-featured-project", cta: "cta-image-background", contact: "contact-visit-enquire",
});
