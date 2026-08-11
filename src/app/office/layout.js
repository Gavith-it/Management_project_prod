"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default function OfficeLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState("Zari Tracker");

  useEffect(() => {
    const activeUser = getSessionUser();
    if (!activeUser) {
      router.push("/login");
    } else if (activeUser.role === "operator") {
      router.push("/shopfloor");
    } else {
      setUser(activeUser);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const getPageTitle = () => {
      if (pathname === "/office") return "Dashboard";
      if (pathname.startsWith("/office/masters")) return "Masters";
      if (pathname.startsWith("/office/purchases")) return "Purchases";
      if (pathname.startsWith("/office/warping")) return "Warping";
      if (pathname.startsWith("/office/rewind")) return "Rewinding & Pirn Winding";
      if (pathname.startsWith("/office/stocktake")) return "Stock take";
      if (pathname.startsWith("/office/reports")) return "Reports";
      return "Zari Tracker";
    };
    setPageTitle(getPageTitle());
  }, [pathname]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div className="small muted">Loading administrative portal...</div>
      </div>
    );
  }

  return (
    <div className="office-shell">
      <Sidebar user={user} />
      <div className="office-main">
        {/* Sticky top header bar */}
        <div className="office-top-header">
          <div className="office-top-header-left">
            <button className="office-top-header-hamburger">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <span>{pageTitle}</span>
          </div>
          <div className="office-top-header-role-badge">
            {user?.roleLabel || "Viewer"}
          </div>
        </div>

        {/* Content area */}
        <div className="office-content-area">
          {children}
        </div>
      </div>
    </div>
  );
}
