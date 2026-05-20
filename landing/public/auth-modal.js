/**
 * تسجيل دخول / إنشاء حساب من صفحة الهبوط — Retweet API المحلي فقط (قاعدة D).
 * لا Supabase ولا أدوات خارجية.
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
  var loginIdentifierInput = form ? form.querySelector('[name="identifier"]') : null;

  if (!overlay || !form) return;

  var mode = "login";
  var busy = false;
  var config = { apiUrl: "", appPath: "/app/" };

  function trimUrl(u) {
    return (u || "").replace(/\/$/, "");
  }

  function resolveApiUrl() {
    if (config.apiUrl) return config.apiUrl;
    return trimUrl(window.location.origin);
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
        if (j.appPath) config.appPath = j.appPath;
        if (loginIdentifierInput) {
          loginIdentifierInput.placeholder = "اليوزر أو الإيميل";
        }
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

  function hasSession() {
    try {
      return !!localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return false;
    }
  }

  function refreshOpenAppLink() {
    var el = document.getElementById("auth-open-app");
    if (!el) return;
    el.hidden = !hasSession();
  }

  function persistApiSession(token, user) {
    try {
      localStorage.removeItem("retweet_supabase_session");
      localStorage.setItem(TOKEN_KEY, token);
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        if (user.id) localStorage.setItem("retweet_pending_welcome_user", user.id);
      }
      localStorage.setItem("retweet_web_api_config", JSON.stringify({ apiUrl: resolveApiUrl() }));
    } catch (e) {
      /* ignore */
    }
  }

  function finishAuthSuccess() {
    refreshOpenAppLink();
    var path = config.appPath || "/app/";
    if (!path.endsWith("/")) path += "/";
    window.location.href = path;
  }

  function apiPost(path, body) {
    var base = resolveApiUrl();
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
      })
      .catch(function () {
        return {
          ok: false,
          status: 0,
          data: { error: "تعذر الاتصال بالخادم المحلي. شغّل: npm run local:stack" },
        };
      });
  }

  function validateSignup(email, username, password, confirm) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "أدخل بريداً إلكترونياً صالحاً";
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return "اسم المستخدم: 3–30 حرفاً (a-z صغيرة وأرقام و _ فقط)";
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
        showError("أدخل اليوزر أو البريد وكلمة المرور");
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
        persistApiSession(r.data.token, r.data.user);
        finishAuthSuccess();
      });
      return;
    }

    var email = String(fd.get("email") || "")
      .trim()
      .toLowerCase();
    var username = String(fd.get("username") || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
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
  loadConfig().then(function () {
    refreshOpenAppLink();
    try {
      localStorage.setItem("retweet_web_api_config", JSON.stringify({ apiUrl: resolveApiUrl() }));
    } catch (e) {
      /* ignore */
    }
  });
})();
