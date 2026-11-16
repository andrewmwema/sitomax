import { createTemplate } from "./shared";

export const salonTemplate = createTemplate({
  key: "salon", name: "Salon",
  theme: { style: "modern", headingFont: "Playfair Display", bodyFont: "Lato", colors: { primary: "#6d2857", secondary: "#a8784f", background: "#fffbfd", text: "#331627" } },
  hero: { design: "hero-centered-badge", heading: "A little time for you", text: "A fresh look begins with a conversation. Explore your ideas with {{businessName}} in {{city}}." },
  services: { design: "services-bordered-grid", heading: "Find your next feel-good moment", items: [
    { title: "Cut & shape", icon: "scissors", text: "<p>Explore a shape that suits your routine, your texture and the way you like to feel.</p>", image: "/samples/happy-customer.jpg", imageAlt: "Sample customer photograph" },
    { title: "Colour consultation", icon: "sparkles", text: "<p>Bring your inspiration and talk through the options before making a change.</p>", image: "/samples/team-at-work.jpg", imageAlt: "Sample conversation about a project" },
    { title: "Finishing touches", icon: "flower", text: "<p>From an everyday refresh to an occasion, let us know what you have in mind.</p>", image: "/samples/home-interior.jpg", imageAlt: "Sample welcoming interior" },
  ] },
  about: { design: "about-centered-statement", heading: "Space to pause. Room to be yourself.", text: "<p>{{businessName}} is a salon in {{city}}, built around a simple idea: your appointment should feel personal.</p><p>Share what you like, what you would change and how you want to feel. We will take the conversation from there.</p>" },
  gallery: "gallery-masonry", cta: "cta-primary-band", contact: "contact-form-centered",
});
