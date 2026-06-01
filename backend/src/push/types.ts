export type PushPlatform = "ios" | "android" | "web";

export type PushTokenRecord = {
  token: string;
  userId: string;
  platform: PushPlatform;
  deviceId?: string;
  updatedAt: string;
};

export type SavePushTokenInput = {
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceId?: string;
};
