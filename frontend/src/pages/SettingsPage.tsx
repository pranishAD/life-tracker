import { useEffect, useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import ErrorState from "../components/ErrorState";
import { Input } from "../components/Input";
import Skeleton from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCategoryWeights, useUpdateCategoryWeights } from "../hooks/useSettings";
import { updateMe } from "../api/auth";
import { CATEGORIES, CATEGORY_LABELS } from "../lib/category";
import type { Category } from "../api/types";

/** Settings: category weights (US-18) + profile name (US-19) + logout
 * (US-03). No dedicated screen mock exists for this — built in the design
 * system's spirit (Card/Input/Button), reusing the "Weights" link the
 * dashboard's Categories card already points here. */
export default function SettingsPage() {
  const { user, logout, setUser } = useAuth();
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useCategoryWeights();
  const updateWeights = useUpdateCategoryWeights();

  const [weights, setWeights] = useState<Record<Category, string>>({
    fitness: "1", study: "1", career: "1", custom: "1",
  });
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: Record<Category, string> = { fitness: "1", study: "1", career: "1", custom: "1" };
    for (const w of data.weights) next[w.category] = String(w.weight);
    setWeights(next);
  }, [data]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  async function handleSaveWeights(e: FormEvent) {
    e.preventDefault();
    const payload = CATEGORIES.map((c) => ({ category: c, weight: Number(weights[c]) || 1 }));
    await updateWeights.mutateAsync({ weights: payload });
    showToast("Category weights saved.");
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const updated = await updateMe(name);
      setUser(updated);
      showToast("Profile updated.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div>
      <header className="mb-5 md:mb-8">
        <h1 className="text-display-mobile md:text-display">Settings</h1>
      </header>

      <div className="flex flex-col gap-4 md:gap-5 max-w-[560px]">
        <Card>
          <h2 className="text-heading-md mb-4">Profile</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSaveName}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email" value={user?.email ?? ""} disabled className="opacity-60 cursor-not-allowed" />
            <Button type="submit" variant="secondary" disabled={savingName} className="self-start">
              {savingName ? "Saving…" : "Save name"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-heading-md mb-1">Category weights</h2>
          <p className="text-body-sm text-ink-muted mb-4">
            Higher weight = that category counts for more of your overall score. Equal by default.
          </p>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : isError ? (
            <ErrorState message="Couldn't load your weights." onRetry={() => refetch()} />
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSaveWeights}>
              {CATEGORIES.map((c) => (
                <label key={c} className="flex items-center justify-between gap-4">
                  <span className="text-body">{CATEGORY_LABELS[c]}</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={weights[c]}
                    onChange={(e) => setWeights((w) => ({ ...w, [c]: e.target.value }))}
                    className="w-24 bg-surface-2 border border-border-strong rounded-md p-2 text-body text-right outline-none focus:border-gold focus:shadow-focus"
                  />
                </label>
              ))}
              <Button type="submit" disabled={updateWeights.isPending} className="self-start">
                {updateWeights.isPending ? "Saving…" : "Save weights"}
              </Button>
            </form>
          )}
        </Card>

        <Card>
          <Button variant="danger" icon={<LogOut className="w-4 h-4" />} onClick={logout}>
            Log out
          </Button>
        </Card>
      </div>
    </div>
  );
}
