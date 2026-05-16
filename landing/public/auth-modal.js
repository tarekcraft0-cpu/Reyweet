/**
 * تسجيل دخول / إنشاء حساب من صفحة الهبوط.
 * Retweet API إن وُجد apiUrl، وإلا Supabase (نفس التطبيق بدون VITE_API_URL).
 */
(function () {
  var TOKEN_KEY = "retweet_api_token";
  var USER_KEY = "retweet_auth_user";
  var SB_SESSION_KEY = "retweet_supabase_session";

  var overlay = document.getElementById("auth-overlay");
  var panel = document.getElementById("auth-panel");
  var form = document.getElementById("auth-form");
  var errEl = document.getElementById("auth-error");
  var infoEl = document.getElementById("auth-info");
  var submitBtn = document.getElementById("auth-submit");
  var titleEl = document.getElementById("auth-title");
  var fieldsLogin = document.getElementById("auth-fields-login");
  var fieldsSignup = document.getElementById("auth-fields-signup");
  var toggleSignup = document.getElementById("auth-toggle-signup");
  var toggleLogin = document.getElementById("auth-toggle-login");
  var loginIdentifierInput = form ? form.querySelector('[name="identifier"]') : null;

  if (!overlay || !form) return;

  var mode = "login";
  var busy = false;
  var config = { apiUrl: "", appPath: "/app/", supabaseUrl: "", supabaseAnonKey: "" };

  function trimUrl(u) {
    return (u || "").replace(/\/$/, "");
  }

  function loadConfig() {
    return fetch("./public/app-config.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return {};
        return r.json();
      })
      .catch(function () {
        return {};
      })
      .then(function (j) {
        config.apiUrl = trimUrl(j.apiUrl);
        config.supabaseUrl = trimUrl(j.supabaseUrl);
        config.supabaseAnonKey = (j.supabaseAnonKey || "").trim();
        if (j.appPath) config.appPath = j.appPath;
        updateLoginPlaceholder();
      });
  }

  function usesSupabase() {
    return !config.apiUrl && !!(config.supabaseUrl && config.supabaseAnonKey);
  }

  function updateLoginPlaceholder() {
    if (!loginIdentifierInput) return;
    loginIdentifierInput.placeholder = usesSupabase() ? "البريد الإلكتروني" : "اليوزر أو الإيميل";
  }

  function setBusy(on) {
    busy = on;
    if (submitBtn) submitBtn.disabled = on;
  }

  function showError(msg) {
    if (errEl) {
      errEl.textContent = msg || "";
      errEl.hidden = !msg;
    }
    if (infoEl) infoEl.hidden = true;
  }

  function showInfo(msg) {
    if (infoEl) {
      infoEl.textContent = msg || "";
      infoEl.hidden = !msg;
    }
    if (errEl) errEl.hidden = true;
  }

  function clearMessages() {
    showError("");
    showInfo("");
  }

  function setMode(next) {
    mode = next;
    clearMessages();
    if (titleEl) titleEl.textContent = mode === "login" ? "تسجيل الدخول" : "إنشاء حساب";
    if (submitBtn) submitBtn.textContent = mode === "login" ? "دخول" : "إنشاء الحساب";
    if (fieldsLogin) fieldsLogin.hidden = mode !== "login";
    if (fieldsSignup) fieldsSignup.hidden = mode !== "signup";
    if (toggleSignup) toggleSignup.hidden = mode !== "login";
    if (toggleLogin) toggleLogin.hidden = mode === "login";
  }

  function openModal() {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      panel.classList.add("is-open");
    });
    var first = form.querySelector('input:not([type="hidden"])');
    if (first) first.focus();
  }

  function closeModal() {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    window.setTimeout(function () {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
    }, 220);
  }

  function hasSession() {
    try {
      if (localStorage.getItem(TOKEN_KEY)) return true;
      if (localStorage.getItem(SB_SESSION_KEY)) return true;
      var ref = supabaseStorageKey();
      if (ref && localStorage.getItem(ref)) return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function refreshOpenAppLink() {
    var el = document.getElementById("auth-open-app");
    if (!el) return;
    el.hidden = !hasSession();
  }

  function supabaseProjectRef() {
    try {
      return new URL(config.supabaseUrl).hostname.split(".")[0] || "";
    } catch (e) {
      return "";
    }
  }

  function supabaseStorageKey() {
    var ref = supabaseProjectRef();
    return ref ? "sb-" + ref + "-auth-token" : "";
  }

  function mapSupabaseError(msg) {
    if (!msg) return "تعذر تسجيل الدخول";
    if (/invalid login credentials/i.test(msg)) return "البريد أو كلمة المرور غير صحيحة";
    if (/email not confirmed/i.test(msg)) return "فعّل بريدك من رابط التأكيد ثم أعد المحاولة";
    if (/user already registered/i.test(msg)) return "هذا البريد مسجّل مسبقاً — جرّب تسجيل الدخول";
    return msg;
  }

  function supabaseHeaders() {
    return {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: "Bearer " + config.supabaseAnonKey,
    };
  }

  function persistSupabaseSession(payload) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      var session = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
        expires_at: payload.expires_at,
        token_type: payload.token_type || "bearer",
        user: payload.user,
      };
      localStorage.setItem(SB_SESSION_KEY, JSON.stringify(session));
      var storageKey = supabaseStorageKey();
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(session));
      if (payload.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
        if (payload.user.id) localStorage.setItem("retweet_pending_welcome_user", payload.user.id);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function persistApiSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      /* ignore */
    }
  }

  function finishAuthSuccess() {
    refreshOpenAppLink();
    var path = config.appPath || "/app/";
    if (!path.endsWith("/")) path += "/";
    fetch(path, { method: "HEAD" })
      .then(function (res) {
        if (res.ok) {
          window.location.href = path;
          return;
        }
        showInfo("تم تسجيل الدخول بنجاح. حمّل التطبيق أو افتحه من جهازك بنفس البريد.");
        window.setTimeout(function () {
          closeModal();
          var dl = document.getElementById("download");
          if (dl) dl.scrollIntoView({ behavior: "smooth" });
        }, 1200);
      })
      .catch(function () {
        showInfo("تم تسجيل الدخول بنجاح. افتح تطبيق Retweet من جهازك.");
        window.setTimeout(function () {
          closeModal();
          var dl = document.getElementById("download");
          if (dl) dl.scrollIntoView({ behavior: "smooth" });
        }, 1200);
      });
  }

  function apiPost(path, body) {
    var base = config.apiUrl;
    if (!base) {
      return Promise.resolve({
        ok: false,
        status: 0,
        data: { error: "لا يوجد خادم API أو Supabase مضبوط على الموقع." },
      });
    }
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { error: "تعذر الاتصال بالخادم" } };
      });
  }

  function supabaseLogin(email, password) {
    return fetch(config.supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .catch(function () {
        return { ok: false, data: { error_description: "تعذر الاتصال بـ Supabase" } };
      });
  }

  function supabaseSignup(email, password, username) {
    return fetch(config.supabaseUrl + "/auth/v1/signup", {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        email: email,
        password: password,
        data: { username: username },
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .catch(function () {
        return { ok: false, data: { error_description: "تعذر الاتصال بـ Supabase" } };
      });
  }

  function validateSignup(email, username, password, confirm) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "أدخل بريداً إلكترونياً صالحاً";
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return "اسم المستخدم: 3–30 حرفاً إنجليزياً أو رقماً أو _";
    if (password.length < 6) return "كلمة المرور قصيرة جداً";
    if (password !== confirm) return "كلمة المرور غير متطابقة";
    return null;
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    clearMessages();
    setBusy(true);

    var fd = new FormData(form);

    if (mode === "login") {
      var identifier = String(fd.get("identifier") || "").trim();
      var password = String(fd.get("password") || "");
      if (!identifier || !password) {
        showError("أدخل البريد وكلمة المرور");
        setBusy(false);
        return;
      }

      if (usesSupabase()) {
        if (!isEmail(identifier)) {
          showError("مع تسجيل الدخول عبر الموقع استخدم البريد الإلكتروني.");
          setBusy(false);
          return;
        }
        supabaseLogin(identifier.toLowerCase(), password).then(function (r) {
          setBusy(false);
          if (!r.ok || !r.data.access_token) {
            showError(mapSupabaseError(r.data.error_description || r.data.msg || r.data.error));
            return;
          }
          persistSupabaseSession(r.data);
          finishAuthSuccess();
        });
        return;
      }

      apiPost("/auth/login", { identifier: identifier, password: password }).then(function (r) {
        setBusy(false);
        if (!r.ok) {
          showError(r.data.error || "بيانات خاطئة");
          return;
        }
        if (!r.data.token) {
          showError("استجابة غير صالحة من الخادم");
          return;
        }
        persistApiSession(r.data.token, r.data.user);
        finishAuthSuccess();
      });
      return;
    }

    var email = String(fd.get("email") || "").trim().toLowerCase();
    var username = String(fd.get("username") || "").trim();
    var pwd = String(fd.get("password") || "");
    var confirm = String(fd.get("confirm") || "");
    var vErr = validateSignup(email, username, pwd, confirm);
    if (vErr) {
      showError(vErr);
      setBusy(false);
      return;
    }

    if (usesSupabase()) {
      supabaseSignup(email, pwd, username).then(function (r) {
        setBusy(false);
        if (!r.ok) {
          showError(mapSupabaseError(r.data.error_description || r.data.msg || r.data.error));
          return;
        }
        if (r.data.access_token) {
          persistSupabaseSession(r.data);
          finishAuthSuccess();
          return;
        }
        if (r.data.user && !r.data.session) {
          showInfo("تحقق من بريدك واضغط رابط التأكيد، ثم سجّل الدخول.");
          setMode("login");
          return;
        }
        showError("تعذر إنشاء الحساب");
      });
      return;
    }

    apiPost("/auth/register", { email: email, username: username, password: pwd }).then(function (r) {
      setBusy(false);
      if (!r.ok) {
        showError(r.data.error || "تعذر إنشاء الحساب");
        return;
      }
      if (!r.data.token) {
        showError("استجابة غير صالحة من الخادم");
        return;
      }
      persistApiSession(r.data.token, r.data.user);
      finishAuthSuccess();
    });
  });

  document.querySelectorAll("[data-open-auth]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      loadConfig().then(openModal);
    });
  });

  document.querySelectorAll("[data-close-auth]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  if (toggleSignup) {
    toggleSignup.addEventListener("click", function () {
      setMode("signup");
    });
  }
  if (toggleLogin) {
    toggleLogin.addEventListener("click", function () {
      setMode("login");
    });
  }

  setMode("login");
  loadConfig().then(refreshOpenAppLink);
})();
