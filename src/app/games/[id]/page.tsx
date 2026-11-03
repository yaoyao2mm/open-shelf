import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  collectionCount,
  formatStatus,
  gameById,
  games,
  wallCategories,
} from "@/components/library/games";
import { DiscIcon } from "@/components/library/icons";
import "./game-detail.css";

export function generateStaticParams() {
  return games.map((game) => ({ id: game.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const game = gameById(id);
  if (!game) return { title: "Game not found — Game Shelf" };
  return {
    title: `${game.title} — Game Shelf`,
    description: game.description,
    openGraph: {
      title: `${game.title} — Game Shelf`,
      description: game.description,
      images: [game.cover],
    },
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = gameById(id);
  if (!game) notFound();

  const owned = game.status === "owned";
  const categories = game.categories
    .map((categoryId) => wallCategories.find((item) => item.id === categoryId))
    .filter(Boolean);

  return (
    <div className="gd-root">
      <header className="gd-header">
        <Link href="/" className="gd-back">
          ← Shelf
        </Link>
        <span className="gd-brand">
          <DiscIcon />
          Game Shelf
        </span>
        <span className="gd-count">
          {collectionCount} {collectionCount === 1 ? "game" : "games"}
        </span>
      </header>

      <main className="gd-main">
        <div className="gd-cover-wrap">
          <div className="gd-cover-frame">
            <Image
              className="gd-cover"
              src={game.cover}
              alt={`${game.title} cover`}
              width={1024}
              height={1024}
              priority
            />
          </div>
          <div className="gd-cover-caption">
            <span>{formatStatus(game.status)}</span>
            <span>{game.platform}</span>
          </div>
        </div>

        <div className="gd-copy">
          <p className="gd-kicker">
            {formatStatus(game.status)} · {game.platform} · {game.year}
          </p>
          <h1>{game.title}</h1>
          <p className="gd-byline">{game.developer}</p>
          <p className="gd-description">{game.longDescription}</p>

          <section className="gd-edition-panel" aria-labelledby="edition-title">
            <div className="gd-section-head">
              <h2 id="edition-title">Edition</h2>
              <span className="gd-demo-badge">Demo</span>
            </div>
            <dl>
              <div>
                <dt>Developer</dt>
                <dd>{game.developer}</dd>
              </div>
              <div>
                <dt>Released</dt>
                <dd>{game.year}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{game.platform}</dd>
              </div>
              <div>
                <dt>Categories</dt>
                <dd>
                  {categories
                    .map((category) => category?.label)
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            </dl>
            <p className="gd-note">
              This is a fictional entry created for the open-source demo. The
              title, studio and artwork are not real products.
            </p>
          </section>

          {!owned && (
            <section className="gd-placeholder" aria-labelledby="placeholder-title">
              <div className="gd-section-head">
                <h2 id="placeholder-title">Placeholder entry</h2>
                <span className="gd-muted-pill">Not owned</span>
              </div>
              <p>
                This cover is here to test the shelf layout. Add a real game
                when it joins the collection.
              </p>
            </section>
          )}

          <div className="gd-actions">
            <Link href="/" className="gd-action gd-action--dark">
              ← Back to the shelf
            </Link>
          </div>
        </div>
      </main>

      <footer className="gd-footer">
        <span>Fictional demo collection · generated artwork</span>
        <span>Open source · MIT</span>
      </footer>
    </div>
  );
}
