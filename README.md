# Game Shelf

**A 3D shelf for the games you actually own.**

![Game Shelf — the shelf, then the whole collection](docs/demo.gif)

Most collections end up in a spreadsheet: a list of titles, storage sizes and backup dates. Useful, but it never feels like the shelf in the room.

Game Shelf puts that feeling back on screen. The first view is the shelf you see every day: a handful of covers you chose, standing in a warm pool of light. Hover a case and it lifts. Open it and you get the back cover, the studio and the year. Pull back and the shelf opens into the whole collection, laid out on a taller rack and split into the genres you actually think in.

The GIF above was recorded from a private collection build. The public demo data in this repository is fictional, so the project can be shared without shipping anyone's library.

## What it feels like

- **A front shelf, not a grid.** Nine featured games sit on two boards with a soft room light, cover sheen and a spring-loaded flip.
- **Pull back to the whole collection.** Scroll out and the featured shelf becomes the bottom of a full rack; the rest of the games fill the shelves above it.
- **Browse by mood.** Action, Adventure, RPG, Survival Horror and Racing each get their own wall.
- **Search across everything.** Find a game by title, studio, year or description.
- **Open a game.** Every entry has a detail page with its cover, developer, release year and notes.
- **Works on a phone.** The shelf becomes a stacked deck with swipe/wheel navigation and a dedicated detail view.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

```bash
npm run typecheck   # TypeScript check
npm run build       # production build
npm run art         # regenerate the demo cover art
```

No accounts, no database, no backend. The whole collection is one JSON file.

## Make it your shelf

Edit [`src/data/games.json`](src/data/games.json). A game looks like this:

```json
{
  "id": "aurora-drift",
  "title": "Aurora Drift",
  "shortTitle": "Aurora Drift",
  "developer": "Northlight Studio",
  "year": "2025",
  "description": "A short line for the hover card.",
  "longDescription": "The longer text used by the detail page.",
  "categories": ["racing"],
  "featured": true,
  "palette": ["#07142b", "#31e1c4", "#8b7bff"],
  "motif": "orbit",
  "bgColor": "#07142b"
}
```

- `featured: true` puts a game on the front shelf. The first nine featured entries fill the two boards; the rest live on the collection wall.
- `categories` accepts `action`, `adventure`, `rpg`, `horror` and `racing`.
- `palette` is the three-colour palette used by the generated artwork.
- `motif` chooses a pattern: `orbit`, `bloom`, `wave`, `prism`, `arc`, `grid`, `eclipse`, `monolith`, `stripes`, `spiral`, `constellation` or `rings`.

Then regenerate the demo artwork:

```bash
npm run art
```

Covers go to `public/demo/covers/`, back covers to `public/demo/backs/`.

### Use your own covers

Replace the generated SVGs with your own square images and update the extensions in `games.ts` if needed:

```ts
cover: asset(`/covers/${game.id}.webp`),
back: asset(`/backs/${game.id}.webp`),
```

The 3D scene and the page views share the same two files per game, so a square image around 1024×1024 is enough. Do not publish artwork you do not have the rights to redistribute.

## How it works

```text
src/
  app/
    page.tsx                     # shelf page
    games/[id]/page.tsx          # detail page
    library.css                  # shelf interface
  components/library/
    GameShelf.tsx                # DOM shell, search, mobile layout, category index
    ShelfScene.ts                # Three.js scene, camera, lighting, wall
    games.ts                     # data loader and helpers
    walls.ts                     # category wall entries
    layoutWall.ts                # two-row wall layout
    layoutCollectionRack.ts      # collection rack layout
    icons.tsx
  data/games.json                # the collection
  types/library.ts
public/demo/                     # demo covers, shelf model and textures
scripts/generate-demo-art.mjs    # cover/back generator
```

The shelf is a Three.js scene: a baked room model, a camera that eases between the shelf and the wall, DOM overlays for covers and buttons, and CSS for the editorial typography. The data layer is intentionally small; there is no API to wire up.

## Deploy

The app can be exported as static files:

```bash
NEXT_STATIC_EXPORT=1 npm run build
```

The output is in `out/`. For a project hosted under a sub-path:

```bash
NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/game-shelf npm run build
```

The repository also includes a GitHub Pages workflow at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Push to `main` and the site is built and published automatically, with no private server or custom domain.

## Artwork and third-party assets

All demo titles, studios, descriptions and cover art are fictional and were created for this project. Any real product names, logos or trademarks remain the property of their respective owners. The repository does not include commercial game artwork.

The shelf model, plastic-wrap textures and Inter font are third-party visual references included for parity with the original design. Read [`LICENSES/THIRD-PARTY.md`](LICENSES/THIRD-PARTY.md) before redistributing or using the project commercially.

## License

The application code and generated fictional cover art are released under the [MIT license](LICENSE). The third-party shelf model, PBR textures and Inter font are covered by their own terms; see [`LICENSES/THIRD-PARTY.md`](LICENSES/THIRD-PARTY.md).
