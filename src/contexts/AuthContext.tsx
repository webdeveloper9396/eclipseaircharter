import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "viewer" | "broker";

interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  isViewer: boolean;
  isBroker: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PASSWORD_RECOVERY_STORAGE_KEY = "oneway_password_recovery_in_progress";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (rolesData) {
        setRoles(rolesData.map((r) => r.role as AppRole));
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "true");
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer to avoid Supabase client deadlock, but await before clearing loading
          setTimeout(async () => {
            await fetchUserData(session.user.id);
            setIsLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
        }
      }
    );

    // THEN get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const isAdmin = roles.includes("admin");
  const isViewer = roles.includes("viewer");
  const isBroker = roles.includes("broker");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAdmin,
        isViewer,
        isBroker,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
