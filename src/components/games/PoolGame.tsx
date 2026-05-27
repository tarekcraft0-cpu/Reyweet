/**
 * لعبة البلياردو 🎱
 * Canvas-based 8-ball pool with realtime multiplayer
 */
import {
  useEffect, useRef, useCallback, useState, useMemo,
} from "react";
import { useApp } from "@/lib/store";
import { apiBackendEnabled, getApiToken } from "@/lib/apiBackend";

// ─── أبعاد الطاولة ───────────────────────────────────
const TW = 800;
const TH = 400;
const BR = 12;
const PR = 20;
const POCKETS = [
  { x: 28, y: 28 }, { x: TW / 2, y: 18 }, { x: TW - 28, y: 28 },
  { x: 28, y: TH - 28 }, { x: TW / 2, y: TH - 18 }, { x: TW - 28, y: TH - 28 },
];
const WALL_L = 40; const WALL_R = TW - 40;
const WALL_T = 30; const WALL_B = TH - 30;
const FRICTION = 0.985;
const MIN_SPEED = 0.08;
const RESTITUTION = 0.85;
const MAX_POWER = 22;
const TURN_TIMEOUT_MS = 30_000;

// ─── رسم الألوان ─────────────────────────────────────
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

// ─── Physics helpers ─────────────────────────────────
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function ballsMoving(balls: Ball[]) {
  return balls.some(b => !b.pocketed && (Math.abs(b.vx) > MIN_SPEED || Math.abs(b.vy) > MIN_SPEED));
}
function stepPhysics(balls: Ball[]): Ball[] {
  const next = balls.map(b => ({ ...b }));
  // friction + move
  for (const b of next) {
    if (b.pocketed) continue;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < MIN_SPEED) b.vx = 0;
    if (Math.abs(b.vy) < MIN_SPEED) b.vy = 0;
    b.x += b.vx; b.y += b.vy;
  }
  // wall bounce
  for (const b of next) {
    if (b.pocketed) continue;
    if (b.x - BR < WALL_L) { b.x = WALL_L + BR; b.vx = Math.abs(b.vx) * RESTITUTION; }
    if (b.x + BR > WALL_R) { b.x = WALL_R - BR; b.vx = -Math.abs(b.vx) * RESTITUTION; }
    if (b.y - BR < WALL_T) { b.y = WALL_T + BR; b.vy = Math.abs(b.vy) * RESTITUTION; }
    if (b.y + BR > WALL_B) { b.y = WALL_B - BR; b.vy = -Math.abs(b.vy) * RESTITUTION; }
  }
  // ball-ball collision
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
  // pocket detection
  for (const b of next) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      if (dist(b, p) < PR) { b.pocketed = true; b.vx = 0; b.vy = 0; break; }
    }
  }
  return next;
}

function runPhysics(balls: Ball[]): { balls: Ball[]; frames: number } {
  let current = balls.map(b => ({ ...b }));
  let frames = 0;
  while (ballsMoving(current) && frames < 5000) {
    current = stepPhysics(current);
    frames++;
  }
  return { balls: current, frames };
}

