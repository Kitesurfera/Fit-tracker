import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { collections, DEFAULT_USER_SETTINGS } from "@/lib/db";

// Inicio de sesión con Google (Auth.js). Lee AUTH_SECRET, AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET del entorno.
// La sesión va en una cookie cifrada (JWT); los datos de cada usuaria se guardan en MongoDB.

async function upsertGoogleUser(p: { sub: string; email: string; name: string; image: string | null }) {
  const { users } = await collections();
  const now = new Date();
  const user = await users.findOneAndUpdate(
    { googleSub: p.sub },
    {
      $set: { email: p.email, name: p.name, image: p.image, updatedAt: now },
      $setOnInsert: { partnerId: null, settings: DEFAULT_USER_SETTINGS, createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw new Error("No se pudo guardar la usuaria");
  return user;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { prompt: "select_account" } } })],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" && Boolean(profile?.email) && profile?.email_verified !== false;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const user = await upsertGoogleUser({
          sub: account.providerAccountId,
          email: profile.email,
          name: profile.name || profile.email.split("@")[0],
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.uid = user._id.toHexString();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
