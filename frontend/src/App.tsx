import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import GoalDetailPage from "./pages/GoalDetailPage";
import GoalFormPage from "./pages/GoalFormPage";
import GoalTemplatesPage from "./pages/GoalTemplatesPage";
import GoalsPage from "./pages/GoalsPage";
import JournalEditorPage from "./pages/JournalEditorPage";
import JournalPage from "./pages/JournalPage";
import SettingsPage from "./pages/SettingsPage";
import WeeklyReviewPage from "./pages/WeeklyReviewPage";

/** Route table. Everything under the protected layout shares <AppShell/>
 * (sidebar/tab-bar + the check-in modal provider); /login and /register
 * render full-bleed with no shell. */
function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/goals/:goalId" element={<GoalDetailPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/review" element={<WeeklyReviewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* The journal editor is full-screen: protected, but outside the
          shell (no sidebar, tab bar or FAB). "/journal/new" also lands
          here (entryId = "new"), so creating an entry can swap the URL to
          /journal/<id> without remounting the editor. */}
      <Route
        path="/journal/:entryId"
        element={
          <ProtectedRoute>
            <JournalEditorPage />
          </ProtectedRoute>
        }
      />

      {/* Create / edit goal are focused pages too (screens 10-11b): no shell.
          React Router ranks "/goals/new" above "/goals/:goalId", so "new"
          is never mistaken for a goal id. */}
      <Route
        path="/goals/new"
        element={
          <ProtectedRoute>
            <GoalTemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals/new/details"
        element={
          <ProtectedRoute>
            <GoalFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals/:goalId/edit"
        element={
          <ProtectedRoute>
            <GoalFormPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
