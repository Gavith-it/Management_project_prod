"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { clearSessionUser } from "@/lib/auth";
import Icon from "./Icons";

export default function Topbar({ user }) {
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

  return (
    <div className="sf-topbar">
      <div className="who">
        <span className="avatar">{getInitials(user?.name)}</span>
        <div>
          <div className="name">{user?.name}</div>
          <div className="role">{user?.roleLabel}</div>
        </div>
      </div>
      <button className="sf-logout" onClick={handleLogout}>
        <Icon name="logout" size={17} />
        <span>Sign out</span>
      </button>
    </div>
  );
}
