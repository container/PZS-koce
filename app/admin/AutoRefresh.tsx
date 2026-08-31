"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 2_000);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return <p aria-live="polite" style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: ".8rem" }}>Dnevnik se samodejno osvežuje vsaki 2 sekundi.</p>;
}
