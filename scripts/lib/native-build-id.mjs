/** معرّف بناء موحّد لـ IPA/APK — يُحقَن في index.html */
export function resolveNativeBuildId() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.CAPACITOR_BUILD_ID?.trim() ||
    String(Date.now())
  );
}

export function nativeBuildScriptTags(buildId) {
  const buildTag = `<script>window.__RETWEET_APP_BUILD__=${JSON.stringify(buildId)};</script>`;
  const cacheBustTag = `<script>(function(){try{var k="retweet_app_build",b=window.__RETWEET_APP_BUILD__||"";var s=localStorage.getItem(k);if(s&&b&&s!==b){localStorage.setItem(k,b);try{var u=new URL(location.href);u.searchParams.set("_b",String(Date.now()));location.replace(u.toString());return}catch(e){location.reload()}}if(b)localStorage.setItem(k,b)}catch(e){}})();</script>`;
  return { buildTag, cacheBustTag };
}
