"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSessionUser } from "@/lib/auth";
import Icon from "./Icons";

const OFFICE_NAV = [
  { path: "/office", label: "Dashboard", icon: "home" },
  { path: "/office/masters", label: "Masters", icon: "gear" },
  { path: "/office/purchases", label: "Purchases", icon: "box" },
  { path: "/office/warping", label: "Warping", icon: "clipboard" },
  { path: "/office/rewind", label: "Rewinding & Pirn Winding", icon: "undo" },
  { path: "/office/stocktake", label: "Stock take", icon: "check" },
  { path: "/office/reports", label: "Reports", icon: "file" }
];

export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearSessionUser();
    router.push("/login");
  };

  const getInitials = (name) => {
    if (!name) return "";
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const checkActive = (itemPath) => {
    if (itemPath === "/office") {
      return pathname === "/office";
    }
    return pathname.startsWith(itemPath);
  };

  return (
    <div className="office-sidebar">
      {/* Brand logo & title block */}
      <div className="office-brand-wrap">
        <div className="office-brand-logo">
          <img src="/logo.png" alt="Maradi ERP" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
        </div>
        <div className="office-brand-text">
          <span className="title">Maradi ERP</span>
          <span className="sub">Zari Management System</span>
        </div>
      </div>

      <div className="office-nav" style={{ marginTop: "10px" }}>
        {OFFICE_NAV.map((n) => {
          const active = checkActive(n.path);
          return (
            <Link key={n.path} href={n.path} style={{ textDecoration: "none" }}>
              <button className={active ? "active" : ""}>
                <Icon name={n.icon} size={17} />
                <span>{n.label}</span>
              </button>
            </Link>
          );
        })}
      </div>

      <div className="office-footer">
        {user && (
          <div className="role-pill">
            <span className="avatar">{getInitials(user.name)}</span>
            <span className="who">
              <span className="name">{user.name}</span>
              <span className="role">{user.roleLabel}</span>
            </span>
          </div>
        )}
        <button className="logout-btn" onClick={handleLogout}>
          <Icon name="logout" size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
