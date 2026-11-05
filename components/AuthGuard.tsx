"use client";

import {
  getCurrentUser,
  getUserProfile,
  isLocalAuthBackend,
  onAuthStateChange,
  upsertUserProfile,
  type AuthUser
} from "@/src/api/userApi";
import type { UserProfile } from "@/lib/types";
import { ADMIN_EMAIL } from "@/lib/security";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext<AuthUser | null>(null);
const ProfileContext = createContext<UserProfile | null>(null);

export function useCurrentUser() {
  return useContext(AuthContext);
}

export function useCurrentProfile() {
  return useContext(ProfileContext);
}

function applyRoleRedirects(profile: UserProfile | null, pathname: string, router: ReturnType<typeof useRouter>) {
  if (!profile) return;
  if (profile.role === "client" && !pathname.startsWith("/client") && pathname !== "/login") router.replace("/client");
  if (profile.role !== "client" && pathname.startsWith("/client")) router.replace("/");
  if (profile.role === "field_inspector" && !pathname.startsWith("/field") && !pathname.startsWith("/field-inspect") && !pathname.startsWith("/report") && pathname !== "/login") router.replace("/field");
  if (!["admin", "staff", "field_inspector"].includes(profile.role) && (pathname === "/field" || pathname.startsWith("/field/"))) router.replace("/");
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicAuthPath = pathname === "/login" || pathname.startsWith("/login/reset");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function ensureProfile(currentUser: AuthUser | null) {
    if (!currentUser) {
      setProfile(null);
      return null;
    }

    const { data } = await getUserProfile(currentUser.id);
    if (data) {
      setProfile(data as UserProfile);
      return data as UserProfile;
    }
    if (isLocalAuthBackend()) {
      setProfile(null);
      return null;
    }

    const metadata = currentUser.user_metadata ?? {};
    const role = currentUser.email === ADMIN_EMAIL ? "admin" : metadata.role === "client" ? "client" : metadata.role === "field_inspector" ? "field_inspector" : "staff";
    const customerName = role === "client" || role === "field_inspector" ? String(metadata.customer_name ?? "") : null;
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
      if (!data.user && !isPublicAuthPath) router.replace("/login");
      if (data.user && pathname === "/login") router.replace(nextProfile?.role === "client" ? "/client" : nextProfile?.role === "field_inspector" ? "/field" : "/");
      applyRoleRedirects(nextProfile, pathname, router);
    });

    const { data: listener } = onAuthStateChange(async (_event, nextUser) => {
      setUser(nextUser);
      const nextProfile = await ensureProfile(nextUser);
      if (!nextUser && !isPublicAuthPath) router.replace("/login");
      if (nextUser && pathname === "/login") router.replace(nextProfile?.role === "client" ? "/client" : nextProfile?.role === "field_inspector" ? "/field" : "/");
      applyRoleRedirects(nextProfile, pathname, router);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [isPublicAuthPath, pathname, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-machine" />
        </div>
      </main>
    );
  }

  if (!user && !isPublicAuthPath) return null;

  return (
    <AuthContext.Provider value={user}>
      <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>
    </AuthContext.Provider>
  );
}
