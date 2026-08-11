"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSessionUser } from "@/lib/auth";

const USERS = [
  { id: 1, name: "Asha Rao", role: "admin", roleLabel: "Admin" },
  { id: 2, name: "Manoj Iyer", role: "inv_sup", roleLabel: "Inventory Supervisor" },
  { id: 3, name: "Ravi Kumar", role: "operator", roleLabel: "Operator" },
  { id: 4, name: "Divya Shah", role: "viewer", roleLabel: "Viewer" },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setError("");
    setPassword("");
  };

  const handleBack = () => {
    setSelectedUser(null);
    setError("");
    setPassword("");
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    // Mock verification (accepts 'password' or any characters for demo purposes)
    setTimeout(() => {
      setLoading(false);
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
