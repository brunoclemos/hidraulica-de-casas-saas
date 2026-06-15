"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessao } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getSessao() ? "/dashboard" : "/login");
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center text-zinc-500">
      Carregando…
    </main>
  );
}
