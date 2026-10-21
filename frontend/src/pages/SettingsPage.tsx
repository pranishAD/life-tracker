import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import { Input } from "../components/Input";
import Skeleton from "../components/Skeleton";
import CategoriesSettings from "../components/settings/CategoriesSettings";
import clsx from "../lib/clsx";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCategories } from "../hooks/useCategories";
import { useCategoryWeights, useUpdateCategoryWeights } from "../hooks/useSettings";
import { updateMe } from "../api/auth";
import { NUMBER_LIMITS, TEXT_LIMITS } from "../lib/limits";

// Notifications and Data tabs from the design aren't built (those features
// don't exist yet), so they're left out rather than shown empty.
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "categories", label: "Categories" },
  { id: "scoring", label: "Scoring" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Settings with tabs (screen 12). The active tab lives in the URL
 * (?tab=categories) so links like the dashboard's "Weights" can open the
 * right one, and Back works between tabs. */
export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get("tab"))?.id ?? "profile";

  function select(id: TabId) {
    setParams({ tab: id }, { replace: true });
  }

  // Arrow keys move between tabs (the standard keyboard pattern for tabs).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(i + delta + TABS.length) % TABS.length];
    select(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <header className="mb-5 md:mb-6">
        <p className="text-body-sm text-ink-muted mb-1">Settings</p>
        <h1 className="text-display-mobile md:text-display">Settings</h1>
      </header>

      <div
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={onKeyDown}
        className="flex gap-6 border-b border-border mb-6 overflow-x-auto [scrollbar-width:none]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`settings-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={clsx(
              "py-3 -mb-px border-b-2 text-[15px] leading-5 font-medium whitespace-nowrap focus-visible:shadow-focus focus-visible:outline-none",
              tab === t.id ? "border-gold text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {tab === "profile" && <ProfileTab />}
        {tab === "categories" && <CategoriesSettings />}
        {tab === "scoring" && <ScoringTab />}
      </div>
    </div>
  );
}

/** Profile name (US-19) + logout (US-03). */
function ProfileTab() {
  const { user, logout, setUser } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const updated = await updateMe(name);
      setUser(updated);
      showToast("Profile updated.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't update your name.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5 max-w-[560px]">
      <Card>
        <h2 className="text-heading-md mb-4">Profile</h2>
        <form className="flex flex-col gap-4" onSubmit={handleSaveName}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={TEXT_LIMITS.userName} required />
          <Input label="Email" value={user?.email ?? ""} disabled className="opacity-60 cursor-not-allowed" />
          <Button type="submit" variant="secondary" disabled={savingName} className="self-start">
            {savingName ? "Saving…" : "Save name"}
          </Button>
        </form>
      </Card>
      <Card>
        <Button variant="danger" icon={<LogOut className="w-4 h-4" />} onClick={logout}>
          Log out
        </Button>
      </Card>
    </div>
  );
}

/** Category weights (US-18): one row per category, in the user's order. */
function ScoringTab() {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useCategoryWeights();
  const { data: categories } = useCategories();
  const updateWeights = useUpdateCategoryWeights();
  // category_id → the text in its input (strings so "1." can be typed).
  const [weights, setWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setWeights(Object.fromEntries(data.weights.map((w) => [w.category_id, String(w.weight)])));
  }, [data]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const payload = (data?.weights ?? []).map((w) => ({
      category_id: w.category_id,
      weight: Number(weights[w.category_id]) || 1,
    }));
    // Same range the backend enforces: greater than 0, less than 1000.
    if (payload.some((w) => w.weight <= 0 || w.weight >= NUMBER_LIMITS.weightMaxExclusive)) {
      showToast(`Weights must be more than 0 and less than ${NUMBER_LIMITS.weightMaxExclusive}.`);
      return;
    }
    try {
      await updateWeights.mutateAsync({ weights: payload });
      showToast("Category weights saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save your weights.");
    }
  }

  return (
    <div className="max-w-[560px]">
      <Card>
        <h2 className="text-heading-md mb-1">Category weights</h2>
        <p className="text-body-sm text-ink-muted mb-4">
          Higher weight = that category counts for more of your overall score. Equal by default.
        </p>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : isError || !data ? (
          <ErrorState message="Couldn't load your weights." onRetry={() => refetch()} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            {data.weights.map((w) => {
              const c = categories?.find((x) => x.id === w.category_id);
              const id = `weight-${w.category_id}`;
              return (
                <div key={w.category_id} className="flex items-center justify-between gap-4">
                  <label htmlFor={id} className="text-body flex items-center gap-2 min-w-0">
                    {c && (
                      <span aria-hidden="true" className="font-emoji">
                        {c.emoji}
                      </span>
                    )}
                    <span className="truncate">{c?.name ?? "Category"}</span>
                  </label>
                  <input
                    id={id}
                    type="number"
                    min="0.1"
                    max={NUMBER_LIMITS.weightMaxExclusive - 0.1}
                    step="0.1"
                    value={weights[w.category_id] ?? ""}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [w.category_id]: e.target.value }))}
                    className="w-24 bg-surface-2 border border-border-strong rounded-md p-2 text-body text-right outline-none focus:border-gold focus:shadow-focus"
                  />
                </div>
              );
            })}
            <Button type="submit" disabled={updateWeights.isPending} className="self-start">
              {updateWeights.isPending ? "Saving…" : "Save weights"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
