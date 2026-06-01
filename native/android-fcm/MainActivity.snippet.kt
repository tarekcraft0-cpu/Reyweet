// في MainActivity.onCreate (بعد super.onCreate):
import com.reyweet.app.push.PushNotificationHelper

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    PushNotificationHelper.ensureChannels(this)
}
