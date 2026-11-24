import { notFound } from "next/navigation";
import { SectionsShowcase } from "@/components/dev/sections-showcase";

export default function SectionsShowcasePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SectionsShowcase />;
}
