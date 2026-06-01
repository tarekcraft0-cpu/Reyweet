package com.reyweet.app.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM في الخلفية / التطبيق مغلق — النظام يعرض notification payload تلقائياً.
 * data-only: انسخ المعالجة إلى Capacitor أو أظهر إشعاراً محلياً هنا.
 */
class RetweetFirebaseMessagingService : FirebaseMessagingService() {

    override fun onCreate() {
        super.onCreate()
        PushNotificationHelper.ensureChannels(this)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM token refreshed")
        // Capacitor @capacitor/push-notifications يلتقط التوكن عبر registration listener
    }

    override fun onMessageReceived(message: RemoteMessage) {
        PushNotificationHelper.ensureChannels(this)
        val data = message.data
        if (message.notification == null && data.isNotEmpty()) {
            Log.d(TAG, "data message: $data")
        }
    }

    companion object {
        private const val TAG = "RetweetFCM"
    }
}
