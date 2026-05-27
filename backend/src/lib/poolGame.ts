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
export const TABLE_W = 800;
export const TABLE_H = 400;
export const BALL_R = 12;
export const POCKET_R = 20;

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

  // كرة الـ cue (بيضاء)
  balls.push({ id: 0, x: 200, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false });

  // ترتيب مثلث البلياردو (15 كرة)
  const apex = { x: 560, y: TABLE_H / 2 };
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
  const positions: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      positions.push({
        x: apex.x + row * d * Math.cos(Math.PI / 6),
        y: apex.y + (col - row / 2) * d,
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
  pocketedThisShot: number[];  // معرفات الكرات المسقطة
  cuePocketed: boolean;
};

export function applyShot(
  roomId: string,
  shooterId: string,
  result: ShotResult,
): { ok: true; room: GameRoom } | { ok: false; error: string } {
  const room = activeRooms.get(roomId);
  if (!room) return { ok: false, error: "الغرفة غير موجودة" };
  if (room.status !== "active") return { ok: false, error: "اللعبة انتهت" };
  if (room.currentTurnUserId !== shooterId) return { ok: false, error: "ليس دورك" };

  const isP1 = shooterId === room.player1Id;
  const { pocketedThisShot, cuePocketed, balls } = result;

  // تحديث حالة الكرات
  room.balls = balls;

  let nextTurn = isP1 ? room.player2Id : room.player1Id;
  let foul = false;

  // 1. خطأ: كرة الضرب (cue) سقطت
  if (cuePocketed) {
    foul = true;
    // أعد الـ cue إلى المنتصف
    const cue = room.balls.find(b => b.id === 0);
    if (cue) {
      cue.pocketed = false;
      cue.x = 200;
      cue.y = TABLE_H / 2;
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
    startedAt: room.startedAt,
    endedAt: room.endedAt,
  };
}
