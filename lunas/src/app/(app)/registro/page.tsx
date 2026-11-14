import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, LogChips } from "@/components/ui";
import { endPeriod, saveLog, startPeriod } from "@/lib/actions";
import { resolvePeriod } from "@/lib/cycle";
import { FLOWS, MOODS, SYMPTOMS } from "@/lib/constants";
import { getPartnerDoc, loadLogs, loadPerson, personMarks, type Person } from "@/lib/data";
import { addDays, formatLong, formatShort, isISODate, monthOf, type ISODate } from "@/lib/dates";
import { getToday, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Registro del día" };

function periodOn(person: Person, date: ISODate, today: ISODate) {
  for (const p of person.periods) {
    const r = resolvePeriod(p, today, person.status.stats.periodLength);
    if (date >= r.start && date <= r.end) return { period: p, resolved: r };
  }
  return null;
}

export default async function RegistroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const today = await getToday();
  const date = isISODate(params.fecha) && params.fecha <= today ? params.fecha : today;
  const partnerDoc = await getPartnerDoc(user);

  const [me, partner, myLogs, partnerLogs] = await Promise.all([
    loadPerson(user, today, false),
    partnerDoc ? loadPerson(partnerDoc, today, true) : Promise.resolve(null),
    loadLogs(user, false, date, date),
    partnerDoc ? loadLogs(partnerDoc, true, date, date) : Promise.resolve(new Map()),
  ]);
  const log = myLogs.get(date);
  const mine = periodOn(me, date, today);
  const partnerMark = partner ? personMarks(partner, today, date, date).get(date) : undefined;
  const partnerLog = partnerLogs.get(date);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <>
      <div className="day-nav">
        <Link href={`/registro?fecha=${prev}`} className="icon-btn" aria-label="Día anterior">
          ‹
        </Link>
        <div className="center">
          <h1>{formatLong(date)}</h1>
          <p className="muted small">{date === today ? "Hoy" : <Link href={`/calendario?mes=${monthOf(date)}`}>Ver en el calendario</Link>}</p>
        </div>
        {next <= today ? (
          <Link href={`/registro?fecha=${next}`} className="icon-btn" aria-label="Día siguiente">
            ›
          </Link>
        ) : (
          <span style={{ width: 40 }} />
        )}
      </div>

      <section className="card card-me">
        <p className="eyebrow">Regla</p>
        {mine ? (
          mine.resolved.ongoing ? (
            <>
              <p>
                Tienes la regla desde el <strong>{formatShort(mine.period.start)}</strong>.
              </p>
              <ActionForm action={endPeriod}>
                <input type="hidden" name="id" value={mine.period.id} />
                <input type="hidden" name="date" value={date} />
                <SubmitButton className="btn btn-primary btn-block">Este fue mi último día</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <p>
              Este día tenías la regla (del {formatShort(mine.resolved.start)} al {formatShort(mine.resolved.end)}
              {mine.resolved.estimatedEnd ? ", fin estimado" : ""}).{" "}
              <Link href={`/calendario?mes=${monthOf(date)}`}>Editar fechas</Link>
            </p>
          )
        ) : (
          <ActionForm action={startPeriod} className="stack">
            <input type="hidden" name="date" value={date} />
            <p className="muted">¿Te bajó la regla este día?</p>
            <SubmitButton className="btn btn-soft">Marcar como primer día de regla</SubmitButton>
          </ActionForm>
        )}
      </section>

      <ActionForm key={date} action={saveLog} className="card">
        <input type="hidden" name="date" value={date} />
        <fieldset>
          <legend className="label">Flujo</legend>
          <div className="chips">
            <label>
              <input type="radio" name="flow" value="" defaultChecked={!log?.flow} />
              <span className="chip">Nada</span>
            </label>
            {FLOWS.map((f) => (
              <label key={f.id}>
                <input type="radio" name="flow" value={f.id} defaultChecked={log?.flow === f.id} />
                <span className="chip">
                  {f.drops > 0 ? "💧".repeat(f.drops) : "·"} {f.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">¿Cómo te sientes?</legend>
          <div className="chips">
            {MOODS.map((m) => (
              <label key={m.id}>
                <input type="checkbox" name="moods" value={m.id} defaultChecked={log?.moods.includes(m.id)} />
                <span className="chip">
                  {m.emoji} {m.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Síntomas</legend>
          <div className="chips">
            {SYMPTOMS.map((s) => (
              <label key={s.id}>
                <input type="checkbox" name="symptoms" value={s.id} defaultChecked={log?.symptoms.includes(s.id)} />
                <span className="chip">
                  {s.emoji} {s.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          Nota
          <textarea className="input" name="note" maxLength={500} defaultValue={log?.note ?? ""} placeholder="Algo que quieras recordar…" />
          <span className="muted small" style={{ fontWeight: 400 }}>
            {user.settings.shareNotes
              ? "Tu compañera puede ver tus notas (puedes cambiarlo en Ajustes)."
              : "Tus notas son privadas: tu compañera no las ve."}
          </span>
        </label>

        <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
      </ActionForm>

      {partner && (
        <section className="card card-partner">
          <div className="who row gap">
            <Avatar name={partner.name} image={partner.image} size={32} tone="partner" />
            <p className="eyebrow">{partner.firstName} este día</p>
          </div>
          {partnerMark?.period ? (
            <p>
              <span className="pill pill-pa">Con la regla</span>
            </p>
          ) : partnerMark?.predictedPeriod ? (
            <p>
              <span className="pill pill-pa">Regla prevista</span>
            </p>
          ) : null}
          {partner.shares.symptoms ? (
            partnerLog ? (
              <LogChips log={partnerLog} />
            ) : (
              <p className="muted small">No apuntó nada este día.</p>
            )
          ) : (
            <p className="muted small">{partner.firstName} no comparte sus síntomas.</p>
          )}
        </section>
      )}
    </>
  );
}
