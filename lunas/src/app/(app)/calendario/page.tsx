import Link from "next/link";
import type { Metadata } from "next";
import { Calendar, CalendarLegend, type CalendarMode } from "@/components/calendar";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Disclaimer } from "@/components/ui";
import { deletePeriod, savePeriod } from "@/lib/actions";
import { resolvePeriod } from "@/lib/cycle";
import { getPartnerDoc, loadLogs, loadPerson, personMarks } from "@/lib/data";
import { diffDays, formatShort, formatShortSmart, isMonthKey, monthGrid, monthOf } from "@/lib/dates";
import { getToday, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const today = await getToday();
  const partnerDoc = await getPartnerDoc(user);

  const month = isMonthKey(params.mes) ? params.mes : monthOf(today);
  const requested = typeof params.ver === "string" ? params.ver : "";
  let mode: CalendarMode = requested === "yo" || requested === "ella" || requested === "ambas" ? requested : partnerDoc ? "ambas" : "yo";
  if (!partnerDoc) mode = "yo";

  const cells = monthGrid(month);
  const from = cells[0].date;
  const to = cells[cells.length - 1].date;

  const [me, partner, myLogs, partnerLogs] = await Promise.all([
    loadPerson(user, today, false),
    partnerDoc ? loadPerson(partnerDoc, today, true) : Promise.resolve(null),
    loadLogs(user, false, from, to),
    partnerDoc ? loadLogs(partnerDoc, true, from, to) : Promise.resolve(new Map()),
  ]);

  const myMarks = personMarks(me, today, from, to);
  const partnerMarks = partner ? personMarks(partner, today, from, to) : null;
  const { stats } = me.status;
  const history = [...me.periods].reverse();
  const tab = (m: CalendarMode) => `/calendario?mes=${month}&ver=${m}`;

  return (
    <>
      <h1>Calendario</h1>

      {partner && (
        <nav className="tabs" aria-label="Qué ciclo ver">
          <Link href={tab("yo")} className={mode === "yo" ? "active" : undefined}>
            Yo
          </Link>
          <Link href={tab("ella")} className={mode === "ella" ? "active" : undefined}>
            {partner.firstName}
          </Link>
          <Link href={tab("ambas")} className={mode === "ambas" ? "active" : undefined}>
            Las dos
          </Link>
        </nav>
      )}

      <section className="card">
        <Calendar
          month={month}
          today={today}
          mode={mode}
          me={myMarks}
          partner={partnerMarks}
          myLogs={myLogs}
          partnerLogs={partnerLogs}
          partnerName={partner?.firstName ?? null}
        />
        <CalendarLegend
          mode={mode}
          partnerName={partner?.firstName ?? null}
          showFertile={mode === "yo" || (mode === "ella" && Boolean(partner?.shares.fertility)) || mode === "ambas"}
        />
        <div className="row gap" style={{ justifyContent: "space-between" }}>
          {month !== monthOf(today) ? (
            <Link href={`/calendario?ver=${mode}`} className="btn btn-ghost">
              Volver a hoy
            </Link>
          ) : (
            <span />
          )}
          <span className="muted small">Toca un día para apuntar síntomas o marcar la regla.</span>
        </div>
      </section>

      <section className="card">
        <h2>Tu ciclo en números</h2>
        <div className="stats">
          <div>
            <strong>{stats.cycleLength}</strong>
            <span>días de ciclo</span>
          </div>
          <div>
            <strong>{stats.periodLength}</strong>
            <span>días de regla</span>
          </div>
          <div>
            <strong>{me.periods.length}</strong>
            <span>{me.periods.length === 1 ? "regla apuntada" : "reglas apuntadas"}</span>
          </div>
        </div>
        <p className="muted small">
          {stats.cycleFromHistory
            ? `Media de tus últimos ${stats.cyclesCounted} ${stats.cyclesCounted === 1 ? "ciclo" : "ciclos"}` +
              (stats.shortestCycle !== stats.longestCycle ? ` (entre ${stats.shortestCycle} y ${stats.longestCycle} días).` : ".")
            : "Aún no hay ciclos completos: usamos los valores de Ajustes. Apunta reglas anteriores para afinar."}
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Tus reglas</h2>
        </div>

        <details className="more">
          <summary>Añadir una regla pasada</summary>
          <ActionForm action={savePeriod} className="stack">
            <div className="field-row">
              <label className="field">
                Primer día
                <input className="input" type="date" name="start" max={today} required />
              </label>
              <label className="field">
                Último día
                <input className="input" type="date" name="end" max={today} />
              </label>
            </div>
            <SubmitButton>Añadir</SubmitButton>
          </ActionForm>
        </details>

        {history.length === 0 ? (
          <p className="muted">Todavía no has apuntado ninguna regla.</p>
        ) : (
          <ul className="list">
            {history.map((p) => {
              const r = resolvePeriod(p, today, stats.periodLength);
              const days = diffDays(r.start, r.end) + 1;
              const cycle = stats.cycleLengthByStart[p.start];
              return (
                <li key={p.id}>
                  <div className="list-main">
                    <span>
                      <strong>{formatShortSmart(p.start, today)}</strong>
                      {r.ongoing ? " · en curso" : ` – ${formatShort(r.end)}${r.estimatedEnd ? " (estimado)" : ""}`}
                    </span>
                    <span className="pills">
                      <span className="pill pill-me">
                        {days} {days === 1 ? "día" : "días"}
                      </span>
                      {cycle && <span className="pill">ciclo {cycle} d</span>}
                    </span>
                  </div>
                  <details className="more">
                    <summary>Editar</summary>
                    <ActionForm action={savePeriod} className="stack">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="field-row">
                        <label className="field">
                          Primer día
                          <input className="input" type="date" name="start" max={today} defaultValue={p.start} required />
                        </label>
                        <label className="field">
                          Último día
                          <input className="input" type="date" name="end" max={today} defaultValue={p.end ?? ""} />
                        </label>
                      </div>
                      <SubmitButton className="btn btn-soft">Guardar cambios</SubmitButton>
                    </ActionForm>
                    <ActionForm action={deletePeriod} confirmText="¿Seguro que quieres borrar esta regla?">
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton className="btn btn-danger btn-block" pendingText="Borrando…">
                        Borrar esta regla
                      </SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Disclaimer />
    </>
  );
}
