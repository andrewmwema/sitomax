import { createTemplate } from "./shared";

export const plumberTemplate = createTemplate({
  key: "plumber", name: "Plumbing",
  theme: { style: "classic", colors: { primary: "#1e3a5f", secondary: "#b08d57", background: "#ffffff", text: "#1c2b3a" } },
  hero: { design: "hero-split-image", heading: "Practical help for the place you call home", text: "A dripping tap, a fresh kitchen or a question about your plumbing. Tell {{businessName}} what you need in {{city}}." },
  services: { design: "services-image-cards", heading: "From everyday repairs to fresh starts", items: [
    { title: "Repairs & maintenance", icon: "wrench", text: "<p>Talk through leaks, worn fittings and the everyday jobs that need attention.</p>", image: "/samples/tools.jpg", imageAlt: "Sample plumbing tools" },
    { title: "Kitchen & bathroom", icon: "bath", text: "<p>Explore the practical details behind your plans for a more useful space.</p>", image: "/samples/kitchen.jpg", imageAlt: "Sample kitchen interior" },
    { title: "Project planning", icon: "ruler", text: "<p>Start with your ideas and work out what your property needs next.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample team discussing a project" },
  ] },
  about: { design: "about-image-right", heading: "A local approach to everyday work", text: "<p>{{businessName}} is based in {{city}}. We believe good work starts with listening, explaining the options and taking care over the details.</p><p>Tell us about your property and the changes you have in mind.</p>" },
  gallery: "gallery-grid", cta: "cta-dark-band", contact: "contact-form-split",
});
