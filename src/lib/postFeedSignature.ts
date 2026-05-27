import type { Post } from "./types";

/** بصمة خفيفة لمقارنة منشور الخلاصة في React.memo */
export function postFeedSignature(post: Post): string {
  return [
    post.id,
    post.createdAt,
    post.text ?? "",
    post.image ?? "",
    post.video ?? "",
    post.type ?? "",
    post.likes?.length ?? 0,
    post.comments?.length ?? 0,
    post.reposts?.length ?? 0,
  ].join("|");
}
