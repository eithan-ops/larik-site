"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app", ic: "🛍️", label: "דילים" },
  { href: "/app/galaxy", ic: "🪐", label: "הגלקסיה" },
  { href: "/app/league", ic: "🏆", label: "ליגה" },
  { href: "/app/wallet", ic: "💚", label: "ארנק" },
  { href: "/app/business", ic: "🏪", label: "לעסקים" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""}>
          <span className="ic">{t.ic}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
