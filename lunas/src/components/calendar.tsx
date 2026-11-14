import Link from "next/link";
import type { DayMark } from "@/lib/cycle";
import type { LogView } from "@/lib/data";
import { addMonths, formatLong, formatMonth, monthGrid, type ISODate, type MonthKey } from "@/lib/dates";

export type CalendarMode = "yo" | "ella" | "ambas";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function kindClasses(m: DayMark | undefined, prefix: string): string[] {
  if (!m) return [];
  const c: string[] = [];
  if (m.period) c.push(`${prefix}-period`);
  else if (m.predictedPeriod) c.push(`${prefix}-pred`);
  if (m.ovulation) c.push(`${prefix}-ovu`);
  else if (m.fertile) c.push(`${prefix}-fertile`);
  return c;
}

function describe(m: DayMark | undefined, who: string): string[] {
  if (!m) return [];
  const parts: string[] = [];
  if (m.period) parts.push(`${who}: regla`);
  else if (m.predictedPeriod) parts.push(`${who}: regla prevista`);
  if (m.ovulation) parts.push(`${who}: ovulación estimada`);
  else if (m.fertile) parts.push(`${who}: día fértil`);
  return parts;
}

function hasContent(log: LogView | undefined): boolean {
  return Boolean(log && (log.flow || log.symptoms.length || log.moods.length || log.note));
}

export function Calendar({
  month,
  today,
  mode,
  me,
  partner,
  myLogs,
  partnerLogs,
  partnerName,
}: {
  month: MonthKey;
  today: ISODate;
  mode: CalendarMode;
  me: Map<ISODate, DayMark>;
  partner: Map<ISODate, DayMark> | null;
  myLogs: Map<ISODate, LogView>;
  partnerLogs: Map<ISODate, LogView>;
  partnerName: string | null;
}) {
  const cells = monthGrid(month);
  const q = (m: MonthKey) => `/calendario?mes=${m}&ver=${mode}`;
  const showMe = mode !== "ella";
  const showPartner = mode !== "yo" && partner !== null;

  return (
    <section className="calendar" aria-label={`Calendario de ${formatMonth(month)}`}>
      <header className="cal-head">
        <Link href={q(addMonths(month, -1))} className="icon-btn" aria-label="Mes anterior" scroll={false}>
          ‹
        </Link>
        <h2>{formatMonth(month)}</h2>
        <Link href={q(addMonths(month, 1))} className="icon-btn" aria-label="Mes siguiente" scroll={false}>
          ›
        </Link>
      </header>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-weekday" role="columnheader">
            {w}
          </span>
        ))}
        {cells.map(({ date, inMonth }) => {
          const classes = ["day"];
          if (!inMonth) classes.push("out");
          if (date === today) classes.push("today");
          if (date > today) classes.push("future");
          if (mode === "yo") classes.push(...kindClasses(me.get(date), "me"));
          if (mode === "ella" && partner) classes.push(...kindClasses(partner.get(date), "pa"));
          const dot =
            (mode === "yo" && hasContent(myLogs.get(date))) || (mode === "ella" && hasContent(partnerLogs.get(date)));
          const label = [
            formatLong(date),
            ...(showMe ? describe(me.get(date), "Tú") : []),
            ...(showPartner && partner ? describe(partner.get(date), partnerName ?? "Ella") : []),
          ].join(". ");
          const content = (
            <>
              <span className="num">{Number(date.slice(8))}</span>
              {mode === "ambas" && (
                <span className="bars" aria-hidden="true">
                  <i className={["bar", "bar-me", ...kindClasses(me.get(date), "b")].join(" ")} />
                  {partner && <i className={["bar", "bar-pa", ...kindClasses(partner.get(date), "b")].join(" ")} />}
                </span>
              )}
              {dot && <span className="log-dot" aria-hidden="true" />}
            </>
          );
          return date <= today ? (
            <Link key={date} href={`/registro?fecha=${date}`} className={classes.join(" ")} aria-label={label} role="gridcell">
              {content}
            </Link>
          ) : (
            <span key={date} className={classes.join(" ")} aria-label={label} role="gridcell">
              {content}
            </span>
          );
        })}
      </div>
    </section>
  );
}

export function CalendarLegend({ mode, partnerName, showFertile }: { mode: CalendarMode; partnerName: string | null; showFertile: boolean }) {
  const who = partnerName ?? "Ella";
  if (mode === "ambas") {
    return (
      <ul className="legend">
        <li>
          <i className="lg lg-bar-me" /> Tu regla
        </li>
        <li>
          <i className="lg lg-bar-pa" /> Regla de {who}
        </li>
        <li>
          <i className="lg lg-bar-pred" /> Prevista
        </li>
        {showFertile && (
          <li>
            <i className="lg lg-bar-fertile" /> Días fértiles
          </li>
        )}
      </ul>
    );
  }
  const tone = mode === "yo" ? "me" : "pa";
  return (
    <ul className="legend">
      <li>
        <i className={`lg lg-${tone}-period`} /> Regla
      </li>
      <li>
        <i className={`lg lg-${tone}-pred`} /> Prevista
      </li>
      {showFertile && (
        <>
          <li>
            <i className="lg lg-fertile" /> Fértil (estimado)
          </li>
          <li>
            <i className="lg lg-ovu" /> Ovulación
          </li>
        </>
      )}
      <li>
        <i className="lg lg-dot" /> Con registro
      </li>
    </ul>
  );
}
