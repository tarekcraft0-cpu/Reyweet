import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_api_config.dart';

class RetweetApiClient {
  RetweetApiClient({http.Client? httpClient})
      : _http = httpClient ?? http.Client(),
        _ownsClient = httpClient == null;

  final http.Client _http;
  final bool _ownsClient;

  void dispose() {
    if (_ownsClient) {
      _http.close();
    }
  }

  Uri _uri(String path) => Uri.parse('${AppApiConfig.baseUrl}$path');

  Future<bool> health() async {
    try {
      final r = await _http.get(_uri('/health')).timeout(const Duration(seconds: 6));
      if (r.statusCode != 200) return false;
      final m = jsonDecode(r.body);
      return m is Map && m['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  /// يُرجع الرمز عند النجاح، أو رسالة خطأ عربية/نصية من الخادم.
  Future<({String? token, String? error})> login({
    required String identifier,
    required String password,
  }) async {
    try {
      final r = await _http
          .post(
            _uri('/auth/login'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'identifier': identifier.trim(), 'password': password}),
          )
          .timeout(const Duration(seconds: 20));
      final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body);
      final map = body is Map<String, dynamic> ? body : <String, dynamic>{};
      if (r.statusCode == 200 && map['token'] is String) {
        return (token: map['token'] as String, error: null);
      }
      final err = map['error']?.toString() ?? 'خطأ ${r.statusCode}';
      return (token: null, error: err);
    } catch (e) {
      return (token: null, error: e.toString());
    }
  }
}
