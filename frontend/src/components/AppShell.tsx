import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  LayoutDashboard,
  NotebookPen,
  PenLine,
  Plus,
  Settings as SettingsIcon,
  Target,
} from "lucide-react";
import clsx from "../lib/clsx";
import { useAuth } from "../context/AuthContext";
import { CheckInModalProvider, useCheckInModal } from "../context/CheckInModalContext";
import { useGoals } from "../hooks/useGoals";
import { useJournalStats } from "../hooks/useJournal";
import CheckInModal from "./CheckInModal";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/journal", label: "Journal", icon: NotebookPen },
  { to: "/review", label: "Weekly review", icon: CalendarCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const TAB_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/journal", label: "Journal", icon: NotebookPen },
  { to: "/review", label: "Review", icon: CalendarCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * App shell shared by every page except auth: left sidebar on desktop
 * (md: and up), bottom tab bar + FAB on mobile. `<Outlet />` renders the
 * active route's page — this is React Router's slot for nested routes.
 */
export default function AppShell() {
  return (
    <CheckInModalProvider>
      {({ isOpen, goalId, close }) => <AppShellInner checkInOpen={isOpen} checkInGoalId={goalId} closeCheckIn={close} />}
    </CheckInModalProvider>
  );
}

function AppShellInner({
  checkInOpen,
  checkInGoalId,
  closeCheckIn,
}: {
  checkInOpen: boolean;
  checkInGoalId?: string;
  closeCheckIn: () => void;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const { data: goals } = useGoals({ status: "active" });
  const { openCheckIn } = useCheckInModal();

  const navigate = useNavigate();

  // On Journal pages the FAB is "New entry" instead of "Log check-in", and
  // it's hidden on the empty journal (that screen has its own big button).
  // useJournalStats shares its cache with the Journal page, so this is not
  // an extra request.
  const onJournal = location.pathname.startsWith("/journal");
  const { data: journalStats } = useJournalStats({ enabled: onJournal });
  const showJournalFab = onJournal && (journalStats?.total_entries ?? 0) > 0;

  // The FAB/header button logs a check-in; with no active goals there's
  // nothing to check in on, so we hide it (matches the empty-state screens).
  const hasGoals = (goals?.length ?? 0) > 0;
  const showFab = !onJournal && hasGoals && location.pathname !== "/settings";

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)] bg-bg text-ink">
      <aside className="hidden md:flex md:flex-col md:gap-8 md:sticky md:top-0 md:h-screen md:py-6 md:px-4 border-r border-border">
        <div className="flex items-center gap-2 font-display text-[22px] font-bold px-3" style={{ letterSpacing: "-0.02em" }}>
          <span
            className="w-[22px] h-[22px] rounded-full flex-none"
            style={{ border: "4px solid #ffc93c", borderRightColor: "rgba(255,201,60,.16)", transform: "rotate(-45deg)" }}
          />
          Bihan
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-body font-medium",
                  isActive ? "bg-surface-1 text-ink" : "text-ink-muted hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx("w-5 h-5", isActive && "text-gold")} strokeWidth={2} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/settings"
          className="mt-auto flex items-center gap-3 p-3 rounded-md bg-surface-1"
        >
          <span className="w-8 h-8 rounded-full bg-surface-3 grid place-items-center text-body-sm font-semibold flex-none">
            {user ? initials(user.name) : "?"}
          </span>
          <div className="min-w-0">
            <div className="text-body-sm font-semibold truncate">{user?.name ?? "Account"}</div>
            <div className="text-body-sm text-ink-muted">Settings</div>
          </div>
        </NavLink>
      </aside>

      <main className="w-full max-w-main px-4 pt-5 pb-24 md:px-12 md:pt-8 md:pb-12">
        <div className="md:hidden flex justify-between items-center mb-5">
          <div className="flex items-center gap-2 font-display text-[22px] font-bold" style={{ letterSpacing: "-0.02em" }}>
            <span
              className="w-[22px] h-[22px] rounded-full flex-none"
              style={{ border: "4px solid #ffc93c", borderRightColor: "rgba(255,201,60,.16)", transform: "rotate(-45deg)" }}
            />
            Bihan
          </div>
          <NavLink to="/settings" className="w-8 h-8 rounded-full bg-surface-3 grid place-items-center text-body-sm font-semibold">
            {user ? initials(user.name) : "?"}
          </NavLink>
        </div>
        <Outlet />
      </main>

      <nav className="md:hidden fixed left-0 right-0 bottom-0 h-tabbar grid grid-cols-5 bg-surface-1/95 backdrop-blur border-t border-border px-2 pt-2 pb-3.5 z-10">
        {TAB_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="flex flex-col items-center justify-center gap-1 text-[11px] text-ink-subtle">
            {({ isActive }) => (
              <>
                <Icon className={clsx("w-5 h-5", isActive ? "text-gold" : undefined)} strokeWidth={2} />
                <span className={isActive ? "text-ink" : undefined}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {showFab && (
        <button
          className="md:hidden fixed right-4 bottom-[88px] w-fab h-fab rounded-full bg-gold text-ink-on-gold grid place-items-center shadow-lg z-10"
          aria-label="Log check-in"
          onClick={() => openCheckIn()}
        >
          <Plus className="w-6 h-6" strokeWidth={2} />
        </button>
      )}

      {showJournalFab && (
        <button
          className="md:hidden fixed right-4 bottom-[88px] w-fab h-fab rounded-full bg-gold text-ink-on-gold grid place-items-center shadow-lg z-10"
          aria-label="New entry"
          onClick={() => navigate("/journal/new")}
        >
          <PenLine className="w-6 h-6" strokeWidth={2} />
        </button>
      )}

      {checkInOpen && <CheckInModal goalId={checkInGoalId} onClose={closeCheckIn} />}
    </div>
  );
}
