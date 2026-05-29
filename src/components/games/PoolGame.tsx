/**
 * لعبة البلياردو 🎱 — طاولة عمودية، عصا قابلة للسحب، أهداف عند الإدخال
 */
import {
  useEffect, useRef, useCallback, useState, useMemo,
} from "react";
import { useApp } from "@/lib/store";
import { apiBackendEnabled, getApiToken } from "@/lib/apiBackend";
import { Avatar } from "@/components/Avatar";

// ─── طاولة طولية (عمودية) ───────────────────────────
const TW = 400;
const TH = 800;
const BR = 12;
const PR = 20;
const POCKETS = [
  { x: 28, y: 28 }, { x: TW / 2, y: 18 }, { x: TW - 28, y: 28 },
  { x: 28, y: TH - 28 }, { x: TW / 2, y: TH - 18 }, { x: TW - 28, y: TH - 28 },
];
const WALL_L = 40;
const WALL_R = TW - 40;
const WALL_T = 30;
const WALL_B = TH - 30;
const FRICTION = 0.985;
const MIN_SPEED = 0.08;
const RESTITUTION = 0.85;
const MAX_POWER = 22;

const BALL_COLORS: Record<number, string> = {
  0: "#ffffff",
  1: "#f5c518", 2: "#1e3a8a", 3: "#dc2626", 4: "#7e22ce",
  5: "#ea580c", 6: "#166534", 7: "#92400e", 8: "#111111",
  9: "#eab308", 10: "#3b82f6", 11: "#ef4444", 12: "#9333ea",
  13: "#f97316", 14: "#22c55e", 15: "#b45309",
};

type Ball = { id: number; x: number; y: number; vx: number; vy: number; pocketed: boolean };
type GameRoom = {
  roomId: string; chatId: string;
  player1Id: string; player2Id: string;
  status: string; currentTurnUserId: string;
  winnerId: string | null; lostById: string | null;
  balls: Ball[]; player1Type: string | null; player2Type: string | null;
  player1Pocketed: number[]; player2Pocketed: number[];
  foulPending: boolean; breakDone: boolean;
  turnTimerStart: number; startedAt: number; endedAt: number | null;
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function ballsMoving(balls: Ball[]) {
  return balls.some(b => !b.pocketed && (Math.abs(b.vx) > MIN_SPEED || Math.abs(b.vy) > MIN_SPEED));
}
function stepPhysics(balls: Ball[]): Ball[] {
  const next = balls.map(b => ({ ...b }));
  for (const b of next) {
    if (b.pocketed) continue;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < MIN_SPEED) b.vx = 0;
    if (Math.abs(b.vy) < MIN_SPEED) b.vy = 0;
    b.x += b.vx; b.y += b.vy;
  }
  for (const b of next) {
    if (b.pocketed) continue;
    if (b.x - BR < WALL_L) { b.x = WALL_L + BR; b.vx = Math.abs(b.vx) * RESTITUTION; }
    if (b.x + BR > WALL_R) { b.x = WALL_R - BR; b.vx = -Math.abs(b.vx) * RESTITUTION; }
    if (b.y - BR < WALL_T) { b.y = WALL_T + BR; b.vy = Math.abs(b.vy) * RESTITUTION; }
    if (b.y + BR > WALL_B) { b.y = WALL_B - BR; b.vy = -Math.abs(b.vy) * RESTITUTION; }
  }
  for (let i = 0; i < next.length - 1; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i]!; const b = next[j]!;
      if (a.pocketed || b.pocketed) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < BR * 2 && d > 0) {
        const nx = dx / d; const ny = dy / d;
        const overlap = BR * 2 - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const dvx = a.vx - b.vx; const dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot > 0) {
          a.vx -= dot * nx; a.vy -= dot * ny;
          b.vx += dot * nx; b.vy += dot * ny;
        }
      }
    }
  }
  for (const b of next) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      if (dist(b, p) < PR) { b.pocketed = true; b.vx = 0; b.vy = 0; break; }
    }
  }
  return next;
}

