import { signInWithGoogle } from "@/lib/actions";
import type { CycleStatus } from "@/lib/cycle";
import { FLOWS, MOODS, PHASES, SYMPTOMS } from "@/lib/constants";
import type { LogView } from "@/lib/data";
import { diffDays, formatShort } from "@/lib/dates";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="logo">
      <defs>
        <radialGradient id="lg-bg" cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#4a2c5a" />
          <stop offset="1" stopColor="#1f1428" />
        </radialGradient>
        <mask id="lg-m1">
          <rect width="512" height="512" fill="#fff" />
          <circle cx="262" cy="228" r="118" fill="#000" />
        </mask>
        <mask id="lg-m2">
          <rect width="512" height="512" fill="#fff" />
          <circle cx="250" cy="228" r="118" fill="#000" />
        </mask>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#lg-bg)" />
      <circle cx="190" cy="256" r="132" fill="#ff7a9c" mask="url(#lg-m1)" />
      <circle cx="322" cy="256" r="132" fill="#a68bff" mask="url(#lg-m2)" />
      <path
        d="M256 318c-30-22-52-40-52-63 0-15 12-27 27-27 11 0 20 6 25 15 5-9 14-15 25-15 15 0 27 12 27 27 0 23-22 41-52 63Z"
        fill="#fff"
      />
    </svg>
  );
}

export function Avatar({ name, image, size = 40, tone = "me" }: { name: string; image: string | null; size?: number; tone?: "me" | "partner" }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} className={`avatar avatar-${tone}`} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`avatar avatar-${tone} avatar-letter`} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function GoogleButton({ redirectTo = "/inicio", label = "Continuar con Google" }: { redirectTo?: string; label?: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className="btn btn-google">
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
        </svg>
        {label}
      </button>
    </form>
  );
}

/** Anillo del ciclo: regla, días fértiles y el día de hoy. */
export function CycleRing({ status, tone = "me", size = 220 }: { status: CycleStatus; tone?: "me" | "partner"; size?: number }) {
  const r = 86;
  const C = 2 * Math.PI * r;
  const hasCycle = status.hasData && !status.stale && status.cycleDay !== null && status.lastPeriod;
  const total = hasCycle ? Math.max(status.stats.cycleLength, status.cycleDay ?? 0) : 28;
  const seg = (fromDay: number, toDay: number) => {
    const a = Math.max(1, fromDay);
    const b = Math.min(total, toDay);
    if (b < a) return null;
    const len = ((b - a + 1) / total) * C;
    const offset = -((a - 1) / total) * C;
    return { strokeDasharray: `${Math.max(len - 2, 1)} ${C}`, strokeDashoffset: offset };
  };

  let periodSeg = null;
  let fertileSeg = null;
  let marker = null;
  if (hasCycle && status.lastPeriod) {
    const start = status.lastPeriod.start;
    const periodDays = diffDays(start, status.lastPeriod.ongoing ? status.lastPeriod.expectedEnd : status.lastPeriod.end) + 1;
    periodSeg = seg(1, periodDays);
    if (status.fertileStart && status.fertileEnd) {
      fertileSeg = seg(diffDays(start, status.fertileStart) + 1, diffDays(start, status.fertileEnd) + 1);
    }
    const angle = (((status.cycleDay ?? 1) - 0.5) / total) * 2 * Math.PI - Math.PI / 2;
    marker = { x: 110 + r * Math.cos(angle), y: 110 + r * Math.sin(angle) };
  }

  let big = "—";
  let small = "Sin datos";
  if (hasCycle) {
    big = String(status.cycleDay);
    small = status.lateDays > 0 ? `${status.lateDays} ${status.lateDays === 1 ? "día" : "días"} de retraso` : status.phase ? PHASES[status.phase].short : "";
  } else if (status.stale) {
    small = "Sin datos recientes";
  }

  return (
    <div className={`ring ring-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={hasCycle ? `Día ${big} del ciclo. ${small}` : small}>
        <g transform="rotate(-90 110 110)">
          <circle cx="110" cy="110" r={r} className="ring-track" />
          {fertileSeg && <circle cx="110" cy="110" r={r} className="ring-fertile" style={fertileSeg} />}
          {periodSeg && <circle cx="110" cy="110" r={r} className="ring-period" style={periodSeg} />}
        </g>
        {marker && <circle cx={marker.x} cy={marker.y} r="11" className="ring-marker" />}
      </svg>
      <div className="ring-center">
        {hasCycle && <span className="ring-label">Día</span>}
        <span className="ring-big">{big}</span>
        <span className="ring-small">{small}</span>
      </div>
    </div>
  );
}

/** Frase corta sobre la próxima regla. */
export function nextPeriodText(status: CycleStatus, who: "tú" | "ella"): string {
  if (!status.hasData) return who === "tú" ? "Registra tu última regla para empezar." : "Todavía no ha registrado ninguna regla.";
  if (status.stale) return who === "tú" ? "Hace mucho que no registras tu regla." : "Hace tiempo que no registra su regla.";
  if (status.onPeriod) {
    const day = status.periodDay ?? 1;
    return `${who === "tú" ? "Estás con la regla" : "Está con la regla"} · día ${day}`;
  }
  if (status.lateDays > 0) {
    return `${who === "tú" ? "Tu" : "Su"} regla se esperaba el ${formatShort(status.nextStart!)} (${status.lateDays} ${status.lateDays === 1 ? "día" : "días"} de retraso)`;
  }
  const n = status.daysUntilNext ?? 0;
  const when = n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`;
  return `${who === "tú" ? "Tu" : "Su"} próxima regla: ${when} · ${formatShort(status.nextStart!)}`;
}

export function LogChips({ log, showNote = true }: { log: LogView | undefined; showNote?: boolean }) {
  if (!log) return null;
  const flow = FLOWS.find((f) => f.id === log.flow);
  const symptoms = SYMPTOMS.filter((s) => log.symptoms.includes(s.id));
  const moods = MOODS.filter((m) => log.moods.includes(m.id));
  if (!flow && !symptoms.length && !moods.length && !(showNote && log.note)) return null;
  return (
    <div className="log-chips">
      <div className="chips static">
        {flow && <span className="chip chip-flow">{"💧".repeat(Math.max(1, flow.drops))} {flow.label}</span>}
        {moods.map((m) => (
          <span key={m.id} className="chip">
            {m.emoji} {m.label}
          </span>
        ))}
        {symptoms.map((s) => (
          <span key={s.id} className="chip">
            {s.emoji} {s.label}
          </span>
        ))}
      </div>
      {showNote && log.note && <p className="note">“{log.note}”</p>}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="disclaimer">
      Las predicciones son estimaciones basadas en tus ciclos anteriores. No son un método anticonceptivo ni sustituyen
      el consejo de una profesional sanitaria.
    </p>
  );
}
