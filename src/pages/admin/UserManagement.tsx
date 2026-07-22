import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus, Shield, Eye, Loader2, Trash2, Mail, UserX, UserCheck, Briefcase } from "lucide-react";
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from "@/lib/password-validation";

type AppRole = "admin" | "viewer" | "broker";

interface UserWithRoles {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  roles: AppRole[];
  is_disabled?: boolean;
}

export default function UserManagement() {
  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("broker");

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRoles[] = (profiles || []).map((profile) => ({
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        created_at: profile.created_at,
        roles: (roles || [])
          .filter((r) => r.user_id === profile.id)
          .map((r) => r.role as AppRole),
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInviteUser = async () => {
    if (!inviteEmail || !invitePassword) return;

    const passwordError = validatePassword(invitePassword);
    if (passwordError) {
      toast({ title: "Invalid password", description: passwordError, variant: "destructive" });
      return;
    }

    setIsInviting(true);
    try {
      // Create user via signup
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail,
        password: invitePassword,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        // Assign role
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: authData.user.id, role: inviteRole });

        if (roleError) throw roleError;
      }

      toast({
        title: "User invited",
        description: `${inviteEmail} has been added as ${inviteRole}`,
      });

      setInviteDialogOpen(false);
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("broker");
      
      // Refresh users list after a brief delay for profile trigger
      setTimeout(fetchUsers, 500);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to invite user",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleAddRole = async (userId: string, role: AppRole) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (error) throw error;

      toast({
        title: "Role added",
        description: `${role} role has been assigned`,
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add role",
        variant: "destructive",
      });
    }
  };

  const handleRemoveRole = async (userId: string, role: AppRole) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);

      if (error) throw error;

      toast({
        title: "Role removed",
        description: `${role} role has been removed`,
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove role",
        variant: "destructive",
      });
    }
  };

  const handleSendResetLink = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Reset link sent",
        description: `Password reset email sent to ${email}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset link",
        variant: "destructive",
      });
    }
  };

  const handleToggleUserStatus = async (userId: string, email: string, disable: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { userId, action: disable ? "disable" : "enable" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: disable ? "User disabled" : "User enabled",
        description: `${email} has been ${disable ? "disabled" : "enabled"}`,
      });

      // Update local state to reflect the change
      setUsers(users.map(u => 
        u.id === userId ? { ...u, is_disabled: disable } : u
      ));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${disable ? "disable" : "enable"} user`,
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const columns: Column<UserWithRoles>[] = [
    {
      key: "email",
      header: "User",
      render: (user) => (
        <div className="flex items-center gap-2">
          <div>
            <div className="font-medium text-foreground">{user.display_name || user.email}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          {user.is_disabled && (
            <Badge variant="outline" className="text-xs text-destructive border-destructive/50">
              Disabled
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (user) => (
        <div className="flex gap-1.5">
          {user.roles.includes("admin") && (
            <Badge variant="default" className="text-xs">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          )}
          {user.roles.includes("viewer") && (
            <Badge variant="secondary" className="text-xs">
              <Eye className="h-3 w-3 mr-1" />
              Viewer
            </Badge>
          )}
          {user.roles.includes("broker") && (
            <Badge variant="outline" className="text-xs">
              <Briefcase className="h-3 w-3 mr-1" />
              Broker
            </Badge>
          )}
          {user.roles.length === 0 && (
            <span className="text-xs text-muted-foreground">No roles</span>
          )}
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Joined",
      render: (user) => (
        <span className="text-muted-foreground">{formatDate(user.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user) => {
        const isCurrentUser = currentUser?.id === user.id;
        
        return (
          <div className="flex gap-2 flex-wrap">
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Mail className="h-3 w-3 mr-1" />
                  Reset Password
                </Button>
              }
              title="Send Password Reset"
              description={`Send a password reset link to ${user.email}?`}
              confirmLabel="Send Link"
              onConfirm={() => handleSendResetLink(user.email)}
            />
            {!user.roles.includes("admin") && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Shield className="h-3 w-3 mr-1" />
                    Make Admin
                  </Button>
                }
                title="Assign Admin Role"
                description={`Grant admin privileges to ${user.email}? They will be able to manage users and make changes to the system.`}
                confirmLabel="Assign Admin"
                onConfirm={() => handleAddRole(user.id, "admin")}
              />
            )}
            {!user.roles.includes("viewer") && !user.roles.includes("admin") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddRole(user.id, "viewer")}
              >
                <Eye className="h-3 w-3 mr-1" />
                Make Viewer
              </Button>
            )}
            {user.roles.includes("admin") && users.filter(u => u.roles.includes("admin")).length > 1 && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Remove Admin
                  </Button>
                }
                title="Remove Admin Role"
                description={`Remove admin privileges from ${user.email}? They will no longer be able to manage users or make system changes.`}
                confirmLabel="Remove Admin"
                dangerous
                onConfirm={() => handleRemoveRole(user.id, "admin")}
              />
            )}
            {!isCurrentUser && (
              user.is_disabled ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <UserCheck className="h-3 w-3 mr-1" />
                      Enable
                    </Button>
                  }
                  title="Enable User"
                  description={`Re-enable access for ${user.email}? They will be able to log in again.`}
                  confirmLabel="Enable User"
                  onConfirm={() => handleToggleUserStatus(user.id, user.email, false)}
                />
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      <UserX className="h-3 w-3 mr-1" />
                      Disable
                    </Button>
                  }
                  title="Disable User"
                  description={`Disable access for ${user.email}? They will no longer be able to log in.`}
                  confirmLabel="Disable User"
                  dangerous
                  onConfirm={() => handleToggleUserStatus(user.id, user.email, true)}
                />
              )
            )}
          </div>
        );
      },
    },
  ];

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
            <p className="text-muted-foreground">You need admin privileges to view this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="User Management"
        description="Manage dashboard users and their access roles"
      />

      <div className="mb-6 flex justify-end">
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-popover border-border">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Create a new user account with the specified role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password">Temporary Password</Label>
                <Input
                  id="invite-password"
                  type="text"
                  placeholder="Temporary password for user"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {PASSWORD_REQUIREMENTS_TEXT}. Share this with the user.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broker">Broker - Inventory & Broker Search only</SelectItem>
                    <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                    <SelectItem value="admin">Admin - Full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail || !invitePassword}>
                {isInviting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          data={users}
          columns={columns}
          keyExtractor={(user) => user.id}
        />
      )}
    </DashboardLayout>
  );
}