function remainingForType(
  type: "solids" | "stripes" | null,
  pocketed: number[],
): number[] {
  const all = type === "stripes"
    ? [9, 10, 11, 12, 13, 14, 15]
    : [1, 2, 3, 4, 5, 6, 7];
  return all.filter(id => !pocketed.includes(id));
}

function drawTable(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#14532d";
  ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = "#78350f";
  ctx.fillRect(0, 0, TW, WALL_T);
  ctx.fillRect(0, WALL_B, TW, TH - WALL_B);
  ctx.fillRect(0, 0, WALL_L, TH);
  ctx.fillRect(WALL_R, 0, TW - WALL_R, TH);
  ctx.fillStyle = "#15803d";
  ctx.fillRect(WALL_L, WALL_T, WALL_R - WALL_L, WALL_B - WALL_T);
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WALL_L, TH * 0.25);
  ctx.lineTo(WALL_R, TH * 0.25);
  ctx.stroke();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  if (b.pocketed) return;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BR, 0, Math.PI * 2);
  const isStripe = b.id >= 9 && b.id <= 15;
  if (isStripe) {
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, BR, -Math.PI / 2, Math.PI / 2);
    ctx.fillStyle = BALL_COLORS[b.id] ?? "#888";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y, BR, Math.PI / 2, -Math.PI / 2);
    ctx.fillStyle = BALL_COLORS[b.id] ?? "#888";
    ctx.fill();
  } else {
    ctx.fillStyle = BALL_COLORS[b.id] ?? "#888";
    ctx.fill();
  }
  if (b.id > 0) {
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BR * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `bold ${BR * 0.55}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.id), b.x, b.y + 0.5);
  }
  ctx.beginPath();
  ctx.arc(b.x, b.y, BR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawAimLine(
  ctx: CanvasRenderingContext2D,
  cue: Ball,
  angle: number,
  power: number,
) {
  const shotX = Math.cos(angle);
  const shotY = Math.sin(angle);
  const guideLen = 90 + power * 4;
  const gx = cue.x + shotX * guideLen;
  const gy = cue.y + shotY * guideLen;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(cue.x, cue.y);
  ctx.lineTo(gx, gy);
  ctx.stroke();
  ctx.setLineDash([]);

  const pullLen = 55 + power * 7;
  const backX = cue.x - shotX * (BR + 4);
  const backY = cue.y - shotY * (BR + 4);
  const tipX = cue.x - shotX * (BR + 4 + pullLen);
  const tipY = cue.y - shotY * (BR + 4 + pullLen);

  const grad = ctx.createLinearGradient(tipX, tipY, backX, backY);
  grad.addColorStop(0, "#3d2314");
  grad.addColorStop(0.35, "#8b5a2b");
  grad.addColorStop(0.7, "#d4a574");
  grad.addColorStop(1, "#f5deb3");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX, backY);
  ctx.stroke();

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { getApiBaseUrl } = await import("@/lib/apiBackend");
  const base = getApiBaseUrl().replace(/\/$/, "");
  const token = getApiToken();
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
}

function SideBallRack({ ballIds, label }: { ballIds: number[]; label: string }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
      <span className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-white/40">
        {label}
      </span>
      {ballIds.length === 0 ? (
        <span className="text-[10px] text-emerald-400/80">تم</span>
      ) : (
        ballIds.map(id => (
          <div
            key={id}
            className="relative flex h-7 w-7 items-center justify-center rounded-full border border-white/15 shadow-md"
            style={{ background: BALL_COLORS[id] }}
          >
            {id > 0 && (
              <span className="text-[8px] font-bold text-black/70">{id}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

interface Props {
  roomId: string;
  chatId: string;
  onClose: () => void;
  onGameEnd: (winnerId: string | null, winnerName?: string) => void;
}

export function PoolGame({ roomId, onClose, onGameEnd }: Props) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [shooting, setShooting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [localBalls, setLocalBalls] = useState<Ball[]>([]);
  const [aimAngle, setAimAngle] = useState(-Math.PI / 2);
  const [power, setPower] = useState(0);
  const [aiming, setAiming] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [result, setResult] = useState<{ won: boolean; shown: boolean } | null>(null);
  const [goalFlash, setGoalFlash] = useState<string | null>(null);
  const scaleRef = useRef(1);
  const animFrameRef = useRef<number>(0);
  const goalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMyTurn = room ? room.currentTurnUserId === me.id : false;
  const myType = room
    ? (room.player1Id === me.id ? room.player1Type : room.player2Type) as "solids" | "stripes" | null
    : null;
  const opType = room
    ? (room.player1Id === me.id ? room.player2Type : room.player1Type) as "solids" | "stripes" | null
    : null;
  const opponentId = room
    ? room.player1Id === me.id ? room.player2Id : room.player1Id
    : null;
  const opponent = opponentId ? state.users.find(u => u.id === opponentId) : null;

  const myPocketed = room
    ? (room.player1Id === me.id ? room.player1Pocketed : room.player2Pocketed)
    : [];
  const opPocketed = room
    ? (room.player1Id === me.id ? room.player2Pocketed : room.player1Pocketed)
    : [];

  const myRemaining = useMemo(
    () => remainingForType(myType, myPocketed),
    [myType, myPocketed],
  );
  const opRemaining = useMemo(
    () => remainingForType(opType, opPocketed),
    [opType, opPocketed],
  );

  useEffect(() => {
    if (!apiBackendEnabled()) return;
    void (async () => {
      try {
        const r = await apiFetch(`/v1/games/pool/${roomId}`);
        if (!r.ok) return;
        const data = await r.json() as { room: GameRoom };
        setRoom(data.room);
        setLocalBalls(data.room.balls);
      } catch {
        /* ignore */
      }
    })();
  }, [roomId]);

  useEffect(() => {
    const handle = (e: Event) => {
      const d = (e as CustomEvent<GameRoom>).detail;
      if (!d || d.roomId !== roomId) return;
      setRoom(d);
      setLocalBalls(d.balls);
      setAnimating(false);
      setShooting(false);
      if (d.status === "finished") {
        setResult({ won: d.winnerId === me.id, shown: false });
      }
    };
    window.addEventListener("pool:state_update", handle);
    window.addEventListener("pool:room_created", handle);
    return () => {
      window.removeEventListener("pool:state_update", handle);
      window.removeEventListener("pool:room_created", handle);
    };
  }, [roomId, me.id]);

  useEffect(() => () => {
    if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = scaleRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);
    drawTable(ctx);
    for (const b of localBalls) drawBall(ctx, b);
    if (isMyTurn && aiming && !animating && !shooting) {
      const cue = localBalls.find(b => b.id === 0);
      if (cue && !cue.pocketed) drawAimLine(ctx, cue, aimAngle, power);
    }
    ctx.restore();
  }, [localBalls, isMyTurn, aiming, aimAngle, power, animating, shooting]);

  useEffect(() => {
    const loop = () => {
      renderCanvas();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [renderCanvas]);

  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const scale = Math.min(w / TW, h / TH);
      scaleRef.current = scale;
      canvas.width = TW * scale;
      canvas.height = TH * scale;
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = scaleRef.current;
    const clientX = "touches" in e ? e.touches[0]!.clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]!.clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const updateAimFromPos = useCallback((pos: { x: number; y: number }) => {
    const cue = localBalls.find(b => b.id === 0);
    if (!cue || cue.pocketed) return;
    const angle = Math.atan2(cue.y - pos.y, cue.x - pos.x);
    const pull = Math.max(0, dist(cue, pos) - BR - 8);
    setAimAngle(angle);
    setPower(Math.min(MAX_POWER, pull / 9));
  }, [localBalls]);

  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || animating || shooting) return;
    const cue = localBalls.find(b => b.id === 0);
    if (!cue || cue.pocketed) return;
    setAiming(true);
    updateAimFromPos(getCanvasPos(e));
  }, [isMyTurn, animating, shooting, localBalls, updateAimFromPos]);

  const onPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!aiming) return;
    updateAimFromPos(getCanvasPos(e));
  }, [aiming, updateAimFromPos]);

  const showGoalFlash = useCallback((msg: string) => {
    setGoalFlash(msg);
    if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
    goalTimerRef.current = setTimeout(() => setGoalFlash(null), 1600);
  }, []);

  const submitShot = useCallback(async (
    balls: Ball[],
    pocketedThisShot: number[],
    cuePocketed: boolean,
  ) => {
    if (!apiBackendEnabled()) return;
    try {
      const r = await apiFetch(`/v1/games/pool/${roomId}/shot`, {
        method: "POST",
        body: JSON.stringify({ balls, pocketedThisShot, cuePocketed }),
      });
      if (r.ok) {
        const data = await r.json() as { room: GameRoom };
        setRoom(data.room);
        setLocalBalls(data.room.balls);
        if (data.room.status === "finished") {
          const won = data.room.winnerId === me.id;
          setResult({ won, shown: false });
          const winnerUser = state.users.find(u => u.id === data.room.winnerId);
          onGameEnd(data.room.winnerId, winnerUser?.username);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setShooting(false);
      setAnimating(false);
      setPower(0);
    }
  }, [roomId, me.id, state.users, onGameEnd]);

  const animateShot = useCallback((balls: Ball[]) => {
    let current = balls.map(b => ({ ...b }));
    const pocketedBefore = new Set(localBalls.filter(b => b.pocketed).map(b => b.id));

    const step = () => {
      if (!ballsMoving(current)) {
        const pocketedThisShot = current
          .filter(b => b.pocketed && !pocketedBefore.has(b.id))
          .map(b => b.id);
        const cuePocketed = pocketedThisShot.includes(0);

        const scoredMine = pocketedThisShot.filter(id => {
          if (id === 0 || id === 8) return false;
          const isSolid = id >= 1 && id <= 7;
          const isStripe = id >= 9 && id <= 15;
          return (myType === "solids" && isSolid) || (myType === "stripes" && isStripe);
        });
        if (scoredMine.length > 0) {
          showGoalFlash(scoredMine.length > 1 ? `هدف ×${scoredMine.length}!` : "هدف! 🎱");
        }

        setLocalBalls(current);
        void submitShot(current, pocketedThisShot, cuePocketed);
        return;
      }
      current = stepPhysics(current);
      setLocalBalls([...current]);
      animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, [localBalls, myType, showGoalFlash, submitShot]);

  const shoot = useCallback(() => {
    if (!isMyTurn || animating || shooting) return;
    setShooting(true);
    setAnimating(true);
    const balls = localBalls.map(b => {
      if (b.id === 0 && !b.pocketed) {
        return { ...b, vx: Math.cos(aimAngle) * power, vy: Math.sin(aimAngle) * power };
      }
      return { ...b };
    });
    animateShot(balls);
  }, [isMyTurn, animating, shooting, localBalls, aimAngle, power, animateShot]);

  const onPointerUp = useCallback(() => {
    if (!aiming) return;
    setAiming(false);
    if (power < 0.35) { setPower(0); return; }
    shoot();
  }, [aiming, power, shoot]);

  useEffect(() => {
    if (!room || room.status !== "active") return;
    const tick = setInterval(() => {
      const elapsed = (Date.now() - (room.turnTimerStart ?? Date.now())) / 1000;
      const left = Math.max(0, 30 - elapsed);
      setTimeLeft(Math.round(left));
      if (left <= 0 && isMyTurn && !shooting && !animating) {
        void submitShot(localBalls, [], false);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [room, isMyTurn, shooting, animating, localBalls, submitShot]);

  const forfeit = async () => {
    if (!confirm("هل أنت متأكد من الاستسلام؟")) return;
    await apiFetch(`/v1/games/pool/${roomId}/forfeit`, { method: "POST" });
    onClose();
  };

  if (result && !result.shown) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-2xl">
          <span className="text-6xl">{result.won ? "🎉" : "😢"}</span>
          <h2 className="text-2xl font-bold text-gray-900">
            {result.won ? "فزت! 🎱" : "خسرت"}
          </h2>
          <button
            className="rounded-2xl bg-[#0095F6] px-8 py-3 font-bold text-white"
            onClick={() => { setResult({ ...result, shown: true }); onClose(); }}
          >
            خروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-[#0f172a] to-[#020617]">
      {/* شريط علوي: خروج + استسلام */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white"
        >
          ✕
        </button>
        <span className="text-sm font-bold text-white/90">بلياردو 8 كرات</span>
        <button
          type="button"
          onClick={forfeit}
          className="rounded-full bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300"
        >
          استسلام
        </button>
      </div>

      {/* أفاتار اللاعبين */}
      <div className="flex items-end justify-between px-4 pb-2">
        <div className={`flex flex-col items-center gap-1 transition-opacity ${!isMyTurn ? "opacity-100" : "opacity-55"}`}>
          <Avatar
            name={opponent?.username ?? "?"}
            src={opponent?.avatar}
            size={56}
            ring={!isMyTurn}
            className={!isMyTurn ? "ring-2 ring-amber-400" : ""}
          />
          <span className="max-w-[88px] truncate text-[11px] font-medium text-white/80">
            @{opponent?.username ?? "خصم"}
          </span>
          <span className="text-xl font-black tabular-nums text-white">{opPocketed.length}</span>
        </div>

        <div className="flex flex-col items-center gap-0.5 px-2">
          <span className="text-lg">🎱</span>
          <span className={`text-xs font-bold ${isMyTurn ? "text-emerald-400" : "text-white/40"}`}>
            {isMyTurn ? `دورك · ${timeLeft}s` : "دور الخصم"}
          </span>
          {myType && (
            <span className="text-[10px] text-white/50">
              {myType === "solids" ? "صلبة ●" : "مخططة ◉"}
            </span>
          )}
        </div>

        <div className={`flex flex-col items-center gap-1 transition-opacity ${isMyTurn ? "opacity-100" : "opacity-55"}`}>
          <Avatar
            name={me.username}
            src={me.avatar}
            size={56}
            ring={isMyTurn}
            className={isMyTurn ? "ring-2 ring-emerald-400" : ""}
          />
          <span className="max-w-[88px] truncate text-[11px] font-medium text-white/80">
            @{me.username}
          </span>
          <span className="text-xl font-black tabular-nums text-emerald-300">{myPocketed.length}</span>
        </div>
      </div>

      {/* طاولة + كرات الجانبين */}
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center gap-0 px-1">
        <SideBallRack ballIds={opRemaining} label="خصم" />
        <div
          ref={containerRef}
          className="relative min-h-0 flex-1"
        >
          <canvas
            ref={canvasRef}
            className={`mx-auto block max-h-full rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.55)] ${
              isMyTurn && !animating ? "cursor-crosshair" : "cursor-default"
            }`}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={() => { if (aiming) onPointerUp(); }}
            onTouchStart={onPointerDown}
            onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
            onTouchEnd={onPointerUp}
            style={{ touchAction: "none" }}
          />
          {goalFlash && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="animate-bounce rounded-2xl bg-emerald-500/90 px-6 py-3 text-lg font-black text-white shadow-lg">
                {goalFlash}
              </div>
            </div>
          )}
        </div>
        <SideBallRack ballIds={myRemaining} label="أنت" />
      </div>

      {/* شريط القوة عند السحب */}
      {aiming && (
        <div className="mx-6 mb-3 flex items-center gap-3">
          <span className="text-[10px] text-white/50">اسحب للخلف</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lime-400 via-yellow-400 to-red-500 transition-none"
              style={{ width: `${(power / MAX_POWER) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-[10px] tabular-nums text-white/60">
            {Math.round((power / MAX_POWER) * 100)}%
          </span>
        </div>
      )}

      {!room && (
        <p className="pb-4 text-center text-sm text-white/40">جاري تحميل اللعبة…</p>
      )}
      {room?.foulPending && isMyTurn && (
        <p className="mx-4 mb-2 rounded-xl bg-red-900/50 py-2 text-center text-xs text-red-200">
          فاول — ضع الكرة البيضاء حيث تريد
        </p>
      )}
      {isMyTurn && !animating && room && (
        <p className="pb-3 text-center text-xs text-emerald-400/90">
          {!room.breakDone
            ? "حرّك الإصبع حول الكرة ثم اسحب للخلف واترك للضرب"
            : "صوّب · اسحب العصا للخلف · اترك للضرب"}
        </p>
      )}
    </div>
  );
}
