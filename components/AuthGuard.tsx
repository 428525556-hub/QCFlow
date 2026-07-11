"use client";

import { getCurrentUser, getUserProfile, onAuthStateChange, upsertUserProfile } from "@/src/api/userApi";
import type { UserProfile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext<User | null>(null);
const ProfileContext = createContext<UserProfile | null>(null);

export function useCurrentUser() {
  return useContext(AuthContext);
}

export function useCurrentProfile() {
  return useContext(ProfileContext);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function ensureProfile(currentUser: User | null) {
    if (!currentUser) {
      setProfile(null);
      return null;
    }

    const { data } = await getUserProfile(currentUser.id);
    if (data) {
      setProfile(data as UserProfile);
      return data as UserProfile;
    }

    const metadata = currentUser.user_metadata ?? {};
    const role = currentUser.email === "shuoyuqc@163.com" ? "admin" : metadata.role === "client" ? "client" : "staff";
    const customerName = role === "client" ? String(metadata.customer_name ?? "") : null;
    const nextProfile = {
      id: currentUser.id,
      email: currentUser.email ?? "",
      role,
      customer_name: customerName || null
    } as UserProfile;

    await upsertUserProfile(nextProfile);
    setProfile(nextProfile);
    return nextProfile;
  }

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then(async ({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      const nextProfile = await ensureProfile(data.user);
      setLoading(false);
      if (!data.user && pathname !== "/login") router.replace("/login");
      if (data.user && pathname === "/login") router.replace("/");
      if (nextProfile?.role === "client" && !pathname.startsWith("/client") && pathname !== "/login") router.replace("/client");
      if (nextProfile?.role !== "client" && pathname.startsWith("/client")) router.replace("/");
    });

    const { data: listener } = onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      const nextProfile = await ensureProfile(session?.user ?? null);
      if (!session?.user && pathname !== "/login") router.replace("/login");
      if (session?.user && pathname === "/login") router.replace("/");
      if (nextProfile?.role === "client" && !pathname.startsWith("/client") && pathname !== "/login") router.replace("/client");
      if (nextProfile?.role !== "client" && pathname.startsWith("/client")) router.replace("/");
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-machine" />
        </div>
      </main>
    );
  }

  if (!user && pathname !== "/login") return null;

  return (
    <AuthContext.Provider value={user}>
      <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>
    </AuthContext.Provider>
  );
}
