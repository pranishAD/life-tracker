// Category -> icon/label lookup (components.md: "Fitness = dumbbell, Study =
// book-open, Career = briefcase, Custom = sparkles").
import { BookOpen, Briefcase, Dumbbell, Sparkles, type LucideIcon } from "lucide-react";
import type { Category } from "../api/types";

export const CATEGORY_LABELS: Record<Category, string> = {
  fitness: "Fitness",
  study: "Study",
  career: "Career",
  custom: "Custom",
};

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  fitness: Dumbbell,
  study: BookOpen,
  career: Briefcase,
  custom: Sparkles,
};

export const CATEGORIES: Category[] = ["fitness", "study", "career", "custom"];
