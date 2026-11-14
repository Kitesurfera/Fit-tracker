import Link from "next/link";
import { cookies } from "next/headers";
import { BottomNav, TimezoneSync } from "@/components/client-bits";
import { Avatar, Logo } from "@/components/ui";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const tz = (await cookies()).get("tz")?.value ?? null;
  return (
    <div className="app">
      <header className="topbar">
        <Link href="/inicio" className="brand">
          <Logo size={32} />
          Lunas
        </Link>
        <Link href="/ajustes" aria-label="Tu perfil y ajustes">
          <Avatar name={user.name} image={user.image} size={36} />
        </Link>
      </header>
      <main className="container">{children}</main>
      <BottomNav />
      <TimezoneSync current={tz} />
    </div>
  );
}
