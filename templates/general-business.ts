import { createTemplate } from "./shared";

export const generalBusinessTemplate = createTemplate({
  key: "general-business", name: "Local business",
  theme: { style: "modern", colors: { primary: "#0369a1", secondary: "#0d9488", background: "#ffffff", text: "#0f172a" } },
  hero: { design: "hero-stats-row", heading: "Your next idea deserves a thoughtful start", text: "Practical help, a fresh perspective and room for your questions. Meet {{businessName}}, local to {{city}}." },
  services: { design: "services-alternating-rows", heading: "A little guidance. A clear way forward.", items: [
    { title: "Explore the possibilities", icon: "lightbulb", text: "<p>Bring your ideas and questions so we can understand what matters to you.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample team planning together" },
    { title: "Make a practical plan", icon: "ruler", text: "<p>Work through the options and find a starting point that suits your needs.</p>", image: "/samples/tools.jpg", imageAlt: "Sample workspace and tools" },
    { title: "Consider the details", icon: "sparkles", text: "<p>Talk through the finishing touches and what happens next.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample finished interior" },
  ] },
  about: { design: "about-image-right", heading: "Local people. A considered approach.", text: "<p>{{businessName}} is based in {{city}}. We are here to listen, share a practical perspective and help you find a useful next step.</p><p>Good work starts with a good conversation. Tell us what you have in mind.</p>" },
  gallery: "gallery-masonry", cta: "cta-split-form", contact: "contact-form-split",
});
