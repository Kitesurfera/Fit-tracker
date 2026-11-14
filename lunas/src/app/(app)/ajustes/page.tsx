import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/ui";
import { deleteAccount, saveSettings, signOutAction } from "@/lib/actions";
import { computeStats } from "@/lib/cycle";
import { SETTINGS_RANGE } from "@/lib/constants";
import { collections } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const user = await requireUser();
  const { periods } = await collections();
  const docs = await periods.find({ userId: user._id }).toArray();
  const stats = computeStats(
    docs.map((p) => ({ start: p.start, end: p.end })),
    user.settings,
  );
  const s = user.settings;

  return (
    <>
      <h1>Ajustes</h1>

      <section className="card">
        <div className="who row gap">
          <Avatar name={user.name} image={user.image} size={52} />
          <div>
            <h2>{user.name}</h2>
            <p className="muted small">{user.email} · cuenta de Google</p>
          </div>
        </div>
      </section>

      <ActionForm action={saveSettings} className="stack-lg">
        <section className="card">
          <h2>Tu ciclo</h2>
          <p className="muted small">
            Se usan mientras no haya suficiente historial. Cuando apuntes varias reglas, Lunas calcula tus medias sola.
          </p>
          <div className="field-row">
            <label className="field">
              Ciclo (días)
              <input
                className="input"
                type="number"
                name="cycleLength"
                inputMode="numeric"
                min={SETTINGS_RANGE.cycleLength.min}
                max={SETTINGS_RANGE.cycleLength.max}
                defaultValue={s.cycleLength}
                required
              />
            </label>
            <label className="field">
              Regla (días)
              <input
                className="input"
                type="number"
                name="periodLength"
                inputMode="numeric"
                min={SETTINGS_RANGE.periodLength.min}
                max={SETTINGS_RANGE.periodLength.max}
                defaultValue={s.periodLength}
                required
              />
            </label>
          </div>
          {(stats.cycleFromHistory || stats.periodFromHistory) && (
            <p className="tip">
              Según tu historial: ciclo de <strong>{stats.cycleLength} días</strong> y regla de{" "}
              <strong>{stats.periodLength} días</strong>. Es lo que se usa para las predicciones.
            </p>
          )}
        </section>

        <section className="card" id="privacidad">
          <h2>Qué compartes con tu compañera</h2>
          <p className="muted small">Tus reglas y las predicciones siempre se comparten: es la idea de Lunas 🙂</p>
          <label className="switch">
            <span>
              Flujo, síntomas y ánimo
              <small>Lo que apuntas cada día (sin las notas).</small>
            </span>
            <input type="checkbox" name="shareSymptoms" defaultChecked={s.shareSymptoms} />
          </label>
          <label className="switch">
            <span>
              Notas
              <small>Lo que escribes en el campo de nota.</small>
            </span>
            <input type="checkbox" name="shareNotes" defaultChecked={s.shareNotes} />
          </label>
          <label className="switch">
            <span>
              Días fértiles y ovulación
              <small>Tu ventana fértil estimada.</small>
            </span>
            <input type="checkbox" name="shareFertility" defaultChecked={s.shareFertility} />
          </label>
        </section>

        <SubmitButton className="btn btn-primary btn-block" pendingText="Guardando…">
          Guardar ajustes
        </SubmitButton>
      </ActionForm>

      <section className="card">
        <h2>Tus datos</h2>
        <a href="/api/export" className="btn btn-soft" download>
          Descargar mis datos (JSON)
        </a>
        <details className="more">
          <summary>Borrar mi cuenta</summary>
          <ActionForm action={deleteAccount} className="stack">
            <p className="muted small">
              Se borrarán para siempre tus reglas, registros, invitaciones y mensajitos, y se desconectará tu compañera.
              Escribe <strong>BORRAR</strong> para confirmar.
            </p>
            <input className="input" name="confirm" autoComplete="off" placeholder="BORRAR" aria-label="Escribe BORRAR" />
            <SubmitButton className="btn btn-danger" pendingText="Borrando…">
              Borrar mi cuenta y mis datos
            </SubmitButton>
          </ActionForm>
        </details>
      </section>

      <form action={signOutAction}>
        <button type="submit" className="btn btn-soft btn-block">
          Cerrar sesión
        </button>
      </form>

      <p className="footer-links">
        <Link href="/privacidad">Privacidad</Link>
      </p>
    </>
  );
}
