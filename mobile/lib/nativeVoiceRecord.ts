import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

let activeRecording: Audio.Recording | null = null;
let startedAt = 0;

export async function startNativeVoiceRecording(): Promise<void> {
  if (activeRecording) {
    try {
      await activeRecording.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    activeRecording = null;
  }

  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("يُرفض الميكروفون — اسمح بالوصول من إعدادات الجهاز ثم أعد المحاولة.");
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  const rec = new Audio.Recording();
  await rec.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    android: {
      extension: ".m4a",
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: ".m4a",
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
  });
  await rec.startAsync();
  activeRecording = rec;
  startedAt = Date.now();
}

export async function stopNativeVoiceRecording(): Promise<{ content: string; durationSec: number }> {
  const rec = activeRecording;
  if (!rec) {
    throw new Error("لا يوجد تسجيل نشط.");
  }

  activeRecording = null;
  const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  startedAt = 0;

  try {
    await rec.stopAndUnloadAsync();
  } finally {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    }).catch(() => {});
  }

  const uri = rec.getURI();
  if (!uri) {
    throw new Error("فشل حفظ التسجيل.");
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

  if (!base64 || base64.length < 48) {
    throw new Error("التسجيل قصير جداً — حاول مرة أخرى لمدة ثانية على الأقل.");
  }

  return {
    content: `data:audio/m4a;base64,${base64}`,
    durationSec,
  };
}
