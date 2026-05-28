import { Ban } from "lucide-react";

export function BannedProfileView({ username }: { username: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Ban size={40} />
      </div>
      <p className="text-lg font-bold">@{username}</p>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
        تم حظر هذا الحساب.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/80">This account has been banned.</p>
    </div>
  );
}
