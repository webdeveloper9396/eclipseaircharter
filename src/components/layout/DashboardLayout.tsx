import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger className="mr-4" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">OneWay</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-sm font-medium">Admin</span>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto scrollbar-thin">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
