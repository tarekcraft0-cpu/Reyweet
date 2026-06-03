import {
  listDueScheduledPosts,
  markScheduledPublished,
} from "./userExtrasStore.js";

let running = false;

export function startScheduledPostWorker(): void {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await listDueScheduledPosts();
      if (!due.length) return;
      const { upsertPostOnServer } = await import("./postSocial.js");
      for (const { userId, post } of due) {
        try {
          await upsertPostOnServer(userId, {
            id: `post-${post.id}`,
            userId,
            type: post.type,
            text: post.text,
            image: post.image,
            likes: [],
            reposts: [],
            comments: [],
            createdAt: Date.parse(post.publishAt) || Date.now(),
          });
          await markScheduledPublished(userId, post.id);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[scheduled-post]", userId, post.id, e);
        }
      }
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000);
}
