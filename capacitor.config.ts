import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reyweet.app',
  appName: 'Reyweet',
  webDir: 'dist',
  server: {
    url: 'https://reyweet.vercel.app/app/',
    cleartext: false,
  },
};

export default config;
