package com.reyweet.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationManagerCompat

object PushNotificationHelper {
    const val CHANNEL_HIGH = "retweet_high"
    const val CHANNEL_MESSAGES = "retweet_messages"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val high = NotificationChannel(
            CHANNEL_HIGH,
            "Reyweet",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "إشعارات Reyweet"
            enableVibration(true)
            enableLights(true)
            setSound(
                Uri.parse("android.resource://${context.packageName}/raw/insta_sound"),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build(),
            )
        }
        nm.createNotificationChannel(high)

        val messages = NotificationChannel(
            CHANNEL_MESSAGES,
            "الرسائل",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "رسائل ومحادثات"
            enableVibration(true)
        }
        nm.createNotificationChannel(messages)
    }

    fun notificationsEnabled(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()
}
