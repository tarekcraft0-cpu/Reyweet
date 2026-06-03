ضع هنا مفتاح Apple Push (.p8) من developer.apple.com

مثال: AuthKey_ABC123XYZ.p8

ثم في backend/.env.local (لا يُرفع على git):

APNS_KEY_ID=ABC123XYZ
APNS_TEAM_ID=YOUR_TEAM_ID
APNS_BUNDLE_ID=com.reyweet.app
APNS_PRODUCTION=1

وشغّل: npm run contabo:configure-apns
