"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";

interface Staff {
  id: string;
  auth_user_id: string;
  property_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "owner" | "manager" | "security" | "maintenance" | "viewer";
  department: string | null;
  status: string;
}

interface AuthContextValue {
  user: User | null;
  staff: Staff | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient();

  const fetchStaff = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("auth_user_id", userId)
        .single();
      setStaff(data as Staff | null);
    },
    [supabase]
  );

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchStaff(session.user.id);
      }
      setLoading(false);
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchStaff(session.user.id);
      } else {
        setStaff(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchStaff]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStaff(null);
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, staff, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
