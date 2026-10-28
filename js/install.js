(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function show(id) {
    ["s-installed", "s-prompt", "s-ios", "s-android", "s-desktop"].forEach(function (s) { $(s).hidden = s !== id; });
  }

  if (standalone) show("s-installed");
  else if (isIOS) show("s-ios");
  else if (isAndroid) show("s-android");
  else show("s-desktop");

  // כרום (אנדרואיד/מחשב) מאפשר כפתור התקנה ישיר
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    show("s-prompt");
  });
  $("install-btn").addEventListener("click", function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function (choice) {
      deferred = null;
      if (choice.outcome !== "accepted") show(isAndroid ? "s-android" : "s-desktop");
    });
  });
  window.addEventListener("appinstalled", function () { show("s-installed"); });

  // רישום ה-service worker כבר כאן, כדי שהקבצים יישמרו לעבודה אופליין
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
