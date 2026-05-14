/// عنوان Retweet API — نفس الخادم في جذر المشروع (`npm run api:dev`).
/// عند التشغيل: `flutter run --dart-define=RETWEET_API_URL=http://192.168.1.x:8788`
class AppApiConfig {
  AppApiConfig._();

  static String get baseUrl {
    const raw = String.fromEnvironment(
      'RETWEET_API_URL',
      defaultValue: 'http://192.168.1.100:8788',
    );
    return raw.trim().replaceAll(RegExp(r'/$'), '');
  }
}
