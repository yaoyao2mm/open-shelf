export type GameId = string;

export type GameStatus = "owned" | "placeholder";

export type WallCategoryId =
  | "featured"
  | "action"
  | "adventure"
  | "rpg"
  | "horror"
  | "racing";

export interface WallCategory {
  id: WallCategoryId;
  label: string;
  labelZh: string;
}

export interface Game {
  id: GameId;
  title: string;
  shortTitle: string;
  description: string;
  longDescription: string;
  status: GameStatus;
  featured?: boolean;
  year: string;
  developer: string;
  platform: string;
  groupPosition: [number, number, number];
  hoverOffset: number;
  buttonsOffset?: number;
  bgColor: string;
  categories: WallCategoryId[];
  cover: string;
  back: string;
  video?: string;
  palette?: [string, string, string];
  motif?: string;
}
