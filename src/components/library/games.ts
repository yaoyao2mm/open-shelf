import type {
  Game,
  GameId,
  GameStatus,
  WallCategory,
  WallCategoryId,
} from "@/types/library";
import { layoutWall } from "@/components/library/layoutWall";
import gameContent from "@/data/games.json";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const asset = (path: string) => `${BASE_PATH}/demo${path}`;

interface GameContent {
  id: string;
  title: string;
  shortTitle: string;
  developer: string;
  year: string;
  description: string;
  longDescription: string;
  categories: WallCategoryId[];
  featured: boolean;
  palette: [string, string, string];
  motif: string;
  bgColor: string;
}

const content = gameContent as GameContent[];
const featuredContent = content.filter((game) => game.featured !== false);
const featuredPositions = layoutWall(
  featuredContent.length,
  featuredContent.length === 9,
);

const positionFor = (index: number): [number, number, number] => {
  const featuredIndex = featuredContent.findIndex(
    (game) => game.id === content[index].id,
  );
  if (featuredIndex < 0) return [0, 0, 0];
  const position = featuredPositions[featuredIndex] ?? featuredPositions[0];
  return [position.x, position.y, position.z];
};

export const games: Game[] = content.map((game, index) => {
  const featured = game.featured !== false;
  return {
    ...game,
    status: "owned",
    groupPosition: positionFor(index),
    hoverOffset: featured ? 0.115 : 0.1,
    buttonsOffset: featured ? undefined : 0.028,
    platform: "PlayStation 5",
    cover: asset(`/covers/${game.id}.svg`),
    back: asset(`/backs/${game.id}.svg`),
  };
});

/**
 * The walls the shelf can open onto. Every game belongs to at least one of
 * these categories; "featured" is the curated front shelf.
 */
export const wallCategories: WallCategory[] = [
  { id: "featured", label: "Featured", labelZh: "精选" },
  { id: "action", label: "Action", labelZh: "动作" },
  { id: "adventure", label: "Adventure", labelZh: "冒险" },
  { id: "rpg", label: "RPG", labelZh: "角色扮演" },
  { id: "horror", label: "Survival Horror", labelZh: "生存恐怖" },
  { id: "racing", label: "Racing", labelZh: "竞速" },
];

export const categoryGameCount = (id: WallCategoryId) =>
  id === "featured"
    ? games.filter((game) => game.featured !== false).length
    : games.filter((game) => game.categories.includes(id)).length;

export const gameById = (id: string): Game | undefined =>
  games.find((game) => game.id === id);

export const gameHref = (game: Game) => `/games/${game.id}`;

export const formatStatus = (status: GameStatus) =>
  status === "owned" ? "Owned" : "Placeholder";

export const ownedCount = games.filter((game) => game.status === "owned").length;

export const collectionCount = games.length;
