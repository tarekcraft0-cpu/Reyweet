/**
 * تسجيل دخول / إنشاء حساب من صفحة الهبوط — نفس API التطبيق (retweet_api_token).
 */
(function () {
  var TOKEN_KEY = "retweet_api_token";
  var USER_KEY = "retweet_auth_user";

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

  if (!overlay || !form) return;

  var mode = "login";
  var busy = false;
  var config = { apiUrl: "", appPath: "/app/" };

  function trimApiUrl(u) {
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
        config.apiUrl = trimApiUrl(j.apiUrl);
        if (j.appPath) config.appPath = j.appPath;
      });
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

  function refreshOpenAppLink() {
    try {
      var el = document.getElementById("auth-open-app");
      if (!el) return;
      el.hidden = !localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function apiPost(path, body) {
    var base = config.apiUrl;
    if (!base) {
      return Promise.resolve({
        ok: false,
        status: 0,
        data: { error: "الخادم غير مضبوط على الموقع. أضف VITE_API_URL في إعدادات Vercel." },
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

  function persistSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      /* ignore */
    }
  }

  function goToApp() {
    var path = config.appPath || "/app/";
    if (!path.endsWith("/")) path += "/";
    window.location.href = path;
  }

  function validateSignup(email, username, password, confirm) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "أدخل بريداً إلكترونياً صالحاً";
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return "اسم المستخدم: 3–30 حرفاً إنجليزياً أو رقماً أو _";
    if (password.length < 6) return "كلمة المرور قصيرة جداً";
    if (password !== confirm) return "كلمة المرور غير متطابقة";
    return null;
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
        showError("أدخل اليوزر أو الإيميل وكلمة المرور");
        setBusy(false);
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
        persistSession(r.data.token, r.data.user);
        goToApp();
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
      persistSession(r.data.token, r.data.user);
      try {
        if (r.data.user && r.data.user.id) {
          localStorage.setItem("retweet_pending_welcome_user", r.data.user.id);
        }
      } catch (ex) {
        /* ignore */
      }
      goToApp();
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
