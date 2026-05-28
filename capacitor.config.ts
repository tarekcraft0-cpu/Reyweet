import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.reyweet.app",
  appName: 'Reyweet',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'none',
    },
  },
};

export default config;
