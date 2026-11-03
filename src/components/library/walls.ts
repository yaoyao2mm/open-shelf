import type { WallCategoryId } from "@/types/library";
import { games } from "./games";

/**
 * Wall cover entries for the zoomed-out collection wall and the category
 * walls. The wall is a view of the collection, not a mood board: only games
 * present in the data appear here.
 */
export interface WallCoverEntry {
  slug: string;
  title: string;
  category: string;
  cover: string;
}

/** Owned games that belong to a category. */
const ownedInCategory = (categoryId: WallCategoryId) =>
  games.filter(
    (game) => game.status === "owned" && game.categories.includes(categoryId),
  );

export const getWallCovers = (categoryId: WallCategoryId): WallCoverEntry[] => {
  if (categoryId === "featured") {
    // The featured wall is the curated main shelf.
    return games
      .filter((game) => game.featured !== false)
      .map((game) => ({
        slug: game.id,
        title: game.title,
        category: "featured",
        cover: game.cover,
      }));
  }

  return ownedInCategory(categoryId).map((game) => ({
    slug: game.id,
    title: game.title,
    category: categoryId,
    cover: game.cover,
  }));
};

/** Count of owned covers on each category wall. */
export const wallCoverCount = (categoryId: WallCategoryId): number => {
  if (categoryId === "featured") {
    return games.filter((game) => game.featured !== false).length;
  }
  return ownedInCategory(categoryId).length;
};
