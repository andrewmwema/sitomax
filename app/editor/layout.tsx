import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// no-external variant: the default puck.css @imports a remote font
// stylesheet (rsms.me Inter), which leaks a third-party request and
// breaks html-to-image thumbnail capture. Fonts come from next/font.
import "@puckeditor/core/no-external.css";

/**
 * Auth gate for the full-screen editor. Dynamic auth access lives inside
 * the Suspense boundary, as required by cacheComponents.
 */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <EditorGate>{children}</EditorGate>
    </Suspense>
  );
}

async function EditorGate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
