import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleButton, Logo } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  AccessDenied: "Google no ha permitido el acceso. Inténtalo con otra cuenta.",
  Configuration: "Falta configurar el inicio de sesión en el servidor (mira el README).",
  Verification: "El enlace ha caducado. Vuelve a intentarlo.",
};

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/inicio");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] ?? "No se pudo iniciar sesión. Inténtalo de nuevo." : null;

  return (
    <main className="landing">
      <section className="hero">
        <Logo size={96} />
        <h1>Lunas</h1>
        <p>Seguid vuestros ciclos juntas. Sabe cuándo le viene la regla a tu compañera, cómo se siente y mándale cariño cuando más lo necesita.</p>
        {params.cuenta === "borrada" && (
          <p className="banner banner-ok" role="status">
            Tu cuenta y tus datos se han borrado. ¡Hasta pronto! 🌙
          </p>
        )}
        {error && (
          <p className="form-msg form-error" role="alert">
            {error}
          </p>
        )}
        <GoogleButton />
      </section>

      <section className="card">
        <h2>Así funciona</h2>
        <ol className="steps">
          <li>
            <span>
              <strong>Entra con tu cuenta de Google.</strong>
              <br />
              <span className="muted">Sin contraseñas nuevas.</span>
            </span>
          </li>
          <li>
            <span>
              <strong>Invita a tu compañera con un enlace.</strong>
              <br />
              <span className="muted">Amiga, hermana, pareja… Solo os conectáis si las dos queréis.</span>
            </span>
          </li>
          <li>
            <span>
              <strong>Apuntad vuestras reglas y cómo os sentís.</strong>
              <br />
              <span className="muted">Lunas calcula la próxima regla, la fase del ciclo y si estáis sincronizadas.</span>
            </span>
          </li>
        </ol>
      </section>

      <p className="disclaimer">
        Tus datos son tuyos: solo los ve la compañera con la que te conectes, tú eliges qué compartir y puedes borrarlo
        todo cuando quieras.
      </p>
      <p className="footer-links">
        <Link href="/privacidad">Privacidad</Link>
      </p>
    </main>
  );
}
