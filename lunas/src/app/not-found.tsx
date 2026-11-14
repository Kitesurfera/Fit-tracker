import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="landing">
      <div className="hero">
        <Logo size={64} />
        <h1>Esta página no existe</h1>
        <p>Puede que el enlace esté mal escrito.</p>
        <Link href="/" className="btn btn-soft">
          Ir a Lunas
        </Link>
      </div>
    </main>
  );
}
