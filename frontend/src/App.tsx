import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Investigation from "./pages/Investigation";
import Comparison from "./pages/Comparison";
import Provenance from "./pages/Provenance";
import Reports from "./pages/Reports";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lab" element={<Investigation />} />
        <Route path="/compare" element={<Comparison />} />
        <Route path="/provenance" element={<Provenance />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
