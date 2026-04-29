import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import AttendancePage from "./pages/AttendancePage";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./components/AdminLayout";
import AdminEvents from "./pages/AdminEvents";
import AdminEventDetail from "./pages/AdminEventDetail";
import AdminEventAttendees from "./pages/AdminEventAttendees";
import AdminAttendees from "./pages/AdminAttendees";
import AdminSettings from "./pages/AdminSettings";
import AdminEventQR from "./pages/AdminEventQR";
import AdminTrainings from "./pages/AdminTrainings";
import AdminTrainingDetail from "./pages/AdminTrainingDetail";
import AdminTrainingTrainees from "./pages/AdminTrainingTrainees";
import AdminTrainingQR from "./pages/AdminTrainingQR";
import TrainingRegisterPage from "./pages/TrainingRegisterPage";
import RegisterPage from "./pages/RegisterPage";
import AdminEventCheckin from "./pages/AdminEventCheckin";
import AdminTrainingCheckin from "./pages/AdminTrainingCheckin";
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
              <Route path="events/:eventId/checkin" element={<AdminEventCheckin />} />
              <Route path="trainings" element={<AdminTrainings />} />
              <Route path="trainings/:trainingId" element={<AdminTrainingDetail />} />
              <Route path="trainings/:trainingId/trainees" element={<AdminTrainingTrainees />} />
              <Route path="trainings/:trainingId/qr" element={<AdminTrainingQR />} />
              <Route path="trainings/:trainingId/checkin" element={<AdminTrainingCheckin />} />
              <Route path="attendees" element={<AdminAttendees />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
