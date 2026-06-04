/**
 * نظام لعبة البلياردو 🎱
 * إدارة غرف اللعبة في الذاكرة + قواعد 8-Ball
 */
import { randomUUID } from "node:crypto";
import { broadcastSseToUser } from "./realtimeHub.js";
import { emitToUsers } from "./realtimeSocket.js";

// ──────────────────────────────────────────
// أبعاد الطاولة (وحدات منطقية)
// ──────────────────────────────────────────
/** طاولة عمودية (طولية) مثل ألعاب البلياردو على الجوال */
export const TABLE_W = 400;
export const TABLE_H = 800;
export const BALL_R = 12;
export const POCKET_R = 20;
const WALL_L = 40;
const WALL_R = TABLE_W - 40;
const WALL_T = 30;
const WALL_B = TABLE_H - 30;

export const POCKETS = [
  { x: 28, y: 28 },
  { x: TABLE_W / 2, y: 18 },
  { x: TABLE_W - 28, y: 28 },
  { x: 28, y: TABLE_H - 28 },
  { x: TABLE_W / 2, y: TABLE_H - 18 },
  { x: TABLE_W - 28, y: TABLE_H - 28 },
];

// ──────────────────────────────────────────
// أنواع البيانات
// ──────────────────────────────────────────
export type BallState = {
  id: number;          // 0=cue, 1-7=solids, 8=black, 9-15=stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
};

export type GameRoom = {
  roomId: string;
  chatId: string;
  player1Id: string;
  player2Id: string;
  status: "waiting" | "active" | "finished";
  currentTurnUserId: string;
  winnerId: string | null;
  lostById: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  balls: BallState[];
  player1Type: "solids" | "stripes" | null;
  player2Type: "solids" | "stripes" | null;
  player1Pocketed: number[];
  player2Pocketed: number[];
  foulPending: boolean;
  breakDone: boolean;
  inviteMessageId: string;
  turnTimerStart: number;
  /** من يضع الكرة البيضاء بعد الفاول */
  ballInHandUserId: string | null;
  cueBallPlaced: boolean;
  player1Fouls: number;
  player2Fouls: number;
  shotCount: number;
  lastEvent: string;
  /** آخر ضربة (لتلميح الخصم) */
  lastShotPower: number;
  lastShotAngle: number;
};

// ──────────────────────────────────────────
// الذاكرة المؤقتة للغرف النشطة
// ──────────────────────────────────────────
const activeRooms = new Map<string, GameRoom>();
/** chatId → roomId لإيجاد الغرفة بسرعة */
const chatRoomIndex = new Map<string, string>();

// ──────────────────────────────────────────
// تهيئة الكرات
// ──────────────────────────────────────────
function initBalls(): BallState[] {
  const balls: BallState[] = [];

  // كرة الضرب (بيضاء) — أسفل الطاولة قرب اللاعب
  balls.push({
    id: 0,
    x: TABLE_W / 2,
    y: TABLE_H - 130,
    vx: 0,
    vy: 0,
    pocketed: false,
  });

  // مثلث الكرات — أعلى الطاولة
  const apex = { x: TABLE_W / 2, y: 145 };
  const positions = buildTriangle(apex);
  // ترتيب قياسي: 8 في المنتصف، تشابك صلبة/مخططة
  const standardOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  positions.forEach((pos, i) => {
    balls.push({
      id: standardOrder[i] ?? i + 1,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      pocketed: false,
    });
  });

  return balls;
}

function buildTriangle(apex: { x: number; y: number }): { x: number; y: number }[] {
  const rows = 5;
  const d = BALL_R * 2 + 0.5;
  const rowStep = d * Math.sin(Math.PI / 3);
  const positions: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      positions.push({
        x: apex.x + (col - row / 2) * d,
        y: apex.y + row * rowStep,
      });
    }
  }
  return positions;
}

