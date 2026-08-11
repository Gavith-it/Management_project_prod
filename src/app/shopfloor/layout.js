"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Topbar from "@/components/Topbar";

export default function ShopfloorLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const activeUser = getSessionUser();
    if (!activeUser) {
      router.push("/login");
    } else if (activeUser.role !== "operator") {
      router.push("/office");
    } else {
      setUser(activeUser);
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div className="small muted">Loading operator terminal...</div>
      </div>
    );
  }

  return (
    <div className="sf-shell">
      <Topbar user={user} />
      <div className="sf-idle-note">Auto sign-out after 5 minutes idle — shared device</div>
      <div className="sf-main">{children}</div>
    </div>
  );
}
