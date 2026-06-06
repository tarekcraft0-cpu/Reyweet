import type { ChatWallpaperAnimationId } from "@/lib/chatWallpaperThemes";

type Props = {
  animationId: ChatWallpaperAnimationId;
  className?: string;
  /** معاينة صغيرة في منتقي الثيم */
  preview?: boolean;
};

const ANIM_CLASS: Record<ChatWallpaperAnimationId, string> = {
  aurora: "chat-anim-aurora",
  sakura: "chat-anim-sakura",
  ocean: "chat-anim-ocean",
  sunset: "chat-anim-sunset",
  neon: "chat-anim-neon",
  forest: "chat-anim-forest",
  anime_sky: "chat-anim-anime-sky",
  stars: "chat-anim-stars",
  cosmos: "chat-anim-cosmos",
  foliage: "chat-anim-foliage",
  cherry_grove: "chat-anim-cherry-grove",
  rain: "chat-anim-rain",
  fireflies: "chat-anim-fireflies",
};

function Petals({ count, prefix }: { count: number; prefix: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`${prefix}-${i}`}
          className={`chat-sakura-petal chat-sakura-petal--${(i % 8) + 1}`}
          style={{
            left: `${8 + ((i * 11) % 84)}%`,
            animationDuration: `${7 + (i % 5)}s`,
            animationDelay: `${-(i * 1.3)}s`,
          }}
        />
      ))}
    </>
  );
}

function Leaves({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`leaf-${i}`}
          className={`chat-foliage-leaf chat-foliage-leaf--${(i % 6) + 1}`}
          style={{
            left: `${6 + ((i * 13) % 88)}%`,
            animationDuration: `${9 + (i % 4)}s`,
            animationDelay: `${-(i * 1.1)}s`,
          }}
        />
      ))}
    </>
  );
}

function RainStreaks({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`rain-${i}`}
          className="chat-rain-streak"
          style={{
            left: `${(i * 7) % 100}%`,
            animationDuration: `${0.55 + (i % 4) * 0.12}s`,
            animationDelay: `${-(i * 0.08)}s`,
          }}
        />
      ))}
    </>
  );
}

function Fireflies({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`fly-${i}`}
          className={`chat-firefly chat-firefly--${(i % 5) + 1}`}
          style={{
            left: `${10 + ((i * 17) % 80)}%`,
            top: `${15 + ((i * 23) % 65)}%`,
            animationDelay: `${-(i * 0.9)}s`,
          }}
        />
      ))}
    </>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={`star-${i}`}
          className={`chat-star chat-star--${(i % 8) + 1}`}
          style={{
            top: `${8 + ((i * 11) % 72)}%`,
            left: `${5 + ((i * 13) % 90)}%`,
            animationDelay: `${(i % 6) * 0.35}s`,
          }}
        />
      ))}
    </>
  );
}

export function ChatAnimatedWallpaper({ animationId, className = "", preview = false }: Props) {
  const anim = ANIM_CLASS[animationId];
  const dense = !preview;

  return (
    <div
      className={(preview ? "chat-anim-preview " : "chat-anim-full ") + anim + " " + className}
      aria-hidden
    >
      {animationId === "aurora" && (
        <>
          <span className="chat-aurora-band chat-aurora-band--1" />
          <span className="chat-aurora-band chat-aurora-band--2" />
        </>
      )}

      {(animationId === "sakura" || animationId === "cherry_grove") && (
        <>
          {animationId === "cherry_grove" && (
            <>
              <span className="chat-cherry-tree chat-cherry-tree--left" />
              <span className="chat-cherry-tree chat-cherry-tree--right" />
            </>
          )}
          <Petals count={dense ? 10 : 5} prefix={animationId} />
        </>
      )}

      {animationId === "foliage" && <Leaves count={dense ? 8 : 4} />}

      {animationId === "stars" && <Stars count={dense ? 10 : 5} />}

      {animationId === "cosmos" && (
        <>
          <span className="chat-cosmos-orb chat-cosmos-orb--1" />
          <span className="chat-cosmos-orb chat-cosmos-orb--2" />
          <Stars count={dense ? 8 : 4} />
        </>
      )}

      {animationId === "anime_sky" && (
        <>
          <span className="chat-anime-cloud chat-anime-cloud--1" />
          <span className="chat-anime-cloud chat-anime-cloud--2" />
        </>
      )}

      {animationId === "ocean" && (
        <>
          <span className="chat-ocean-wave chat-ocean-wave--1" />
          <span className="chat-ocean-wave chat-ocean-wave--2" />
          <span className="chat-ocean-bubble chat-ocean-bubble--1" />
          <span className="chat-ocean-bubble chat-ocean-bubble--2" />
        </>
      )}

      {animationId === "sunset" && <span className="chat-sunset-sun" />}

      {animationId === "forest" && (
        <>
          <span className="chat-forest-mist" />
          <Leaves count={dense ? 4 : 2} />
        </>
      )}

      {animationId === "neon" && (
        <>
          <span className="chat-neon-grid" />
          <span className="chat-neon-scan" />
        </>
      )}

      {animationId === "rain" && <RainStreaks count={dense ? 14 : 7} />}

      {animationId === "fireflies" && <Fireflies count={dense ? 10 : 5} />}
    </div>
  );
}