// ──────────────────────────────────────────
// إنشاء غرفة لعب
// ──────────────────────────────────────────
export function createGameRoom(
  chatId: string,
  player1Id: string,
  player2Id: string,
  inviteMessageId: string,
): GameRoom {
  // إلغاء أي غرفة سابقة لنفس المحادثة
  const existing = chatRoomIndex.get(chatId);
  if (existing) activeRooms.delete(existing);

  const roomId = randomUUID();
  const firstTurn = Math.random() < 0.5 ? player1Id : player2Id;

  const room: GameRoom = {
    roomId,
    chatId,
    player1Id,
    player2Id,
    status: "active",
    currentTurnUserId: firstTurn,
    winnerId: null,
    lostById: null,
    createdAt: Date.now(),
    startedAt: Date.now(),
    endedAt: null,
    balls: initBalls(),
    player1Type: null,
    player2Type: null,
    player1Pocketed: [],
    player2Pocketed: [],
    foulPending: false,
    breakDone: false,
    inviteMessageId,
    turnTimerStart: Date.now(),
    ballInHandUserId: null,
    cueBallPlaced: true,
    player1Fouls: 0,
    player2Fouls: 0,
    shotCount: 0,
    lastEvent: "بدأت اللعبة — اكسر المثلث!",
    lastShotPower: 0,
    lastShotAngle: 0,
  };

  activeRooms.set(roomId, room);
  chatRoomIndex.set(chatId, roomId);
  return room;
}

export function getRoom(roomId: string): GameRoom | null {
  return activeRooms.get(roomId) ?? null;
}

export function getRoomByChat(chatId: string): GameRoom | null {
  const id = chatRoomIndex.get(chatId);
  if (!id) return null;
  return activeRooms.get(id) ?? null;
}

// ──────────────────────────────────────────
// معالجة الضربة — المصدر الحقيقي على الخادم
// الخادم يستقبل نتيجة الفيزياء من العميل ويحكّم
// ──────────────────────────────────────────
export type ShotResult = {
  balls: BallState[];
  pocketedThisShot: number[];
  cuePocketed: boolean;
  timedOut?: boolean;
  shotPower?: number;
  shotAngle?: number;
};

const TURN_SECONDS = 45;
const MAX_SHOT_POWER = 28;

function clampCuePosition(x: number, y: number): { x: number; y: number } {
  const margin = BALL_R + 4;
  return {
    x: Math.max(WALL_L + margin, Math.min(WALL_R - margin, x)),
    y: Math.max(WALL_T + margin, Math.min(WALL_B - margin, y)),
  };
}

function validateBalls(balls: BallState[]): boolean {
  if (!Array.isArray(balls) || balls.length < 2) return false;
  for (const b of balls) {
    if (typeof b.id !== "number" || typeof b.x !== "number" || typeof b.y !== "number") return false;
    if (b.x < -50 || b.x > TABLE_W + 50 || b.y < -50 || b.y > TABLE_H + 50) return false;
  }
  return true;
}

export function placeCueBall(
  roomId: string,
  userId: string,
  x: number,
  y: number,
): { ok: true; room: GameRoom } | { ok: false; error: string } {
  const room = activeRooms.get(roomId);
  if (!room) return { ok: false, error: "الغرفة غير موجودة" };
  if (room.status !== "active") return { ok: false, error: "اللعبة انتهت" };
  if (room.ballInHandUserId !== userId) return { ok: false, error: "ليس لديك كرة حرة" };

  const pos = clampCuePosition(x, y);
  const cue = room.balls.find(b => b.id === 0);
  if (!cue) return { ok: false, error: "لا توجد كرة ضرب" };

  for (const b of room.balls) {
    if (b.pocketed || b.id === 0) continue;
    if (Math.hypot(b.x - pos.x, b.y - pos.y) < BALL_R * 2.2) {
      return { ok: false, error: "الموضع قريب جداً من كرة أخرى" };
    }
  }

  cue.pocketed = false;
  cue.x = pos.x;
  cue.y = pos.y;
  cue.vx = 0;
  cue.vy = 0;
  room.cueBallPlaced = true;
  room.foulPending = false;
  room.lastEvent = "وُضعت الكرة البيضاء";
  return { ok: true, room };
}

