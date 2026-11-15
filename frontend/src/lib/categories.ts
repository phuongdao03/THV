import type { PublicCategory } from "@/lib/api/types";

export function categoryLabels<
  TCategory extends Pick<PublicCategory, "id" | "parentId" | "name">,
>(categories: readonly TCategory[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const labels = new Map<string, string>();

  for (const category of categories) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: TCategory | undefined = category;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    labels.set(category.id, path.join(" / "));
  }

  return labels;
}
