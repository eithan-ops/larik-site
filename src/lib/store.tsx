"use client";
/**
 * LARIK — סטור צד-לקוח (גרסת דמו/פיילוט)
 * נשמר ב-localStorage. בגרסת הפרודקשן יוחלף ב-Supabase/Postgres —
 * הממשק (join / purchase / state) נשאר זהה, רק המימוש מתחלף.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { splitCommission, SplitResult } from "./split";

export interface Tx {
  label: string;
  amount: number; // אגורות
  status: "released" | "pending";
  ts: number;
}
export interface FeedItem {
  text: string;
  gen: string;
  amount: number;
  color: string;
}
export interface LarikState {
  nickname: string;
  code: string;
  avail: number; // אגורות זמינות
  pending: number; // אגורות בהמתנה (חלון ביטולים)
  lifetime: number;
  monthly: number;
  chainLength: number; // כמה אבות מעליי
  networkSize: number;
  feed: FeedItem[];
  txs: Tx[];
}

const DEFAULT_STATE: LarikState = {
  nickname: "",
  code: "",
  avail: 6240,
  pending: 2130,
  lifetime: 41200,
  monthly: 13742,
  chainLength: 3,
  networkSize: 13,
  feed: [
    { text: "@daniel קנה פיצה 🍕", gen: "טבעת 1", amount: 353, color: "#7c5cff" },
    { text: "@noam קנה אוזניות 🎧", gen: "טבעת 2", amount: 177, color: "#ff5c8a" },
    { text: "כוכב בטבעת 3 קנה 👟", gen: "טבעת 3", amount: 88, color: "#2dd4bf" },
  ],
  txs: [
    { label: "קאשבק — פיצה עגבניה", amount: 1325, status: "released", ts: Date.now() - 86400000 },
    { label: "טבעת 1 — @daniel קנה", amount: 353, status: "released", ts: Date.now() - 172800000 },
    { label: "קאשבק — SoundPro", amount: 1660, status: "pending", ts: Date.now() - 3600000 },
    { label: "פרס ליגה — מקום 3", amount: 10000, status: "released", ts: Date.now() - 604800000 },
  ],
};

interface Ctx {
  state: LarikState;
  joined: boolean;
  join: (nickname: string, invite: string) => void;
  purchase: (commissionAgorot: number, label: string) => SplitResult;
  toast: string;
  showToast: (m: string) => void;
}

const LarikCtx = createContext<Ctx | null>(null);

export function LarikProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LarikState>(DEFAULT_STATE);
  const [joined, setJoined] = useState(false);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("larik");
      if (raw) {
        const s = JSON.parse(raw) as LarikState;
        setState(s);
        setJoined(!!s.nickname);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded && state.nickname) localStorage.setItem("larik", JSON.stringify(state));
  }, [state, loaded]);

  function join(nickname: string, invite: string) {
    const code = (nickname.replace(/[^a-zA-Z0-9א-ת]/g, "").slice(0, 6) || "LARIK").toUpperCase() + "-" + Math.floor(10 + Math.random() * 89);
    setState((s) => ({ ...s, nickname, code }));
    setJoined(true);
  }

  function purchase(commissionAgorot: number, label: string): SplitResult {
    const r = splitCommission(commissionAgorot, state.chainLength);
    setState((s) => ({
      ...s,
      pending: s.pending + r.driver,
      monthly: s.monthly + r.driver,
      lifetime: s.lifetime + r.driver,
      txs: [{ label, amount: r.driver, status: "pending" as const, ts: Date.now() }, ...s.txs],
    }));
    return r;
  }

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2800);
  }

  return (
    <LarikCtx.Provider value={{ state, joined, join, purchase, toast, showToast }}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </LarikCtx.Provider>
  );
}

export function useLarik() {
  const ctx = useContext(LarikCtx);
  if (!ctx) throw new Error("useLarik must be used inside LarikProvider");
  return ctx;
}

export const fmtIls = (agorot: number) => "₪" + (agorot / 100).toFixed(2);
