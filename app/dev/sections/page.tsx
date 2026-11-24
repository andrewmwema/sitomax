import { notFound } from "next/navigation";
import { SectionsShowcase } from "@/components/dev/sections-showcase";

export default function SectionsShowcasePage() {
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "preview") notFound();
  return <SectionsShowcase />;
}