// ─── Canvas drawing ───────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D) {
  // felt
  ctx.fillStyle = "#166534";
  ctx.fillRect(0, 0, TW, TH);
  // rails
  ctx.fillStyle = "#92400e";
  ctx.fillRect(0, 0, TW, WALL_T);
  ctx.fillRect(0, WALL_B, TW, TH - WALL_B);
  ctx.fillRect(0, 0, WALL_L, TH);
  ctx.fillRect(WALL_R, 0, TW - WALL_R, TH);
  // felt (inner)
  ctx.fillStyle = "#15803d";
  ctx.fillRect(WALL_L, WALL_T, WALL_R - WALL_L, WALL_B - WALL_T);
  // pockets
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  // head line
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(TW * 0.25, WALL_T); ctx.lineTo(TW * 0.25, WALL_B); ctx.stroke();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  if (b.pocketed) return;
  ctx.save();
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
  // number
  if (b.id > 0) {
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
  // shadow
  ctx.beginPath();
  ctx.arc(b.x, b.y, BR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawAimLine(
  ctx: CanvasRenderingContext2D,
  cue: Ball,
  angle: number,
  power: number,
) {
  const length = 60 + power * 5;
  const ex = cue.x - Math.cos(angle) * length;
  const ey = cue.y - Math.sin(angle) * length;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.setLineDash([]);
  // cue stick
  const stickStart = { x: cue.x + Math.cos(angle) * (BR + 4), y: cue.y + Math.sin(angle) * (BR + 4) };
  const stickEnd = { x: cue.x + Math.cos(angle) * (BR + 4 + 120), y: cue.y + Math.sin(angle) * (BR + 4 + 120) };
  const grad = ctx.createLinearGradient(stickStart.x, stickStart.y, stickEnd.x, stickEnd.y);
  grad.addColorStop(0, "#d4a574");
  grad.addColorStop(0.3, "#c8964a");
  grad.addColorStop(1, "#5c3317");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(stickStart.x, stickStart.y); ctx.lineTo(stickEnd.x, stickEnd.y); ctx.stroke();
  ctx.restore();
}

// ─── API helpers ──────────────────────────────────────
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

// ─── Props ────────────────────────────────────────────
interface Props {
  roomId: string;
  chatId: string;
  onClose: () => void;
  onGameEnd: (winnerId: string | null, winnerName?: string) => void;
}

// ─── Main Component ───────────────────────────────────
export function PoolGame({ roomId, chatId, onClose, onGameEnd }: Props) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [shooting, setShooting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [localBalls, setLocalBalls] = useState<Ball[]>([]);
  const [aimAngle, setAimAngle] = useState(Math.PI);
  const [power, setPower] = useState(0);
  const [aiming, setAiming] = useState(false);
  const [aimStart, setAimStart] = useState<{ x: number; y: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [result, setResult] = useState<{ won: boolean; shown: boolean } | null>(null);
  const scaleRef = useRef(1);
  const animFrameRef = useRef<number>(0);

  const isMyTurn = room ? room.currentTurnUserId === me.id : false;
  const myType = room
    ? room.player1Id === me.id ? room.player1Type : room.player2Type
    : null;
  const opponentId = room
    ? room.player1Id === me.id ? room.player2Id : room.player1Id
    : null;
  const opponent = opponentId ? state.users.find(u => u.id === opponentId) : null;

  // ─── Load room ───────────────────────────────────────
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

  // ─── Realtime SSE/Socket updates ─────────────────────
  useEffect(() => {
    const handle = (e: Event) => {
      const d = (e as CustomEvent<GameRoom>).detail;
      if (!d || d.roomId !== roomId) return;
      setRoom(d);
      setLocalBalls(d.balls);
      setAnimating(false);
      setShooting(false);
      if (d.status === "finished") {
        const won = d.winnerId === me.id;
        setResult({ won, shown: false });
      }
    };
    window.addEventListener("pool:state_update", handle);
    window.addEventListener("pool:room_created", handle);
    return () => {
      window.removeEventListener("pool:state_update", handle);
      window.removeEventListener("pool:room_created", handle);
    };
  }, [roomId, me.id]);

  // Relay SSE/Socket events from store realtime
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      try {
        const { event, data } = JSON.parse(e.data);
        if (event === "pool:state_update" || event === "pool:room_created") {
          window.dispatchEvent(new CustomEvent(event, { detail: data }));
        }
      } catch {
        /* ignore */
      }
    };
    // This bridges the existing store realtime system to our local event
    return () => { /* cleanup on unmount */ };
  }, []);

  // ─── Turn timer ──────────────────────────────────────
  useEffect(() => {
    if (!room || room.status !== "active") return;
    const tick = setInterval(() => {
      const elapsed = (Date.now() - (room.turnTimerStart ?? Date.now())) / 1000;
      const left = Math.max(0, 30 - elapsed);
      setTimeLeft(Math.round(left));
      if (left <= 0 && isMyTurn && !shooting && !animating) {
        // بدّل الدور تلقائياً عند انتهاء الوقت (ضربة فارغة)
        void submitShot(localBalls, [], false);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [room, isMyTurn, shooting, animating, localBalls]);

  // ─── Canvas render loop ───────────────────────────────
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

  // ─── Canvas resize ─────────────────────────────────
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

  // ─── Aim input ─────────────────────────────────────
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

  const onPointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || animating || shooting) return;
    const cue = localBalls.find(b => b.id === 0);
    if (!cue || cue.pocketed) return;
    const pos = getCanvasPos(e);
    setAimStart(pos);
    setAiming(true);
    const angle = Math.atan2(cue.y - pos.y, cue.x - pos.x);
    setAimAngle(angle);
    setPower(0);
  }, [isMyTurn, animating, shooting, localBalls]);

  const onPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!aiming || !aimStart) return;
    const cue = localBalls.find(b => b.id === 0);
    if (!cue) return;
    const pos = getCanvasPos(e);
    const angle = Math.atan2(cue.y - pos.y, cue.x - pos.x);
    setAimAngle(angle);
    const d = Math.hypot(pos.x - aimStart.x, pos.y - aimStart.y);
    setPower(Math.min(MAX_POWER, d / 8));
  }, [aiming, aimStart, localBalls]);

  const onPointerUp = useCallback(() => {
    if (!aiming) return;
    setAiming(false);
    if (power < 0.3) { setPower(0); return; }
    shoot();
  }, [aiming, power]);

  // ─── Shoot ───────────────────────────────────────────
  const shoot = useCallback(() => {
    if (!isMyTurn || animating || shooting) return;
    setShooting(true);
    setAnimating(true);
    // Apply velocity to cue ball
    const balls = localBalls.map(b => {
      if (b.id === 0 && !b.pocketed) {
        return { ...b, vx: Math.cos(aimAngle) * power, vy: Math.sin(aimAngle) * power };
      }
      return { ...b };
    });
    // Animate locally
    animateShot(balls);
  }, [isMyTurn, animating, shooting, localBalls, aimAngle, power]);

  const animateShot = useCallback((balls: Ball[]) => {
    let current = balls.map(b => ({ ...b }));
    const pocketedBefore = new Set(localBalls.filter(b => b.pocketed).map(b => b.id));

    const step = () => {
      if (!ballsMoving(current)) {
        // Shot complete — collect results
        const pocketedThisShot = current
          .filter(b => b.pocketed && !pocketedBefore.has(b.id))
          .map(b => b.id);
        const cuePocketed = pocketedThisShot.includes(0);
        setLocalBalls(current);
        void submitShot(current, pocketedThisShot, cuePocketed);
        return;
      }
      current = stepPhysics(current);
      setLocalBalls([...current]);
      animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, [localBalls]);

  const submitShot = async (
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
  };

  // ─── Forfeit ─────────────────────────────────────────
  const forfeit = async () => {
    if (!confirm("هل أنت متأكد من الاستسلام؟")) return;
    await apiFetch(`/v1/games/pool/${roomId}/forfeit`, { method: "POST" });
    onClose();
  };

  // ─── UI ──────────────────────────────────────────────
  const myPocketed = room
    ? (room.player1Id === me.id ? room.player1Pocketed : room.player2Pocketed)
    : [];
  const opPocketed = room
    ? (room.player1Id === me.id ? room.player2Pocketed : room.player1Pocketed)
    : [];

  if (result && !result.shown) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-2xl">
          <span className="text-6xl">{result.won ? "🎉" : "😢"}</span>
          <h2 className="text-2xl font-bold text-gray-900">
            {result.won ? "فزت! 🎱" : "خسرت"}
          </h2>
          <p className="text-gray-600">
            {result.won ? "أحسنت الأداء!" : "حظ أوفر في المرة القادمة"}
          </p>
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
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0d1117]" dir="ltr">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a2332]">
        <button onClick={forfeit} className="rounded-xl bg-red-600/20 px-3 py-1.5 text-sm font-semibold text-red-400">
          استسلام
        </button>
        <div className="text-center">
          <div className="text-xs text-gray-400">🎱 بلياردو</div>
          {room && (
            <div className={`text-xs font-bold ${isMyTurn ? "text-green-400" : "text-gray-400"}`}>
              {isMyTurn ? `دورك ⏱ ${timeLeft}s` : `دور @${opponent?.username ?? "?"}`}
            </div>
          )}
        </div>
        <button onClick={onClose} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white">
          ✕
        </button>
      </div>

      {/* Players info */}
      <div className="flex items-center justify-between bg-[#111827] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{myType === "solids" ? "●" : myType === "stripes" ? "◉" : "?"}</span>
          <div>
            <div className="text-xs font-bold text-white">أنت @{me.username}</div>
            <div className="flex gap-1">
              {myPocketed.slice(0, 7).map(id => (
                <span key={id} className="h-3 w-3 rounded-full" style={{ background: BALL_COLORS[id] }} />
              ))}
            </div>
          </div>
        </div>
        <div className="text-lg font-bold text-yellow-400">
          {myPocketed.length} — {opPocketed.length}
        </div>
        <div className="flex flex-row-reverse items-center gap-2">
          <span className="text-lg">
            {myType === "solids" ? "◉" : myType === "stripes" ? "●" : "?"}
          </span>
          <div className="text-right">
            <div className="text-xs font-bold text-white">@{opponent?.username ?? "?"}</div>
            <div className="flex flex-row-reverse gap-1">
              {opPocketed.slice(0, 7).map(id => (
                <span key={id} className="h-3 w-3 rounded-full" style={{ background: BALL_COLORS[id] }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="min-h-0 flex-1 flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className={`rounded-lg shadow-2xl ${isMyTurn && !animating ? "cursor-crosshair" : "cursor-default"}`}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
          onTouchEnd={onPointerUp}
          style={{ touchAction: "none" }}
        />
      </div>

      {/* Power bar */}
      {aiming && (
        <div className="mx-4 mb-2 flex items-center gap-2">
          <span className="text-xs text-gray-400">قوة</span>
          <div className="flex-1 h-3 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-none"
              style={{
                width: `${(power / MAX_POWER) * 100}%`,
                background: `hsl(${120 - (power / MAX_POWER) * 120},80%,45%)`,
              }}
            />
          </div>
          <span className="text-xs text-gray-400">{Math.round((power / MAX_POWER) * 100)}%</span>
        </div>
      )}

      {/* Status */}
      {!room && (
        <div className="flex items-center justify-center py-4 text-gray-400">
          جاري تحميل اللعبة…
        </div>
      )}
      {room?.foulPending && !isMyTurn && (
        <div className="mx-4 mb-2 rounded-xl bg-red-900/40 px-3 py-2 text-center text-sm text-red-300">
          فاول — يمكنك وضع الكرة في أي مكان
        </div>
      )}
      {isMyTurn && !animating && (
        <div className="mx-4 mb-2 text-center text-sm text-green-400">
          {!room?.breakDone ? "اضغط وسحب للتصويب — ضربة الافتتاح!" : "دورك — صوّب الكرة البيضاء"}
        </div>
      )}
    </div>
  );
}
