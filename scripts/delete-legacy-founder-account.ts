/**
 * يحذف من PostgreSQL الحساب المدمج القديم `u_t_account` (@t) وقناة المجتمع المرتبطة به.
 * تشغيل: npm run db:delete-legacy-founder
 *
 * يحتاج `DATABASE_URL` وخادماً يعملاً (مثلاً `docker compose up -d`).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const LEGACY_USER_ID = "u_t_account";
const LEGACY_CHANNEL_ID = "channel_t_auto_join_everyone";

const prisma = new PrismaClient();

async function main() {
  const u = await prisma.user.findUnique({ where: { id: LEGACY_USER_ID } });
  const ch = await prisma.chat.findUnique({ where: { id: LEGACY_CHANNEL_ID } });

  if (!u && !ch) {
    // eslint-disable-next-line no-console
    console.log("[db:delete-legacy-founder] لا يوجد شيء لحذفه — تم.");
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.message.deleteMany({ where: { chatId: LEGACY_CHANNEL_ID } });
    await tx.chatMember.deleteMany({ where: { chatId: LEGACY_CHANNEL_ID } });
    await tx.chat.deleteMany({ where: { id: LEGACY_CHANNEL_ID } });
    if (u) {
      await tx.user.delete({ where: { id: LEGACY_USER_ID } });
    }
  });

  // eslint-disable-next-line no-console
  console.log("[db:delete-legacy-founder] تم حذف الحساب/القناة القديمة إن وُجدت.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