export function applyShot(
  roomId: string,
  shooterId: string,
  result: ShotResult,
): { ok: true; room: GameRoom } | { ok: false; error: string } {
  const room = activeRooms.get(roomId);
  if (!room) return { ok: false, error: "الغرفة غير موجودة" };
  if (room.status !== "active") return { ok: false, error: "اللعبة انتهت" };
  if (room.currentTurnUserId !== shooterId) return { ok: false, error: "ليس دورك" };
  if (room.ballInHandUserId && !room.cueBallPlaced) {
    return { ok: false, error: "ضع الكرة البيضاء أولاً" };
  }
  if (!validateBalls(result.balls)) return { ok: false, error: "بيانات الكرات غير صالحة" };
  if (typeof result.shotPower === "number" && result.shotPower > MAX_SHOT_POWER + 2) {
    return { ok: false, error: "قوة الضربة غير صالحة" };
  }

  const isP1 = shooterId === room.player1Id;
  const { pocketedThisShot, cuePocketed, balls } = result;
  const timedOut = result.timedOut === true;

  room.balls = balls;
  room.shotCount += 1;
  if (typeof result.shotPower === "number") room.lastShotPower = result.shotPower;
  if (typeof result.shotAngle === "number") room.lastShotAngle = result.shotAngle;

  let nextTurn = isP1 ? room.player2Id : room.player1Id;
  let foul = timedOut;

  if (cuePocketed) {
    foul = true;
    const cue = room.balls.find(b => b.id === 0);
    if (cue) {
      cue.pocketed = false;
      cue.x = TABLE_W / 2;
      cue.y = TABLE_H - 150;
      cue.vx = 0;
      cue.vy = 0;
    }
  }

  // 2. تعيين نوع اللاعبين (أول ضربة صحيحة بعد الـ break)
  const nonCuePocketed = pocketedThisShot.filter(id => id !== 0 && id !== 8);
  if (!room.player1Type && nonCuePocketed.length > 0 && !foul) {
    const firstBall = nonCuePocketed[0]!;
    const isSolid = firstBall >= 1 && firstBall <= 7;
    if (isP1) {
      room.player1Type = isSolid ? "solids" : "stripes";
      room.player2Type = isSolid ? "stripes" : "solids";
    } else {
      room.player2Type = isSolid ? "solids" : "stripes";
      room.player1Type = isSolid ? "stripes" : "solids";
    }
  }

  // 3. إضافة الكرات المسقطة للاعبين
  const myType = isP1 ? room.player1Type : room.player2Type;
  let scoredMyBall = false;

  for (const ballId of nonCuePocketed) {
    const isSolid = ballId >= 1 && ballId <= 7;
    const isStripe = ballId >= 9 && ballId <= 15;
    const isMine =
      (myType === "solids" && isSolid) || (myType === "stripes" && isStripe);

    if (isMine && !foul) {
      if (isP1) room.player1Pocketed.push(ballId);
      else room.player2Pocketed.push(ballId);
      scoredMyBall = true;
    } else if (!isMine) {
      // كرة الخصم سقطت — تُحسب للخصم
      const isP2 = !isP1;
      if (isP2) room.player1Pocketed.push(ballId);
      else room.player2Pocketed.push(ballId);
    }
  }

  // 4. هل سقطت الـ 8؟
  if (pocketedThisShot.includes(8)) {
    const myBalls = isP1 ? room.player1Pocketed : room.player2Pocketed;
    const neededCount = myType === "solids" ? 7 : 7;
    const myOwnBalls = myBalls.filter(id =>
      myType === "solids" ? id >= 1 && id <= 7 : id >= 9 && id <= 15,
    );

    if (myOwnBalls.length >= neededCount && !foul) {
      // فوز شرعي
      room.winnerId = shooterId;
      room.lostById = isP1 ? room.player2Id : room.player1Id;
    } else {
      // خسارة (سقطت الـ8 مبكراً أو فاول)
      room.winnerId = isP1 ? room.player2Id : room.player1Id;
      room.lostById = shooterId;
    }
    room.status = "finished";
    room.endedAt = Date.now();
    chatRoomIndex.delete(room.chatId);
  }

  // 5. تبديل الدور إذا لم يسجل أو فاول
  if (!scoredMyBall || foul) {
    nextTurn = isP1 ? room.player2Id : room.player1Id;
  } else {
    nextTurn = shooterId;
  }

  if (room.status !== "finished") {
    room.currentTurnUserId = nextTurn;
    room.foulPending = foul;
    room.breakDone = true;
    room.turnTimerStart = Date.now();
    if (foul) {
      if (isP1) room.player1Fouls += 1;
      else room.player2Fouls += 1;
      room.ballInHandUserId = nextTurn;
      room.cueBallPlaced = false;
      room.lastEvent = timedOut ? "انتهى الوقت — كرة حرة للخصم" : "فاول — ضع الكرة البيضاء";
    } else if (scoredMyBall) {
      room.ballInHandUserId = null;
      room.cueBallPlaced = true;
      room.lastEvent =
        pocketedThisShot.includes(8)
          ? "سقطت الكرة السوداء!"
          : `هدف! (${pocketedThisShot.filter(id => id !== 0 && id !== 8).length} كرة)`;
    } else {
      room.ballInHandUserId = null;
      room.cueBallPlaced = true;
      room.lastEvent = "دور الخصم";
    }
  } else {
    room.lastEvent = room.winnerId === shooterId ? "فوز!" : "انتهت اللعبة";
  }

  return { ok: true, room };
}

