import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, GoogleButton, Logo } from "@/components/ui";
import { acceptInvite } from "@/lib/actions";
import { collections } from "@/lib/db";
import { firstName, getPartnerDoc } from "@/lib/data";
import { formatInviteCode, normalizeInviteCode } from "@/lib/invite";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Invitación", robots: { index: false } };

export default async function InvitacionPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeInviteCode((await params).code);
  const { invites, users } = await collections();
  const invite = code ? await invites.findOne({ code, expiresAt: { $gt: new Date() } }) : null;
  const inviter = invite ? await users.findOne({ _id: invite.userId }) : null;
  const user = await getCurrentUser();
  const currentPartner = user ? await getPartnerDoc(user) : null;

  let body: React.ReactNode;
  if (!invite || !inviter) {
    body = (
      <>
        <h1>Esta invitación no es válida</h1>
        <p className="muted">Puede que haya caducado o que ya se haya usado. Pídele a tu compañera un enlace nuevo.</p>
        <Link href={user ? "/inicio" : "/"} className="btn btn-soft">
          Ir a Lunas
        </Link>
      </>
    );
  } else {
    const name = firstName(inviter.name);
    body = (
      <>
        <Avatar name={inviter.name} image={inviter.image} size={80} tone="partner" />
        <h1>{name} te invita a Lunas</h1>
        <p className="muted">
          Si aceptas, las dos veréis el ciclo de la otra: cuándo os toca la regla, en qué fase estáis y cómo os sentís (si
          lo compartís). Podéis desconectaros cuando queráis.
        </p>
        {!user ? (
          <>
            <GoogleButton redirectTo={`/invitacion/${code}`} label="Entrar con Google para aceptar" />
            <p className="muted small">Código: {formatInviteCode(code)}</p>
          </>
        ) : user._id.equals(inviter._id) ? (
          <>
            <p className="banner">Esta es tu propia invitación: envíale el enlace a tu compañera.</p>
            <Link href="/companera" className="btn btn-soft">
              Volver
            </Link>
          </>
        ) : currentPartner ? (
          <>
            <p className="banner banner-warn">
              Ya estás conectada con {firstName(currentPartner.name)}. Para conectar con {name}, primero desconéctate en
              Compañera.
            </p>
            <Link href="/companera" className="btn btn-soft">
              Ir a Compañera
            </Link>
          </>
        ) : (
          <ActionForm action={acceptInvite} className="stack" >
            <input type="hidden" name="code" value={code} />
            <SubmitButton className="btn btn-partner" pendingText="Conectando…">
              Aceptar y conectar con {name}
            </SubmitButton>
          </ActionForm>
        )}
      </>
    );
  }

  return (
    <main className="landing">
      <div className="hero">
        <Logo size={56} />
        {body}
      </div>
    </main>
  );
}
