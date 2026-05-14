import 'package:flutter_test/flutter_test.dart';

import 'package:my_social_app/main.dart';

void main() {
  testWidgets('Retweet welcome title', (WidgetTester tester) async {
    await tester.pumpWidget(
      const RootComponent(
        child: RorkMaxApp(),
      ),
    );
    await tester.pump();
    expect(find.text('Retweet'), findsOneWidget);
  });
}
