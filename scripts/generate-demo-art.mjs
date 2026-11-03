#!/usr/bin/env node
/**
 * Generates the fictional demo cover art in public/demo.
 *
 * The covers are plain SVG so the repository stays small and every asset can be
 * recoloured or replaced without an image editor. Run `npm run art` after
 * editing src/data/games.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const games = JSON.parse(
  await readFile(join(root, "src/data/games.json"), "utf8"),
);

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const darken = (hex, amount = 0.55) => {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    Math.round(parseInt(value.slice(offset, offset + 2), 16) * amount),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const rgba = (hex, alpha) => {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16),
  );
  return `rgba(${channels.join(", ")}, ${alpha})`;
};

const hash = (text) => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

const random = (seed) => {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

const titleLines = (title) => {
  const words = title.split(" ");
  if (words.length === 1) return [title];
  if (title.length <= 15) return [title];
  const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")];
};

function motif(kind, [bg, primary, secondary], id) {
  const rand = random(hash(id));
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;

  switch (kind) {
    case "orbit": {
      return `
        <g ${common}>
          <circle cx="500" cy="410" r="210" stroke="${primary}" stroke-opacity=".32" stroke-width="2"/>
          <circle cx="500" cy="410" r="286" stroke="${secondary}" stroke-opacity=".22" stroke-width="1.5"/>
          <ellipse cx="500" cy="410" rx="318" ry="108" stroke="${primary}" stroke-opacity=".6" stroke-width="3" transform="rotate(-18 500 410)"/>
          <ellipse cx="500" cy="410" rx="270" ry="86" stroke="${secondary}" stroke-opacity=".45" stroke-width="2" transform="rotate(24 500 410)"/>
          <circle cx="500" cy="410" r="116" fill="${rgba(primary, 0.94)}"/>
          <circle cx="500" cy="410" r="116" fill="url(#planetShade)"/>
          <circle cx="760" cy="330" r="16" fill="${secondary}"/>
          <circle cx="214" cy="512" r="9" fill="${primary}"/>
        </g>`;
    }
    case "bloom": {
      const petals = Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30;
        return `<ellipse cx="500" cy="300" rx="58" ry="172" fill="${rgba(index % 2 ? secondary : primary, 0.34)}" transform="rotate(${angle} 500 410)"/>`;
      }).join("");
      return `
        <g>
          ${petals}
          <circle cx="500" cy="410" r="102" fill="${rgba(primary, 0.9)}"/>
          <circle cx="500" cy="410" r="54" fill="${rgba(bg, 0.8)}"/>
          <circle cx="500" cy="410" r="18" fill="${secondary}"/>
        </g>`;
    }
    case "wave": {
      const waves = Array.from({ length: 7 }, (_, index) => {
        const y = 270 + index * 46;
        const color = index % 2 ? secondary : primary;
        return `<path d="M -20 ${y} C 160 ${y - 90}, 330 ${y + 90}, 510 ${y} S 840 ${y - 90}, 1020 ${y}" stroke="${rgba(color, 0.5)}" stroke-width="${3 + (index % 3)}"/>`;
      }).join("");
      return `<g ${common}>${waves}</g>`;
    }
    case "prism": {
      return `
        <g>
          <polygon points="500,170 820,690 180,690" fill="${rgba(primary, 0.2)}" stroke="${rgba(primary, 0.65)}" stroke-width="3"/>
          <polygon points="500,280 740,650 260,650" fill="${rgba(secondary, 0.16)}" stroke="${rgba(secondary, 0.55)}" stroke-width="2"/>
          <polygon points="500,390 650,620 350,620" fill="${rgba(primary, 0.28)}" stroke="${rgba(primary, 0.8)}" stroke-width="2"/>
          <line x1="500" y1="120" x2="500" y2="720" stroke="${rgba(secondary, 0.3)}" stroke-width="1.5"/>
        </g>`;
    }
    case "arc": {
      return `
        <g ${common}>
          <path d="M 120 700 A 380 380 0 0 1 880 700" stroke="${primary}" stroke-opacity=".72" stroke-width="5"/>
          <path d="M 200 700 A 300 300 0 0 1 800 700" stroke="${secondary}" stroke-opacity=".55" stroke-width="3"/>
          <path d="M 280 700 A 220 220 0 0 1 720 700" stroke="${primary}" stroke-opacity=".4" stroke-width="2"/>
          <circle cx="500" cy="320" r="12" fill="${secondary}"/>
          <circle cx="500" cy="320" r="42" stroke="${rgba(secondary, 0.5)}" stroke-width="1.5"/>
        </g>`;
    }
    case "grid": {
      const horizontals = Array.from({ length: 9 }, (_, index) => {
        const y = 380 + Math.pow(index / 8, 1.8) * 360;
        return `<line x1="60" y1="${y}" x2="940" y2="${y}" stroke="${rgba(primary, 0.16 + index * 0.03)}" stroke-width="1.5"/>`;
      }).join("");
      const verticals = Array.from({ length: 13 }, (_, index) => {
        const bottom = 60 + index * 73.33;
        return `<line x1="${bottom}" y1="740" x2="500" y2="380" stroke="${rgba(secondary, 0.24)}" stroke-width="1.5"/>`;
      }).join("");
      return `
        <g>
          <circle cx="500" cy="300" r="128" fill="${rgba(primary, 0.12)}" stroke="${rgba(primary, 0.55)}" stroke-width="2"/>
          <circle cx="500" cy="300" r="70" fill="${rgba(secondary, 0.18)}"/>
          ${horizontals}${verticals}
        </g>`;
    }
    case "eclipse": {
      return `
        <g>
          <circle cx="500" cy="400" r="230" fill="${rgba(primary, 0.22)}"/>
          <circle cx="500" cy="400" r="190" fill="${rgba(primary, 0.86)}"/>
          <circle cx="572" cy="352" r="172" fill="${rgba(bg, 0.96)}"/>
          <circle cx="500" cy="400" r="238" fill="none" stroke="${rgba(secondary, 0.65)}" stroke-width="2"/>
          <circle cx="500" cy="400" r="282" fill="none" stroke="${rgba(primary, 0.22)}" stroke-width="1.5"/>
          <circle cx="724" cy="252" r="7" fill="${secondary}"/>
          <circle cx="268" cy="522" r="4" fill="${primary}"/>
        </g>`;
    }
    case "monolith": {
      const bars = Array.from({ length: 7 }, (_, index) => {
        const width = 48 + (index % 3) * 18;
        const height = 130 + ((index * 79) % 260);
        const x = 170 + index * 100;
        const y = 700 - height;
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${rgba(index % 2 ? secondary : primary, 0.24)}" stroke="${rgba(index % 2 ? secondary : primary, 0.55)}" stroke-width="2"/>`;
      }).join("");
      return `<g>${bars}<line x1="120" y1="700" x2="880" y2="700" stroke="${rgba(primary, 0.5)}" stroke-width="2"/></g>`;
    }
    case "stripes": {
      const bars = Array.from({ length: 9 }, (_, index) => {
        const x = -380 + index * 190;
        return `<rect x="${x}" y="-80" width="58" height="1180" fill="${rgba(index % 2 ? secondary : primary, 0.16)}" transform="rotate(24 500 500)"/>`;
      }).join("");
      return `<g>${bars}<circle cx="500" cy="430" r="118" fill="${rgba(bg, 0.72)}" stroke="${rgba(primary, 0.7)}" stroke-width="3"/></g>`;
    }
    case "spiral": {
      const points = [];
      for (let index = 0; index < 220; index++) {
        const angle = index * 0.18;
        const radius = 12 + index * 1.7;
        points.push(
          `${(500 + Math.cos(angle) * radius).toFixed(1)},${(430 + Math.sin(angle) * radius).toFixed(1)}`,
        );
      }
      return `<g ${common}><polyline points="${points.join(" ")}" stroke="${rgba(primary, 0.72)}" stroke-width="3"/><circle cx="500" cy="430" r="252" stroke="${rgba(secondary, 0.2)}" stroke-width="1.5"/></g>`;
    }
    case "constellation": {
      const nodes = Array.from({ length: 18 }, () => ({
        x: 140 + rand() * 720,
        y: 150 + rand() * 480,
        size: 2 + rand() * 5,
      }));
      const links = nodes
        .slice(0, -1)
        .map((node, index) => {
          const next = nodes[index + 1];
          return `<line x1="${node.x}" y1="${node.y}" x2="${next.x}" y2="${next.y}" stroke="${rgba(primary, 0.28)}" stroke-width="1.5"/>`;
        })
        .join("");
      return `<g>${links}${nodes.map((node) => `<circle cx="${node.x}" cy="${node.y}" r="${node.size}" fill="${index(node) ? primary : secondary}"/>`).join("")}</g>`;
    }
    case "rings": {
      return `
        <g ${common}>
          ${Array.from({ length: 7 }, (_, index) => `<circle cx="500" cy="420" r="${70 + index * 42}" stroke="${rgba(index % 2 ? secondary : primary, 0.5 - index * 0.04)}" stroke-width="${index === 2 ? 4 : 2}" stroke-dasharray="${index % 2 ? "18 14" : "none"}"/>`).join("")}
          <circle cx="500" cy="420" r="20" fill="${secondary}"/>
        </g>`;
    }
    default:
      return "";
  }

  function index(node) {
    return Math.round(node.x + node.y) % 3 === 0;
  }
}

function coverSvg(game) {
  const [bg, primary, secondary] = game.palette;
  const lines = titleLines(game.title);
  const titleSize = lines.length > 1 ? 68 : 78;
  const title = lines
    .map(
      (line, index) =>
        `<tspan x="86" dy="${index === 0 ? 0 : titleSize * 1.02}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" role="img" aria-label="${escapeXml(game.title)} cover">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${darken(bg, 0.66)}"/>
    </linearGradient>
    <radialGradient id="glow" cx=".52" cy=".38" r=".55">
      <stop offset="0" stop-color="${rgba(primary, 0.28)}"/>
      <stop offset="1" stop-color="${rgba(primary, 0)}"/>
    </radialGradient>
    <radialGradient id="planetShade" cx=".32" cy=".24" r=".9">
      <stop offset="0" stop-color="rgba(255,255,255,.38)"/>
      <stop offset=".55" stop-color="rgba(255,255,255,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,.45)"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".52" stop-color="${rgba(bg, 0)}"/>
      <stop offset="1" stop-color="${rgba(bg, 0.96)}"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope=".05"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1000" height="1000" fill="url(#bg)"/>
  <rect width="1000" height="1000" fill="url(#glow)"/>
  <g filter="url(#soft)" opacity=".65">${motif(game.motif, game.palette, game.id)}</g>
  <g opacity=".94">${motif(game.motif, game.palette, game.id)}</g>
  <rect width="1000" height="1000" fill="url(#fade)"/>
  <rect width="1000" height="1000" filter="url(#grain)" opacity=".8"/>
  <g fill="#f7f5ef" font-family="Helvetica Neue, Inter, Arial, sans-serif">
    <text x="86" y="74" font-size="18" letter-spacing="5" opacity=".68">GAME SHELF</text>
    <text x="914" y="74" font-size="16" letter-spacing="3" text-anchor="end" opacity=".55">DEMO EDITION</text>
    <text x="86" y="${720 - (lines.length - 1) * titleSize * 1.02}" font-size="${titleSize}" font-weight="700" letter-spacing="-1">${title}</text>
    <text x="86" y="902" font-size="22" letter-spacing="1" opacity=".68">${escapeXml(game.developer)}</text>
    <text x="914" y="902" font-size="18" letter-spacing="2" text-anchor="end" opacity=".55">${escapeXml(game.year)}</text>
  </g>
  <rect x="86" y="936" width="828" height="1" fill="rgba(255,255,255,.22)"/>
  <text x="86" y="972" font-family="Helvetica Neue, Inter, Arial, sans-serif" font-size="15" letter-spacing="3" fill="rgba(255,255,255,.5)">FICTIONAL COLLECTION · OPEN SOURCE DEMO</text>
</svg>`;
}

function backSvg(game) {
  const [bg, primary, secondary] = game.palette;
  const lines = game.longDescription.match(/.{1,52}(?:\s|$)/g) ?? [];
  const paragraphs = lines
    .slice(0, 6)
    .map(
      (line, index) =>
        `<text x="86" y="${384 + index * 38}" font-size="22" fill="rgba(247,245,239,.82)" font-family="Helvetica Neue, Inter, Arial, sans-serif">${escapeXml(line.trim())}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" role="img" aria-label="${escapeXml(game.title)} back cover">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${darken(bg, 0.8)}"/>
      <stop offset="1" stop-color="${darken(bg, 0.4)}"/>
    </linearGradient>
    <radialGradient id="glow" cx=".7" cy=".2" r=".7">
      <stop offset="0" stop-color="${rgba(primary, 0.24)}"/>
      <stop offset="1" stop-color="${rgba(primary, 0)}"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1000" height="1000" fill="url(#bg)"/>
  <rect width="1000" height="1000" fill="url(#glow)"/>
  <g opacity=".24" filter="url(#soft)" transform="translate(0 40)">${motif(game.motif, game.palette, game.id)}</g>
  <g fill="#f7f5ef" font-family="Helvetica Neue, Inter, Arial, sans-serif">
    <text x="86" y="92" font-size="18" letter-spacing="5" opacity=".6">GAME SHELF</text>
    <text x="86" y="188" font-size="52" font-weight="700" letter-spacing="-1">${escapeXml(game.title)}</text>
    <text x="86" y="234" font-size="20" letter-spacing="1" opacity=".62">${escapeXml(game.developer)} · ${escapeXml(game.year)}</text>
    <line x1="86" y1="272" x2="914" y2="272" stroke="rgba(255,255,255,.22)"/>
    <text x="86" y="330" font-size="15" letter-spacing="4" fill="${primary}">ABOUT THIS EDITION</text>
    ${paragraphs}
    <text x="86" y="676" font-size="15" letter-spacing="4" fill="${secondary}">IN THE BOX</text>
    <text x="86" y="718" font-size="21" opacity=".8">One disc · one fictional world · zero downloads</text>
    <text x="86" y="756" font-size="21" opacity=".8">A demo entry for the open-source shelf</text>
    <text x="86" y="840" font-size="14" letter-spacing="3" opacity=".45">CATALOGUE ${escapeXml(game.id.toUpperCase())}</text>
    <text x="86" y="920" font-size="14" opacity=".45">Demo artwork generated by scripts/generate-demo-art.mjs</text>
  </g>
  <g fill="rgba(247,245,239,.86)">
    ${Array.from({ length: 38 }, (_, index) => `<rect x="${772 + index * 4}" y="806" width="${index % 4 === 0 ? 2 : 1}" height="${index % 5 === 0 ? 62 : 48}"/>`).join("")}
  </g>
  <rect width="1000" height="1000" filter="url(#grain)" opacity=".8"/>
</svg>`;
}

await mkdir(join(root, "public/demo/covers"), { recursive: true });
await mkdir(join(root, "public/demo/backs"), { recursive: true });

for (const game of games) {
  await writeFile(
    join(root, "public/demo/covers", `${game.id}.svg`),
    coverSvg(game),
  );
  await writeFile(
    join(root, "public/demo/backs", `${game.id}.svg`),
    backSvg(game),
  );
}

console.log(`Generated ${games.length * 2} demo artworks.`);
