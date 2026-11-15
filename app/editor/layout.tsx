import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import "@puckeditor/core/puck.css";

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
