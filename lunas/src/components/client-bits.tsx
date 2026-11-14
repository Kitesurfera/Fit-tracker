"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Guarda la zona horaria del navegador en una cookie para que "hoy" sea tu hoy. */
export function TimezoneSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);
  return null;
}

const NAV = [
  { href: "/inicio", label: "Hoy", icon: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" },
  { href: "/calendario", label: "Calendario", icon: "M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" },
  {
    href: "/companera",
    label: "Compañera",
    icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8",
  },
  {
    href: "/ajustes",
    label: "Ajustes",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z",
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/calendario" && pathname.startsWith("/registro"));
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Botones para copiar o compartir el enlace de invitación. */
export function ShareInvite({ code, inviterName }: { code: string; inviterName: string }) {
  const [url, setUrl] = useState(`/invitacion/${code}`);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/invitacion/${code}`);
    setCanShare(typeof navigator.share === "function");
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", url);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Lunas",
        text: `${inviterName} te invita a compartir vuestros ciclos en Lunas 🌙`,
        url,
      });
    } catch {
      /* cancelado */
    }
  }

  return (
    <div className="share-invite">
      <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
      <div className="row gap">
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
        {canShare && (
          <button type="button" className="btn btn-soft" onClick={share}>
            Compartir…
          </button>
        )}
        <a
          className="btn btn-soft"
          href={`https://wa.me/?text=${encodeURIComponent(`${inviterName} te invita a compartir vuestros ciclos en Lunas 🌙 ${url}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
