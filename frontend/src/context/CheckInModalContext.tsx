// Lets any page (Dashboard, Goals, Goal detail) open the "Log check-in"
// modal — optionally preselecting a goal — without prop-drilling a setter
// down through the router. The modal itself is rendered once, in AppShell.
import { createContext, useContext, useState, type ReactNode } from "react";

interface CheckInModalValue {
  openCheckIn: (goalId?: string) => void;
}

const CheckInModalContext = createContext<CheckInModalValue | null>(null);

interface ProviderProps {
  children: (state: { isOpen: boolean; goalId?: string; close: () => void }) => ReactNode;
}

export function CheckInModalProvider({ children }: ProviderProps) {
  const [state, setState] = useState<{ isOpen: boolean; goalId?: string }>({ isOpen: false });

  const openCheckIn = (goalId?: string) => setState({ isOpen: true, goalId });
  const close = () => setState({ isOpen: false, goalId: undefined });

  return (
    <CheckInModalContext.Provider value={{ openCheckIn }}>
      {children({ isOpen: state.isOpen, goalId: state.goalId, close })}
    </CheckInModalContext.Provider>
  );
}

export function useCheckInModal(): CheckInModalValue {
  const ctx = useContext(CheckInModalContext);
  if (!ctx) throw new Error("useCheckInModal must be used inside <CheckInModalProvider>");
  return ctx;
}
