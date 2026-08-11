"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getSessionUser();
    if (user) {
      router.push(user.role === "operator" ? "/shopfloor" : "/office");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div className="small muted">Verifying session...</div>
    </div>
  );
}
