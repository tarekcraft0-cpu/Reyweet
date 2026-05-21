import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reyweet.app',
  appName: 'Reyweet',
  webDir: 'dist',
  server: {
    url: 'http://192.168.100.51:3077',
    cleartext: true
  }
};

export default config;
