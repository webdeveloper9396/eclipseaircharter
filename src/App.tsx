import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ReviewQueue from "./pages/ReviewQueue";
import Operators from "./pages/Operators";
import Aircraft from "./pages/Aircraft";
import Corridors from "./pages/Corridors";

import SearchAnalytics from "./pages/admin/SearchAnalytics";
import ClientSearch from "./pages/ClientSearch";
import ClientSearchEmbed from "./pages/ClientSearchEmbed";
import FeaturedSettings from "./pages/admin/FeaturedSettings";
import BrokerSearch from "./pages/BrokerSearch";
import WatchRoutes from "./pages/WatchRoutes";
import Airports from "./pages/Airports";
import Inventory from "./pages/Inventory";
import SystemEvents from "./pages/SystemEvents";
import UserManagement from "./pages/admin/UserManagement";
import CharterSearch from "./pages/admin/CharterSearch";
import Enquiry from "./pages/Enquiry";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/search" element={<ClientSearch />} />
            <Route path="/search/embed" element={<ClientSearchEmbed />} />
            <Route path="/request" element={<Enquiry />} />
            <Route path="/enquiry" element={<Navigate to="/request" replace />} />

            {/* Protected admin-only routes */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><Index /></ProtectedRoute>} />
            <Route path="/admin/review" element={<ProtectedRoute allowedRoles={["admin"]}><ReviewQueue /></ProtectedRoute>} />
            <Route path="/admin/operators" element={<ProtectedRoute allowedRoles={["admin"]}><Operators /></ProtectedRoute>} />
            <Route path="/admin/aircraft" element={<ProtectedRoute allowedRoles={["admin"]}><Aircraft /></ProtectedRoute>} />
            <Route path="/admin/corridors" element={<ProtectedRoute allowedRoles={["admin"]}><Corridors /></ProtectedRoute>} />
            <Route path="/admin/featured-settings" element={<ProtectedRoute allowedRoles={["admin"]}><FeaturedSettings /></ProtectedRoute>} />
            <Route path="/admin/airports" element={<ProtectedRoute allowedRoles={["admin"]}><Airports /></ProtectedRoute>} />
            <Route path="/admin/events" element={<ProtectedRoute allowedRoles={["admin"]}><SystemEvents /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><UserManagement /></ProtectedRoute>} />
            <Route path="/admin/search-analytics" element={<ProtectedRoute allowedRoles={["admin"]}><SearchAnalytics /></ProtectedRoute>} />
            <Route path="/admin/charter-search" element={<ProtectedRoute allowedRoles={["admin"]}><CharterSearch /></ProtectedRoute>} />

            {/* Routes accessible to all authenticated users (admin + broker + viewer) */}
            <Route path="/admin/brokersearch" element={<ProtectedRoute><BrokerSearch /></ProtectedRoute>} />
            <Route path="/admin/watchroutes" element={<ProtectedRoute allowedRoles={["admin", "broker"]}><WatchRoutes /></ProtectedRoute>} />
            <Route path="/admin/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;