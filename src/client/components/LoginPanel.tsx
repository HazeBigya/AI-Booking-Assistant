"use client";

import { useEffect, useState } from "react";
import { getSession, logout, requestOtp, verifyOtp, type SessionUser } from "@client/api/auth";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function LoginPanel() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSession().then((r) => setMe(r.session)).catch(() => {});
  }, []);

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      await requestOtp(email);
      setStep("code");
      setMsg("Code sent — in dev it's printed to the server console.");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await verifyOtp(email, code);
      setMe({ name: r.name, email: r.email });
      setOpen(false);
      setStep("email");
      setCode("");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await logout();
    setMe(null);
  }

  if (me) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">{me.name}</span>
        <button onClick={signOut} className="text-blue-600">
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="relative text-xs">
      <button onClick={() => setOpen((o) => !o)} className="text-blue-600">
        Log in
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-64 space-y-2 rounded-lg border bg-white p-3 text-left shadow">
          {step === "email" ? (
            <>
              <input
                className="w-full rounded border px-2 py-1"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                disabled={busy}
                onClick={sendCode}
                className="w-full rounded bg-blue-600 py-1 text-white disabled:opacity-50"
              >
                Send code
              </button>
            </>
          ) : (
            <>
              <input
                className="w-full rounded border px-2 py-1"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                disabled={busy}
                onClick={confirm}
                className="w-full rounded bg-blue-600 py-1 text-white disabled:opacity-50"
              >
                Verify
              </button>
            </>
          )}
          {msg && <p className="text-slate-500">{msg}</p>}
        </div>
      )}
    </div>
  );
}
