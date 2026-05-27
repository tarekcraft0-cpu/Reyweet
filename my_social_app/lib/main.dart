import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_api_config.dart';
import 'retweet_api_client.dart';

const _tokenKey = 'retweet_api_token';

// محاكاة لـ QueryClientProvider و AuthProvider
// في فلاتر نستخدم عادة Provider أو Bloc أو GetX
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // تهيئة موجه الإيماءات (لا يُعطّل السحب للخلف — يُفعَّل مع CupertinoPageRoute لاحقاً)
  GestureBinding.instance.pointerRouter;
  runApp(
    // هذا الجزء يعادل الـ Providers في كود React الخاص بك
    const RootComponent(
      child: RorkMaxApp(),
    ),
  );
}

// الـ RootComponent الذي يحتوي على التغليف البرمجي (Providers)
class RootComponent extends StatelessWidget {
  final Widget child;
  const RootComponent({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    // هنا نضع الـ Providers مثل ThemeProvider و AuthProvider
    // لمحاكاة الكود الخاص بك، سنستخدم التصميم المباشر
    return child;
  }
}

class RorkMaxApp extends StatefulWidget {
  const RorkMaxApp({super.key});

  @override
  State<RorkMaxApp> createState() => _RorkMaxAppState();
}

class _RorkMaxAppState extends State<RorkMaxApp> {
  // ThemeProvider Logic
  ThemeMode _themeMode = ThemeMode.dark;
  final RetweetApiClient _api = RetweetApiClient();
  bool? _apiReachable;

  @override
  void initState() {
    super.initState();
    GestureBinding.instance.pointerRouter;
    _api.health().then((ok) {
      if (mounted) setState(() => _apiReachable = ok);
    });
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  void toggleTheme() {
    setState(() {
      _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Retweet — شارك لحظتك', // نفس العنوان في HeadContent
      debugShowCheckedModeBanner: false,
      themeMode: _themeMode,
      
      // إعدادات الثيم (ThemeProvider)
      theme: ThemeData(
        brightness: Brightness.light,
        primaryColor: const Color(0xFF1D9BF0),
        scaffoldBackgroundColor: Colors.white,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF1D9BF0),
        scaffoldBackgroundColor: Colors.black,
      ),
      
      // التعامل مع الأخطاء والصفحات غير الموجودة (NotFoundComponent)
      onUnknownRoute: (settings) {
        return MaterialPageRoute(builder: (_) => const NotFoundScreen());
      },

      home: WelcomeScreen(
        toggleTheme: toggleTheme,
        apiReachable: _apiReachable,
        apiClient: _api,
      ),
    );
  }
}

// --- NotFoundComponent المحول إلى فلاتر ---
class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text("404", style: TextStyle(fontSize: 72, fontWeight: FontWeight.bold)),
              const Text("Page not found", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              const Text(
                "The page you're looking for doesn't exist or has been moved.",
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 30),
              ElevatedButton(
                onPressed: () => Navigator.pushReplacementNamed(context, '/'),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1D9BF0)),
                child: const Text("Go home", style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// --- ErrorComponent المحول إلى فلاتر ---
class ErrorScreen extends StatelessWidget {
  final String error;
  final VoidCallback onReset;

  const ErrorScreen({super.key, required this.error, required this.onReset});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text("This page didn't load", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            const Text("Something went wrong on our end."),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton(onPressed: onReset, child: const Text("Try again")),
                const SizedBox(width: 10),
                TextButton(onPressed: () {}, child: const Text("Go home")),
              ],
            )
          ],
        ),
      ),
    );
  }
}

// شاشة الترحيب (WelcomeView)
class WelcomeScreen extends StatelessWidget {
  final VoidCallback toggleTheme;
  final bool? apiReachable;
  final RetweetApiClient apiClient;

  const WelcomeScreen({
    super.key,
    required this.toggleTheme,
    required this.apiReachable,
    required this.apiClient,
  });

  Future<void> _openLogin(BuildContext context) async {
    final idCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('تسجيل الدخول'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: idCtrl,
                decoration: const InputDecoration(labelText: 'البريد أو اسم المستخدم'),
                textInputAction: TextInputAction.next,
              ),
              TextField(
                controller: passCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'كلمة المرور'),
                onSubmitted: (_) {},
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () async {
                final id = idCtrl.text.trim();
                final pass = passCtrl.text;
                if (id.isEmpty || pass.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('أدخل البريد/اسم المستخدم وكلمة المرور')),
                  );
                  return;
                }
                final r = await apiClient.login(identifier: id, password: pass);
                if (!ctx.mounted) return;
                if (r.token != null) {
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setString(_tokenKey, r.token!);
                  Navigator.pop(ctx);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('تم الدخول — الرمز محفوظ محلياً (${AppApiConfig.baseUrl})')),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(r.error ?? 'فشل الدخول')),
                  );
                }
              },
              child: const Text('دخول'),
            ),
          ],
        );
      },
    );
    idCtrl.dispose();
    passCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final apiLine = apiReachable == null
        ? 'جاري التحقق من الخادم…'
        : (apiReachable!
            ? 'الخادم متاح: ${AppApiConfig.baseUrl}'
            : 'تعذر الوصول للخادم — شغّل `npm run api:dev` وعدّل RETWEET_API_URL إن لزم');

    return Scaffold(
      body: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.repeat_rounded, size: 100, color: Color(0xFF1D9BF0)),
            const SizedBox(height: 20),
            const Text(
              "Retweet",
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),
            const Text(
              "شارك لحظتك",
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            Text(
              apiLine,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: apiReachable == true ? Colors.green : (apiReachable == false ? Colors.orange : Colors.grey),
              ),
            ),
            const SizedBox(height: 40),
            ElevatedButton(
              onPressed: () => _openLogin(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1D9BF0),
                minimumSize: const Size(double.infinity, 50),
              ),
              child: const Text("تسجيل الدخول", style: TextStyle(color: Colors.white)),
            ),
            const SizedBox(height: 20),
            TextButton(
              onPressed: toggleTheme,
              child: const Text("تبديل الثيم (ThemeProvider)"),
            ),
          ],
        ),
      ),
    );
  }
}