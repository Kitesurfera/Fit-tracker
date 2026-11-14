import Link from "next/link";
import type { Metadata } from "next";
import { ShareInvite } from "@/components/client-bits";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, CycleRing, nextPeriodText } from "@/components/ui";
import { acceptInvite, cancelInvite, createInvite, sendCarino, unlinkPartner } from "@/lib/actions";
import { resolvePeriod, syncDistance } from "@/lib/cycle";
import { CARINOS, PHASES } from "@/lib/constants";
import { collections } from "@/lib/db";
import { getPartnerDoc, loadPerson, type Person } from "@/lib/data";
import { diffDays, formatDayMonth, formatShort, formatShortSmart } from "@/lib/dates";
import { formatInviteCode } from "@/lib/invite";
import { getToday, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Compañera" };

export default async function CompaneraPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await requireUser();
  const today = await getToday();
  const partnerDoc = await getPartnerDoc(user);

  if (!partnerDoc) {
    const { invites } = await collections();
    const invite = await invites.findOne({ userId: user._id, expiresAt: { $gt: new Date() } });
    return (
      <>
        <h1>Tu compañera</h1>
        {params.desconectada === "1" && (
          <section className="banner" role="status">
            Os habéis desconectado: ya no veis los datos de la otra. Vuestros datos siguen guardados.
          </section>
        )}
        <section className="card">
          <h2>Conectad vuestras lunas 🌙🌙</h2>
          <p className="muted">
            Al conectaros, cada una verá el ciclo de la otra: cuándo le toca la regla, en qué fase está y (si lo permite)
            cómo se siente. Podéis desconectaros cuando queráis.
          </p>
          {invite ? (
            <div className="stack">
              <p>Envíale este enlace a tu compañera. También puede escribir el código en su app:</p>
              <div className="code-box mono" aria-label="Código de invitación">
                {formatInviteCode(invite.code)}
              </div>
              <ShareInvite code={invite.code} inviterName={user.name.split(" ")[0]} />
              <p className="muted small">
                Caduca el {formatDayMonth(invite.expiresAt.toISOString().slice(0, 10))}. Solo sirve para una persona.
              </p>
              <ActionForm action={cancelInvite}>
                <SubmitButton className="btn btn-ghost">Anular invitación</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <ActionForm action={createInvite}>
              <SubmitButton className="btn btn-partner btn-block" pendingText="Creando…">
                Crear enlace de invitación
              </SubmitButton>
            </ActionForm>
          )}
        </section>

        <div className="divider">¿Te han invitado a ti?</div>

        <section className="card">
          <h2>Tengo un código</h2>
          <ActionForm action={acceptInvite} className="stack">
            <input
              className="input input-code mono"
              name="code"
              placeholder="ABCD-EFGH"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              required
              aria-label="Código de invitación"
            />
            <SubmitButton className="btn btn-partner" pendingText="Conectando…">
              Conectar
            </SubmitButton>
          </ActionForm>
        </section>
      </>
    );
  }

  const [me, partner] = await Promise.all([loadPerson(user, today, false), loadPerson(partnerDoc, today, true)]);
  return (
    <>
      {params.conectadas === "1" && (
        <section className="banner banner-ok" role="status">
          <strong>¡Ya estáis conectadas! 🎉</strong> Ahora podéis ver los ciclos de las dos.
        </section>
      )}

      <section className="card card-partner">
        <div className="card-head">
          <div className="who">
            <Avatar name={partner.name} image={partner.image} size={56} tone="partner" />
            <div>
              <p className="eyebrow">Tu compañera</p>
              <h1 style={{ fontSize: "1.4rem" }}>{partner.name}</h1>
            </div>
          </div>
        </div>
        <CycleRing status={partner.status} tone="partner" size={200} />
        <p className="status-line">{nextPeriodText(partner.status, "ella")}</p>
        {partner.status.phase && !partner.status.stale && <p className="tip">{PHASES[partner.status.phase].partnerTip}</p>}
        <UpcomingDates person={partner} today={today} />
        <Link href="/calendario?ver=ella" className="btn btn-soft">
          Ver su calendario
        </Link>
      </section>

      <section className="card">
        <h2>Mándale un cariño 💜</h2>
        <ActionForm action={sendCarino}>
          <div className="carino-grid">
            {CARINOS.map((c) => (
              <SubmitButton key={c.id} name="kind" value={c.id} className="btn btn-soft" pendingText="Enviando…">
                <span className="emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                {c.text}
              </SubmitButton>
            ))}
          </div>
        </ActionForm>
        <p className="muted small">Lo verá en su pantalla de inicio.</p>
      </section>

      <SyncCard me={me} partner={partner} />

      <section className="card">
        <h2>Sus últimas reglas</h2>
        {partner.periods.length === 0 ? (
          <p className="muted">Todavía no ha apuntado ninguna.</p>
        ) : (
          <ul className="list">
            {[...partner.periods]
              .reverse()
              .slice(0, 4)
              .map((p) => {
                const r = resolvePeriod(p, today, partner.status.stats.periodLength);
                const days = diffDays(r.start, r.end) + 1;
                return (
                  <li key={p.id}>
                    <div className="list-main">
                      <span>
                        <strong>{formatShortSmart(p.start, today)}</strong>
                        {r.ongoing ? " · en curso" : ` – ${formatShort(r.end)}`}
                      </span>
                      <span className="pill pill-pa">
                        {days} {days === 1 ? "día" : "días"}
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Lo que ve ella de ti</h2>
        <ul className="dates-list">
          <li>
            <span>Tus reglas y predicciones</span>
            <span>Sí</span>
          </li>
          <li>
            <span>Flujo, síntomas y ánimo</span>
            <span>{user.settings.shareSymptoms ? "Sí" : "No"}</span>
          </li>
          <li>
            <span>Tus notas</span>
            <span>{user.settings.shareNotes ? "Sí" : "No"}</span>
          </li>
          <li>
            <span>Días fértiles y ovulación</span>
            <span>{user.settings.shareFertility ? "Sí" : "No"}</span>
          </li>
        </ul>
        <Link href="/ajustes#privacidad" className="btn btn-soft">
          Cambiar privacidad
        </Link>
        <details className="more">
          <summary>Desconectarme de {partner.firstName}</summary>
          <ActionForm action={unlinkPartner} className="stack">
            <label className="switch">
              <span>
                Sí, quiero desconectarme
                <small>Dejaréis de ver los datos de la otra. Vuestros datos no se borran.</small>
              </span>
              <input type="checkbox" name="confirm" />
            </label>
            <SubmitButton className="btn btn-danger" pendingText="Desconectando…">
              Desconectar
            </SubmitButton>
          </ActionForm>
        </details>
      </section>
    </>
  );
}

function UpcomingDates({ person, today }: { person: Person; today: string }) {
  const s = person.status;
  if (!s.hasData || s.stale || !s.nextStart) return null;
  const rows: [string, string][] = [];
  if (s.onPeriod && s.lastPeriod) {
    rows.push(["Termina (aprox.)", formatShort(s.lastPeriod.expectedEnd)]);
  }
  if (person.shares.fertility && s.fertileStart && s.fertileEnd && s.fertileEnd >= today) {
    rows.push(["Días fértiles (estim.)", `${formatShort(s.fertileStart)} – ${formatShort(s.fertileEnd)}`]);
  }
  rows.push(["Ciclo medio", `${s.stats.cycleLength} días`]);
  return (
    <ul className="dates-list">
      {rows.map(([k, v]) => (
        <li key={k}>
          <span className="muted">{k}</span>
          <span>{v}</span>
        </li>
      ))}
    </ul>
  );
}

function SyncCard({ me, partner }: { me: Person; partner: Person }) {
  const a = me.status.lastPeriod;
  const b = partner.status.lastPeriod;
  if (!a || !b || me.status.stale || partner.status.stale) return null;
  const cycle = Math.round((me.status.stats.cycleLength + partner.status.stats.cycleLength) / 2);
  const distance = syncDistance(a.start, b.start, cycle);
  let title = "Vais a vuestro ritmo";
  if (distance <= 2) title = "¡Estáis sincronizadas! 🌙🌙";
  else if (distance <= 5) title = "Casi sincronizadas";
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">
        {distance === 0
          ? "Vuestras últimas reglas empezaron el mismo día."
          : `Vuestras reglas empiezan con unos ${distance} ${distance === 1 ? "día" : "días"} de diferencia.`}
      </p>
      <ul className="dates-list">
        <li>
          <span>Tu próxima regla</span>
          <span>{me.status.nextStart ? formatShort(me.status.nextStart) : "—"}</span>
        </li>
        <li>
          <span>La de {partner.firstName}</span>
          <span>{partner.status.nextStart ? formatShort(partner.status.nextStart) : "—"}</span>
        </li>
      </ul>
    </section>
  );
}
