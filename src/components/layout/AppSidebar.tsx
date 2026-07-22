import {
  LayoutDashboard,
  AlertCircle,
  Building2,
  Plane,
  MapPin,
  MapPinned,
  Package,
  Activity,
  LogOut,
  Users,
  Briefcase,
  BarChart3,
  Radar,
  Star,
  Send,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";

const navigationItems = [
  { title: "Empty Legs", url: "https://search.eclipseaircharter.com/search", icon: Plane, external: true, adminOnly: true },
  { title: "Overview", url: "/admin", icon: LayoutDashboard, adminOnly: true },
  { title: "Review Queue", url: "/admin/review", icon: AlertCircle, badge: "attention", adminOnly: true },
  { title: "Operators", url: "/admin/operators", icon: Building2, adminOnly: true },
  { title: "Aircraft", url: "/admin/aircraft", icon: Plane, adminOnly: true },
  { title: "Corridors", url: "/admin/corridors", icon: MapPin, adminOnly: true },
  { title: "Featured Settings", url: "/admin/featured-settings", icon: Star, adminOnly: true },
  { title: "Broker Search", url: "/admin/brokersearch", icon: Briefcase },
  { title: "Watch Routes", url: "/admin/watchroutes", icon: Radar },
  { title: "Airports", url: "/admin/airports", icon: MapPinned, adminOnly: true },
  { title: "Inventory", url: "/admin/inventory", icon: Package, readOnly: true },
  { title: "System Events", url: "/admin/events", icon: Activity, adminOnly: true },
];

const adminItems = [
  {
    title: "User Management",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Search Analytics",
    url: "/admin/search-analytics",
    icon: BarChart3,
  },
  {
    title: "Charter Search (test)",
    url: "/admin/charter-search",
    icon: Send,
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-12 flex items-center justify-center border-b border-sidebar-border">
        {collapsed ? (
          <span className="text-lg font-semibold text-sidebar-foreground">O/W</span>
        ) : (
          <span className="text-lg font-semibold text-sidebar-foreground tracking-tight">
            OneWay
          </span>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.filter(item => isAdmin || !item.adminOnly).map((item) => {
                const isActive = location.pathname === item.url;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      className={cn(
                        "transition-colors",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      {item.external ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                          <item.icon className={cn(
                            "h-4 w-4 shrink-0",
                            item.badge === "attention" && "text-accent"
                          )} />
                          {!collapsed && (
                            <span className="flex-1 truncate">{item.title}</span>
                          )}
                        </a>
                      ) : (
                        <NavLink to={item.url} className="flex items-center gap-3">
                          <item.icon className={cn(
                            "h-4 w-4 shrink-0",
                            item.badge === "attention" && "text-accent"
                          )} />
                          {!collapsed && (
                            <span className="flex-1 truncate">{item.title}</span>
                          )}
                          {!collapsed && item.readOnly && (
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              Read
                            </span>
                          )}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-4">
            {!collapsed && (
              <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2 mb-2">
                Admin
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        className={cn(
                          "transition-colors",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                        )}
                      >
                        <NavLink to={item.url} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="flex-1 truncate">{item.title}</span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.display_name || "User"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {profile?.email}
                </span>
              </div>
              <Badge
                variant={isAdmin ? "default" : "secondary"}
                className="text-[10px] shrink-0"
              >
                {isAdmin ? "Admin" : "Viewer"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="status-dot status-dot-success"></span>
                <span className="text-xs text-muted-foreground">Operational</span>
              </div>
              <div className="flex items-center gap-1">
                <ChangePasswordDialog />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-muted-foreground hover:text-foreground mx-auto"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
