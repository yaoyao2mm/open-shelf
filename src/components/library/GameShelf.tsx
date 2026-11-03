"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  games as albums,
  gameById as albumById,
  gameHref as albumHref,
  formatStatus,
  wallCategories,
  categoryGameCount,
} from "./games";
import { wallCoverCount } from "./walls";
import { ShelfScene } from "./ShelfScene";
import {
  MenuIcon,
  SearchIcon,
  DiscIcon,
} from "./icons";
import type { GameId, WallCategoryId } from "@/types/library";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function applyFlipVars(root: HTMLElement, angle: number) {
  const visibleAngle = Math.max(0, Math.min(180, angle));
  const radians = (visibleAngle * Math.PI) / 180;
  root.style.setProperty("--flip-angle", `${angle.toFixed(2)}deg`);
  root.style.setProperty("--flip-lift", `${(Math.sin(radians) * 16).toFixed(2)}px`);
  root.style.setProperty("--flip-shade", `${(Math.sin(radians) * 0.2).toFixed(3)}`);
}

// The front shelf is the curated set. Extra games stay searchable and get a
// detail page, but live on the zoomed-out wall instead.
const shelfGames = albums.filter((album) => album.featured !== false);

export function GameShelf() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShelfScene | null>(null);
  const desktopDetailRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<Map<GameId, HTMLDivElement>>(new Map());
  const openButtonRef = useRef<HTMLDivElement | null>(null);

  const [activeId, setActiveId] = useState<GameId | null>(null);
  const [ready, setReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [currentWall, setCurrentWall] = useState<"featured" | "action" | "adventure" | "rpg" | "horror" | "racing">("featured");
  const [wallSwitchInProgress, setWallSwitchInProgress] = useState(false);
  const pendingWallRef = useRef<WallCategoryId>("featured");

  const flipAngle = useRef(0);
  const flipVelocity = useRef(0);
  const flipTarget = useRef(0);
  const flipFrame = useRef<number | null>(null);
  const flipRunning = useRef(false);

  const activeAlbum = activeId ? albumById(activeId) : null;
  const mobileAlbum = shelfGames[mobileIndex] ?? shelfGames[0];

  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return albums.filter((album) =>
      [album.title, album.description, album.year, album.developer, album.status]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [searchQuery]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const compactQuery = window.matchMedia("(max-width: 1023px)");
    const sync = () => {
      setIsMobile(mobileQuery.matches);
      setIsCompact(compactQuery.matches);
    };
    sync();
    mobileQuery.addEventListener("change", sync);
    compactQuery.addEventListener("change", sync);
    return () => {
      mobileQuery.removeEventListener("change", sync);
      compactQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: ShelfScene | null = null;
    try {
      scene = new ShelfScene(canvas, shelfGames, {
        onReady: () => setReady(true),
        onHover: () => {},
        onAlbumClick: (id) => {
          setActiveId(id);
          setFlipped(false);
        },
        onOutsideClick: () => setActiveId(null),
        onZoomChange: (zoom) => {
          setZoomed(zoom > 0.05);
          if (zoom > 0.05) {
            setActiveId(null);
            setFlipped(false);
          }
        },
        onWallSwitching: (isSwitching) => setWallSwitchInProgress(isSwitching),
        onWallChange: (id) => {
          pendingWallRef.current = id;
          setCurrentWall(id);
        },
      });
    } catch (error) {
      console.error("3D shelf failed to initialize; falling back to the cover grid.", error);
      setSceneFailed(true);
      return;
    }
    if (!scene) return;

    scene.setButtonElements(buttonsRef.current);
    sceneRef.current = scene;

    // A category can be chosen before the 3D scene exists; apply it now.
    if (pendingWallRef.current !== "featured") {
      const pending = pendingWallRef.current;
      scene.setWall(pending);
      scene.revealWall();
    }

    const observer = new ResizeObserver(() => scene.resize());
    if (canvasWrapRef.current) observer.observe(canvasWrapRef.current);
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSceneFailed(true), 6000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    sceneRef.current?.setActive(isMobile ? null : activeId);
  }, [activeId, isMobile]);

  // Spring-driven cover flip: a damped spring gives the card a little weight
  // and a natural settle instead of a mechanical CSS ease.
  useEffect(() => {
    flipTarget.current = flipped ? 180 : 0;
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      flipAngle.current = flipTarget.current;
      flipVelocity.current = 0;
      if (flipFrame.current !== null) cancelAnimationFrame(flipFrame.current);
      flipFrame.current = null;
      flipRunning.current = false;
      applyFlipVars(root, flipAngle.current);
      return;
    }
    if (flipRunning.current) return;
    flipRunning.current = true;
    let last = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.1);
      last = now;
      const stiffness = 200;
      const damping = 22;
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        flipVelocity.current +=
          (-stiffness * (flipAngle.current - flipTarget.current) -
            damping * flipVelocity.current) *
          dt;
        flipAngle.current += flipVelocity.current * dt;
      }
      if (
        Math.abs(flipAngle.current - flipTarget.current) < 0.08 &&
        Math.abs(flipVelocity.current) < 0.08
      ) {
        flipAngle.current = flipTarget.current;
        flipVelocity.current = 0;
        applyFlipVars(root, flipAngle.current);
        flipFrame.current = null;
        flipRunning.current = false;
        return;
      }
      applyFlipVars(root, flipAngle.current);
      flipFrame.current = requestAnimationFrame(step);
    };
    flipFrame.current = requestAnimationFrame(step);
  }, [flipped]);

  useEffect(() => {
    if (!activeId) return;
    flipTarget.current = 0;
    flipAngle.current = 0;
    flipVelocity.current = 0;
    if (rootRef.current) applyFlipVars(rootRef.current, 0);
  }, [activeId]);

  useEffect(
    () => () => {
      if (flipFrame.current !== null) cancelAnimationFrame(flipFrame.current);
    },
    [],
  );

  useEffect(() => {
    sceneRef.current?.setMode(isMobile ? "mobile" : "desktop");
  }, [isMobile]);

  useEffect(() => {
    sceneRef.current?.setOpenButton(openButtonRef.current);
    sceneRef.current?.setDetailElement(desktopDetailRef.current);
  }, [activeId, ready]);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (activeId) {
          setActiveId(null);
          return;
        }
      }

      if (event.code === "Space" && activeId && !typing) {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, searchOpen, menuOpen]);

  useEffect(() => {
    if (!isMobile || activeId) return;
    let wheelAccumulator = 0;
    let touchStart = 0;
    const onWheel = (event: WheelEvent) => {
      wheelAccumulator += event.deltaY;
      if (Math.abs(wheelAccumulator) < 80) return;
      const direction = wheelAccumulator > 0 ? 1 : -1;
      wheelAccumulator = 0;
      setMobileIndex((index) =>
        Math.min(shelfGames.length - 1, Math.max(0, index + direction)),
      );
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStart = event.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const end = event.changedTouches[0]?.clientY ?? touchStart;
      const delta = touchStart - end;
      if (Math.abs(delta) < 40) return;
      setMobileIndex((index) =>
        Math.min(shelfGames.length - 1, Math.max(0, index + (delta > 0 ? 1 : -1))),
      );
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, activeId]);

  const setButtonRef = (id: GameId) => (el: HTMLDivElement | null) => {
    if (el) buttonsRef.current.set(id, el);
    else buttonsRef.current.delete(id);
    sceneRef.current?.setButtonElements(buttonsRef.current);
  };

  const openDetails = (id: GameId) => {
    setActiveId(id);
    setFlipped(false);
  };

  // Choosing a category shows its wall; Featured returns to the shelf.
  const chooseWall = (id: WallCategoryId) => {
    pendingWallRef.current = id;
    setCurrentWall(id);
    sceneRef.current?.setWall(id);
    if (id === "featured") {
      sceneRef.current?.returnToShelf();
    } else {
      sceneRef.current?.revealWall();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`sfe-root${ready ? " is-ready" : ""}${
        sceneFailed && !ready ? " has-fallback" : ""
      }${zoomed ? " is-zoomed" : ""}${wallSwitchInProgress ? " is-switching" : ""}`}
    >
      <div className="sfe-viewport" ref={canvasWrapRef}>
        <div className="sfe-canvas-wrap">
          <canvas ref={canvasRef} className="sfe-canvas" aria-label="Game shelf" />
        </div>

        {shelfGames.map((album) => (
          <div
            key={album.id}
            ref={setButtonRef(album.id)}
            className="sfe-album-buttons-anchor"
            data-album-id={album.id}
          >
            <div
              className="sfe-album-buttons"
              onMouseEnter={() => sceneRef.current?.setOverlayHover(album.id)}
              onMouseLeave={() => sceneRef.current?.setOverlayHover(null)}
            >
              <Link
                href={albumHref(album)}
                className="sfe-pill sfe-pill--light"
                aria-label={`${album.title}: Open game`}
                tabIndex={0}
              >
                Open
              </Link>
              <button
                type="button"
                className="sfe-pill sfe-pill--light"
                aria-label={`Show details for ${album.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails(album.id);
                }}
              >
                Details
              </button>
            </div>
          </div>
        ))}

        {activeAlbum && !isMobile && (
          <div
            className="sfe-desktop-detail"
            ref={(el) => {
              desktopDetailRef.current = el;
              sceneRef.current?.setDetailElement(el);
            }}
            aria-hidden="true"
            onClick={() => setFlipped((value) => !value)}
          >
            <div className={`sfe-desktop-detail-card${flipped ? " is-flipped" : ""}`}>
              <div className="sfe-cover-face sfe-cover-face--front">
                <Image src={activeAlbum.cover} alt="" width={900} height={900} priority />
              </div>
              <div className="sfe-cover-face sfe-cover-face--back">
                <Image src={activeAlbum.back} alt="" width={900} height={900} priority />
              </div>
              <span className="sfe-cover-shade" aria-hidden="true" />
            </div>
          </div>
        )}

        {activeAlbum && (
          <div className="sfe-active-open-anchor" ref={openButtonRef}>
            <Link
              href={albumHref(activeAlbum)}
              className="sfe-pill sfe-pill--dark"
              aria-label={`${activeAlbum.title}: Open game`}
            >
              Open
            </Link>
          </div>
        )}
      </div>

      {sceneFailed && !ready && (
        <div className="sfe-fallback" role="region" aria-label="Game shelf cover grid">
          <p className="sfe-fallback-note">
            3D shelf unavailable on this device — showing the cover grid.
          </p>
          <div className="sfe-fallback-grid">
            {shelfGames.map((album) => (
              <Link key={album.id} href={albumHref(album)} className="sfe-fallback-card">
                <Image
                  src={album.cover}
                  alt={`${album.title} cover`}
                  width={512}
                  height={512}
                />
                <span>{album.title}</span>
                <small>
                  {formatStatus(album.status)} · {album.year}
                </small>
              </Link>
            ))}
          </div>
        </div>
      )}

      <header className={`sfe-header${searchOpen ? " is-searching" : ""}`}>
        <nav className="sfe-nav">
          <Link href="/" className="sfe-logo" aria-label="Game Shelf">
            <DiscIcon className="sfe-logo-icon" />
            <span>Game Shelf</span>
          </Link>

          {!searchOpen && !isCompact && (
            <button
              type="button"
              className="sfe-nav-search"
              onClick={() => setSearchOpen(true)}
            >
              Search
              <SearchIcon />
            </button>
          )}

          {!searchOpen && isCompact && (
            <div className="sfe-nav-right">
              <button
                type="button"
                className="sfe-menu-button"
                aria-label="Menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MenuIcon />
              </button>
            </div>
          )}

          {searchOpen && (
            <form
              className="sfe-search"
              onSubmit={(event) => event.preventDefault()}
              role="search"
            >
              <input
                ref={searchInputRef}
                className="sfe-search-input"
                type="search"
                name="q"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search"
                placeholder="Search games"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="sfe-search-clear"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  Clear
                </button>
              )}
              <span className="sfe-search-divider" aria-hidden="true" />
              <span className="sfe-search-icon" aria-hidden="true">
                <SearchIcon />
              </span>
              <button
                type="button"
                className="sfe-search-close"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
              >
                Clear
              </button>
            </form>
          )}
        </nav>
      </header>

      {activeAlbum && (
        <div className="sfe-details" key={activeAlbum.id}>
          <h2>{activeAlbum.title}</h2>
          <p>{activeAlbum.description}</p>
          <p className="sfe-details-meta">
            {activeAlbum.developer} · {activeAlbum.year} · {formatStatus(activeAlbum.status)}
          </p>
        </div>
      )}

      {!isMobile && (
        <nav className="sfe-index" aria-label="Collection categories">
          <div className="sfe-index-inner">
            {wallCategories.map((category, index) => {
              const count = category.id === "featured" 
                ? categoryGameCount(category.id)
                : wallCoverCount(category.id as WallCategoryId);
              const active = category.id === currentWall;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    chooseWall(category.id as WallCategoryId);
                  }}
                  onKeyDown={(e) => {
                    // B6: Keyboard navigation for category switching
                    let nextIndex = index;
                    if (e.key === "ArrowRight" && index < wallCategories.length - 1) {
                      nextIndex = index + 1;
                      e.preventDefault();
                    } else if (e.key === "ArrowLeft" && index > 0) {
                      nextIndex = index - 1;
                      e.preventDefault();
                    } else {
                      return;
                    }
                    
                    const nextCategory = wallCategories[nextIndex];
                    chooseWall(nextCategory.id as WallCategoryId);
                    
                    // Keep focus on the button (will move in next render)
                    setTimeout(() => {
                      const btn = document.querySelector(
                        `button[aria-current="true"]`
                      ) as HTMLButtonElement;
                      btn?.focus();
                    }, 0);
                  }}
                  className={`sfe-index-item${active ? " is-active" : ""}`}
                  aria-current={active ? "true" : undefined}
                >
                  <p>
                    {String(index + 1).padStart(2, "0")} · {count}{" "}
                    {count === 1 ? "game" : "games"}
                  </p>
                  <h2>
                    {category.label}
                    <span className="sfe-index-item-zh">{category.labelZh}</span>
                  </h2>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {isMobile && (
        <>
          {!activeAlbum && (
            <div className="sfe-mobile-meta">
              <p>
                {mobileAlbum.categories
                  .map((id) => wallCategories.find((category) => category.id === id)?.label)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>{mobileAlbum.title}</p>
            </div>
          )}
          <div className={`sfe-mobile-actions${activeAlbum ? " is-detail" : ""}`}>
            <button
              type="button"
              className="sfe-mobile-button"
              onClick={() => {
                if (activeAlbum) {
                  setActiveId(null);
                  setFlipped(false);
                } else {
                  openDetails(mobileAlbum.id);
                }
              }}
            >
              {activeAlbum ? "Back" : "Details"}
            </button>
            <Link
              href={albumHref(activeAlbum ?? mobileAlbum)}
              className="sfe-mobile-button sfe-mobile-button--dark"
            >
              Open
            </Link>
          </div>
          {!activeAlbum && (
            <div className="sfe-progress" aria-hidden="true">
              <span
                className="sfe-progress-thumb"
                style={{
                  transform: `translateY(${(mobileIndex / (shelfGames.length - 1)) * 115}px)`,
                }}
              />
            </div>
          )}

          {activeAlbum && (
            <div className="sfe-mobile-detail" aria-label={`${activeAlbum.title} game`}>
              <div className="sfe-mobile-detail-scene">
                <div className="sfe-mobile-detail-card">
                  <button
                    type="button"
                    className={`sfe-mobile-detail-cover${flipped ? " is-flipped" : ""}`}
                    onClick={() => setFlipped((value) => !value)}
                    aria-label={`Flip ${activeAlbum.title} cover`}
                    aria-pressed={flipped}
                  >
                    <span className="sfe-cover-face sfe-cover-face--front">
                      <Image
                        src={activeAlbum.cover}
                        alt={`${activeAlbum.title} cover`}
                        width={900}
                        height={900}
                        priority
                      />
                    </span>
                    <span className="sfe-cover-face sfe-cover-face--back">
                      <Image
                        src={activeAlbum.back}
                        alt={`${activeAlbum.title} back cover`}
                        width={900}
                        height={900}
                        priority
                      />
                    </span>
                    <span className="sfe-cover-shade" aria-hidden="true" />
                  </button>
                  <div className="sfe-mobile-detail-reflection" aria-hidden="true">
                    <span
                      className={flipped ? "is-faded" : undefined}
                      style={{ backgroundImage: `url(${activeAlbum.cover})` }}
                    />
                    <span
                      className={flipped ? undefined : "is-faded"}
                      style={{ backgroundImage: `url(${activeAlbum.back})` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {searchOpen && (
        <div className="sfe-search-layer">
          <div className="sfe-search-results" role="listbox" aria-label="Search suggestions">
            {searchQuery.trim().length === 0 ? (
              <p className="sfe-search-hint">Search every game on the shelf.</p>
            ) : searchResults.length === 0 ? (
              <p className="sfe-search-hint">No games found for “{searchQuery}”.</p>
            ) : (
              <>
                <p className="sfe-search-label">Results</p>
                <ul>
                  {searchResults.map((album) => (
                    <li key={album.id}>
                      <Link
                        href={albumHref(album)}
                        className="sfe-search-result"
                        onClick={() => setSearchOpen(false)}
                      >
                        <span>{album.title}</span>
                        <span>
                          {formatStatus(album.status)} · {album.year}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="sfe-mobile-menu" role="dialog" aria-label="Menu">
          <div className="sfe-mobile-menu-head">
            <span>Menu</span>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              Close
            </button>
          </div>
          <nav>
            <p className="sfe-mobile-menu-label">Games</p>
            <ul className="sfe-mobile-editions">
              {albums.map((album) => (
                <li key={album.id}>
                  <Link
                    href={albumHref(album)}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{album.title}</span>
                    <span>
                      {formatStatus(album.status)} · {album.year}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="sfe-mobile-menu-label">Browse</p>
            <ul className="sfe-mobile-links">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSearchOpen(true);
                  }}
                >
                  Search
                </button>
              </li>
              <li>
                <a href={`${BASE_PATH}/`} onClick={() => setMenuOpen(false)}>
                  Featured shelf
                </a>
              </li>
            </ul>
            <a className="sfe-mobile-home" href={`${BASE_PATH}/`} onClick={() => setMenuOpen(false)}>
              Game Shelf
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