// ──────────────────────────────────────────
// انسحاب
// ──────────────────────────────────────────
export function forfeitGame(
  roomId: string,
  userId: string,
): GameRoom | null {
  const room = activeRooms.get(roomId);
  if (!room || room.status !== "active") return null;

  room.winnerId = userId === room.player1Id ? room.player2Id : room.player1Id;
  room.lostById = userId;
  room.status = "finished";
  room.endedAt = Date.now();
  chatRoomIndex.delete(room.chatId);
  return room;
}

// ──────────────────────────────────────────
// بث حدث اللعبة للاعبين
// ──────────────────────────────────────────
export function broadcastGameEvent(
  room: GameRoom,
  event: string,
  payload: unknown,
): void {
  const targets = [room.player1Id, room.player2Id];
  for (const uid of targets) {
    broadcastSseToUser(uid, event, payload);
  }
  emitToUsers(targets, event, payload);
}

export function rematchGame(
  chatId: string,
  player1Id: string,
  player2Id: string,
  inviteMessageId: string,
): GameRoom {
  return createGameRoom(chatId, player1Id, player2Id, inviteMessageId);
}

export function serializeRoom(room: GameRoom) {
  return {
    roomId: room.roomId,
    chatId: room.chatId,
    player1Id: room.player1Id,
    player2Id: room.player2Id,
    status: room.status,
    currentTurnUserId: room.currentTurnUserId,
    winnerId: room.winnerId,
    lostById: room.lostById,
    balls: room.balls,
    player1Type: room.player1Type,
    player2Type: room.player2Type,
    player1Pocketed: room.player1Pocketed,
    player2Pocketed: room.player2Pocketed,
    foulPending: room.foulPending,
    breakDone: room.breakDone,
    turnTimerStart: room.turnTimerStart,
    turnSeconds: TURN_SECONDS,
    ballInHandUserId: room.ballInHandUserId,
    cueBallPlaced: room.cueBallPlaced,
    player1Fouls: room.player1Fouls,
    player2Fouls: room.player2Fouls,
    shotCount: room.shotCount,
    lastEvent: room.lastEvent,
    lastShotPower: room.lastShotPower,
    lastShotAngle: room.lastShotAngle,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
  };
}
