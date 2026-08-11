"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSessionUser } from "@/lib/auth";

import { useEffect } from "react";

const USERS = [
  { id: 1, name: "Sharun", role: "admin", roleLabel: "Admin" },
  { id: 2, name: "Deepika", role: "inv_sup", roleLabel: "Inventory Supervisor" },
  { id: 3, name: "Narend", role: "operator", roleLabel: "Operator" },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUserId = localStorage.getItem("remembered_user_id");
      if (savedUserId) {
        const matched = USERS.find((u) => String(u.id) === String(savedUserId));
        if (matched) {
          setSelectedUser(matched);
          setRememberMe(true);
        }
      }
    }
  }, []);

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setError("");
    setPassword("");
    setForgotMsg("");
  };

  const handleBack = () => {
    setSelectedUser(null);
    setError("");
    setPassword("");
    setForgotMsg("");
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (typeof window !== "undefined") {
        if (rememberMe) {
          localStorage.setItem("remembered_user_id", selectedUser.id);
        } else {
          localStorage.removeItem("remembered_user_id");
        }
      }
      setSessionUser(selectedUser);
      router.push(selectedUser.role === "operator" ? "/shopfloor" : "/office");
    }, 600);
  };

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="dot"></span>
          <span>Zari Tracker v2</span>
        </div>
        <div className="card">
          {!selectedUser ? (
            <>
              <div className="section-title">Sign in</div>
              <div className="user-list">
                {USERS.map((u) => (
                  <button
                    key={u.id}
                    className="user-opt"
                    onClick={() => handleSelectUser(u)}
                  >
                    <span className="avatar">{getInitials(u.name)}</span>
                    <span>
                      <span className="name" style={{ display: "block" }}>
                        {u.name}
                      </span>
                      <span className="role">{u.roleLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="section-title" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Login as {selectedUser.name}</span>
                <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: "12px" }} onClick={handleBack}>
                  Back
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <span className="badge badge-success">{selectedUser.roleLabel}</span>
              </div>

              {forgotMsg && (
                <div className="banner banner-danger" style={{ marginBottom: "16px", padding: "10px", fontSize: "13px" }}>
                  {forgotMsg}
                </div>
              )}

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
                <div className="hint">For testing, you can type any password.</div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", marginTop: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", userSelect: "none", color: "var(--neutral-700)" }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setForgotMsg("Please contact Admin (Sharun) to reset your password.")}
                  style={{ background: "none", border: "none", color: "var(--accent-700)", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>

              {error && <div className="field-error-text" style={{ marginBottom: "14px" }}>{error}</div>}
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}
        </div>
        <div className="login-note">
          Security policy enforced. Next.js middleware guards are active.
          <br />
          Production integrates with <span className="num">Supabase Auth</span>.
        </div>
      </div>
    </div>
  );
}
