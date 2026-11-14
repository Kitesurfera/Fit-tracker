import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, CycleRing, Disclaimer, LogChips, nextPeriodText } from "@/components/ui";
import { endPeriod, sendCarino, startPeriod } from "@/lib/actions";
import { CARINOS, PHASES } from "@/lib/constants";
import { getPartnerDoc, loadLogs, loadPerson, loadReceivedCarinos, type Person } from "@/lib/data";
import { capitalize, formatLong, type ISODate } from "@/lib/dates";
import { getToday, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Hoy" };

function timeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

export default async function InicioPage() {
  const user = await requireUser();
  const today = await getToday();
  const partnerDoc = await getPartnerDoc(user);
  const [me, partner, myLogs, partnerLogs, carinos] = await Promise.all([
    loadPerson(user, today, false),
    partnerDoc ? loadPerson(partnerDoc, today, true) : Promise.resolve(null),
    loadLogs(user, false, today, today),
    partnerDoc ? loadLogs(partnerDoc, true, today, today) : Promise.resolve(new Map()),
    loadReceivedCarinos(user, partnerDoc),
  ]);

  return (
    <>
      <div className="greeting">
        <h1>Hola, {me.firstName} 🌙</h1>
        <p className="muted">{capitalize(formatLong(today))}</p>
      </div>

      {carinos.length > 0 && (
        <section className="banner" aria-label="Mensajitos recibidos">
          <ul className="carino-list">
            {carinos.map((c) => {
              const info = CARINOS.find((x) => x.id === c.kind);
              return (
                <li key={c.id}>
                  <span className="emoji" aria-hidden="true">
                    {info?.emoji}
                  </span>
                  <span>
                    <strong>{c.fromName}:</strong> {info?.text}
                    <br />
                    <span className="muted small">{timeAgo(c.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <MyCard me={me} today={today} todayLog={myLogs.get(today)} />

      {partner ? (
        <PartnerCard partner={partner} todayLog={partnerLogs.get(today)} />
      ) : (
        <section className="card">
          <p className="eyebrow">Tu compañera</p>
          <h2>Comparte tus lunas 💞</h2>
          <p className="muted">
            Invita a tu amiga, hermana o pareja para ver los ciclos de las dos, saber cuándo le viene la regla y mandaros
            cariño.
          </p>
          <Link href="/companera" className="btn btn-partner">
            Invitar a mi compañera
          </Link>
        </section>
      )}

      <Disclaimer />
    </>
  );
}

function MyCard({ me, today, todayLog }: { me: Person; today: ISODate; todayLog: Parameters<typeof LogChips>[0]["log"] }) {
  const { status } = me;
  const open = status.lastPeriod?.ongoing ? me.periods.filter((p) => p.start <= today).at(-1) : undefined;

  if (!status.hasData) {
    return (
      <section className="card card-me">
        <p className="eyebrow">Tu ciclo</p>
        <h2>Empecemos 🌸</h2>
        <p className="muted">¿Cuándo empezó tu última regla? Con eso ya podemos estimar la siguiente.</p>
        <ActionForm action={startPeriod} className="stack">
          <label className="field">
            Primer día de tu última regla
            <input className="input" type="date" name="date" max={today} defaultValue={today} required />
          </label>
          <SubmitButton>Guardar</SubmitButton>
        </ActionForm>
        <p className="muted small">
          Si te acuerdas de reglas anteriores, añádelas en <Link href="/calendario">Calendario</Link>: las predicciones
          serán más precisas.
        </p>
      </section>
    );
  }

  return (
    <section className="card card-me">
      <p className="eyebrow">Tu ciclo</p>
      <CycleRing status={status} />
      <p className="status-line">{nextPeriodText(status, "tú")}</p>
      {status.lateDays > 0 && !status.stale ? (
        <p className="tip">
          Un retraso de unos días es habitual (estrés, viajes, cambios de rutina…). Si te preocupa, consulta con tu
          ginecóloga.
        </p>
      ) : (
        status.phase && <p className="tip">{PHASES[status.phase].tip}</p>
      )}

      {open ? (
        <ActionForm action={endPeriod} className="stack">
          <input type="hidden" name="id" value={open.id} />
          <SubmitButton className="btn btn-primary btn-block">Se me ha ido la regla</SubmitButton>
          <details className="more">
            <summary>¿Terminó otro día?</summary>
            <label className="field">
              Último día de regla
              <input className="input" type="date" name="date" min={open.start} max={today} />
            </label>
          </details>
        </ActionForm>
      ) : (
        <ActionForm action={startPeriod} className="stack">
          <SubmitButton className="btn btn-primary btn-block">Me ha bajado la regla</SubmitButton>
          <details className="more">
            <summary>¿Empezó otro día?</summary>
            <label className="field">
              Primer día de regla
              <input className="input" type="date" name="date" max={today} />
            </label>
          </details>
        </ActionForm>
      )}

      <LogChips log={todayLog} />
      <Link href={`/registro?fecha=${today}`} className="btn btn-soft">
        {todayLog ? "Editar cómo me siento hoy" : "Apuntar cómo me siento hoy"}
      </Link>
    </section>
  );
}

function PartnerCard({ partner, todayLog }: { partner: Person; todayLog: Parameters<typeof LogChips>[0]["log"] }) {
  const { status } = partner;
  return (
    <section className="card card-partner">
      <div className="card-head">
        <div className="who">
          <Avatar name={partner.name} image={partner.image} size={44} tone="partner" />
          <div>
            <p className="eyebrow">Tu compañera</p>
            <h2>{partner.firstName}</h2>
          </div>
        </div>
        <Link href="/calendario?ver=ella" className="btn btn-ghost">
          Ver calendario
        </Link>
      </div>

      <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
        <div className="ring-sm">
          <CycleRing status={status} tone="partner" size={130} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ fontWeight: 600 }}>{nextPeriodText(status, "ella")}</p>
          {status.phase && !status.stale && <p className="muted small">{PHASES[status.phase].partnerTip}</p>}
        </div>
      </div>

      {todayLog && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="muted small">Hoy ha apuntado:</p>
          <LogChips log={todayLog} />
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <p className="muted small">Mándale un cariño:</p>
        <ActionForm action={sendCarino}>
          <div className="carino-grid">
            {CARINOS.slice(0, 4).map((c) => (
              <SubmitButton key={c.id} name="kind" value={c.id} className="btn btn-soft" pendingText="Enviando…">
                <span className="emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                {c.text}
              </SubmitButton>
            ))}
          </div>
        </ActionForm>
      </div>
    </section>
  );
}
