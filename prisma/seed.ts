import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const hash = (p: string) => bcrypt.hashSync(p, rounds);

  await prisma.message.deleteMany();
  await prisma.chatMember.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.favoritePost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.story.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.sticker.deleteMany();
  await prisma.mediaNote.deleteMany();
  await prisma.block.deleteMany();
  await prisma.closeFriend.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.userAppSnapshot.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();

  const sara = await prisma.user.create({
    data: {
      id: "u_sara_seed",
      username: "sara_demo",
      email: "sara@demo.retweet",
      passwordHash: hash("12345678"),
      bio: "حساب تجريبي",
      avatar: "SD",
      appTheme: "light",
      appLanguage: "ar",
    },
  });

  const omar = await prisma.user.create({
    data: {
      id: "u_omar_seed",
      username: "omar_demo",
      email: "omar@demo.retweet",
      passwordHash: hash("12345678"),
      bio: "حساب ثانٍ للاختبار",
      avatar: "OD",
    },
  });

  await prisma.follow.create({
    data: { followerId: sara.id, followeeId: omar.id },
  });

  const post = await prisma.post.create({
    data: {
      userId: sara.id,
      type: "post",
      text: "أول منشور من الخادم 🎉",
      likesJson: [],
      repostsJson: [],
    },
  });

  await prisma.comment.create({
    data: { postId: post.id, userId: omar.id, text: "تعليق تجريبي" },
  });

  const chat = await prisma.chat.create({
    data: {
      isGroup: false,
      isChannel: false,
      request: false,
    },
  });

  await prisma.chatMember.createMany({
    data: [
      { chatId: chat.id, userId: sara.id, isAdmin: false, isHost: false },
      { chatId: chat.id, userId: omar.id, isAdmin: false, isHost: false },
    ],
  });

  await prisma.message.create({
    data: {
      chatId: chat.id,
      senderId: omar.id,
      type: "text",
      content: "مرحباً من قاعدة البيانات",
      extrasJson: {},
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seed OK — users: sara_demo / omar_demo — password: 12345678");
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
