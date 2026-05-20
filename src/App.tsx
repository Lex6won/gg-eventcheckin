import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./components/AdminLayout";

const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const AdminEvents = lazy(() => import("./pages/AdminEvents"));
const AdminEventDetail = lazy(() => import("./pages/AdminEventDetail"));
const AdminEventAttendees = lazy(() => import("./pages/AdminEventAttendees"));
const AdminAttendees = lazy(() => import("./pages/AdminAttendees"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminEventQR = lazy(() => import("./pages/AdminEventQR"));
const AdminTrainings = lazy(() => import("./pages/AdminTrainings"));
const AdminTrainingDetail = lazy(() => import("./pages/AdminTrainingDetail"));
const AdminTrainingTrainees = lazy(() => import("./pages/AdminTrainingTrainees"));
const AdminTrainingQR = lazy(() => import("./pages/AdminTrainingQR"));
const TrainingRegisterPage = lazy(() => import("./pages/TrainingRegisterPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-svh bg-background flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/register/:accessCode" element={<RegisterPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/attend/:accessCode" element={<AttendancePage />} />
            <Route path="/attend" element={<AttendancePage />} />
            <Route path="/training/:accessCode" element={<TrainingRegisterPage />} />
            <Route path="/training" element={<TrainingRegisterPage />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/events" replace />} />
              <Route path="dashboard" element={<Navigate to="/admin/events" replace />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="events/:eventId" element={<AdminEventDetail />} />
              <Route path="events/:eventId/attendees" element={<AdminEventAttendees />} />
              <Route path="events/:eventId/qr" element={<AdminEventQR />} />
              <Route path="trainings" element={<AdminTrainings />} />
              <Route path="trainings/:trainingId" element={<AdminTrainingDetail />} />
              <Route path="trainings/:trainingId/trainees" element={<AdminTrainingTrainees />} />
              <Route path="trainings/:trainingId/qr" element={<AdminTrainingQR />} />
              <Route path="attendees" element={<AdminAttendees />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
