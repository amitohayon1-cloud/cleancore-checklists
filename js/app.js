(function () {
  "use strict";

  var COMPANY = "קלין קור";
  var DRAFT_PREFIX = "cc-draft-";
  var MY_TRADES_KEY = "cc-my-trades"; // מלאכות שנוספו בטלפון הזה בלבד

  var trades = []; // מלאכות מ-data/trades.json
  var myTrades = []; // מלאכות שהמשתמש הוסיף בטלפון הזה
  var editingTrade = null; // מלאכה שנערכת בחלון המלאכה (null = מלאכה חדשה)
  var trade = null; // המלאכה הפתוחה
  var draft = null; // הטיוטה שלה
  var pdfResult = null; // { blob, fileName }
  var cameFromHome = false; // האם "חזרה" יכולה להשתמש בהיסטוריה

  var $ = function (id) { return document.getElementById(id); };

  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

  // ---------- עזר ----------

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoToDisplay(iso, sep) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[2] + (sep || "/") + p[1] + (sep || "/") + p[0];
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // חתימה של רשימת הבסיס – כדי לזהות שהקובץ trades.json השתנה מאז שהטיוטה נוצרה
  function baseSig(t) { return JSON.stringify(t.items); }

  function freshDraft(t) {
    return {
      sig: baseSig(t),
      project: "",
      date: todayIso(),
      items: t.items.map(function (it) {
        return { id: uid(), name: it.name, qty: it.qty != null ? String(it.qty) : "", checked: false, custom: false };
      }),
    };
  }

  function loadDraft(t) {
    try {
      var raw = localStorage.getItem(DRAFT_PREFIX + t.id);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.items)) return d;
      }
    } catch (e) { /* אין גישה לאחסון – מתחילים מרשימת הבסיס */ }
    return freshDraft(t);
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_PREFIX + trade.id, JSON.stringify(draft)); } catch (e) { /* ignore */ }
  }

  function hasDraft(t) {
    try { return !!localStorage.getItem(DRAFT_PREFIX + t.id); } catch (e) { return false; }
  }

  // ---------- מלאכות שלי ----------

  function loadMyTrades() {
    try {
      var d = JSON.parse(localStorage.getItem(MY_TRADES_KEY) || "[]");
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  }

  function saveMyTrades() {
    try { localStorage.setItem(MY_TRADES_KEY, JSON.stringify(myTrades)); } catch (e) { /* ignore */ }
  }

  function allTrades() { return trades.concat(myTrades); }

  // סעיף בכל שורה; מסיר רק מספור ותבליטים בתחילת שורה (כמו "1." או "-" מרשימה שהודבקה)
  function parseItems(text) {
    return text.split(/\r?\n/)
      .map(function (l) { return l.replace(/^\s*(?:\d+\s*[.)]|[-*•▪●])\s*/, "").trim(); })
      .filter(Boolean)
      .map(function (name) { return { name: name }; });
  }

  function openTradeDialog(t) {
    editingTrade = t || null;
    $("trade-dialog-title").textContent = t ? "עריכת מלאכה" : "מלאכה חדשה";
    $("t-name").value = t ? t.name : "";
    $("t-items").value = t ? t.items.map(function (i) { return i.name; }).join("\n") : "";
    $("t-error").hidden = true;
    $("t-extra").hidden = !t;
    $("t-delete-confirm").hidden = true;
    openOverlay("trade-dialog");
    if (!t) $("t-name").focus();
  }

  function saveTradeDialog() {
    var name = $("t-name").value.trim();
    var items = parseItems($("t-items").value);
    var err = !name ? "צריך לכתוב שם למלאכה." : !items.length ? "צריך לכתוב לפחות סעיף אחד." : "";
    $("t-error").textContent = err;
    $("t-error").hidden = !err;
    if (err) return;
    var t = editingTrade;
    if (t) {
      t.name = name;
      t.items = items;
      if (hasDraft(t)) mergeDraftWithBase(t);
    } else {
      t = { id: "my-" + uid(), name: name, items: items, mine: true };
      myTrades.push(t);
    }
    saveMyTrades();
    closeOverlays();
    if (editingTrade) openTrade(t);
    else { cameFromHome = true; location.hash = "#/" + encodeURIComponent(t.id); }
  }

  // אחרי עריכת מלאכה שלי: הטיוטה עוברת לרשימה החדשה, ושומרת סימון וכמות של סעיפים
  // באותו שם, את שם הפרויקט, התאריך והסעיפים שנוספו לעבודה הנוכחית
  function mergeDraftWithBase(t) {
    var old = loadDraft(t);
    var fresh = freshDraft(t);
    fresh.project = old.project;
    fresh.date = old.date;
    fresh.items.forEach(function (it) {
      var prev = old.items.find(function (o) { return !o.custom && o.name === it.name; });
      if (prev) { it.checked = prev.checked; it.qty = prev.qty; }
    });
    old.items.forEach(function (o) { if (o.custom) fresh.items.push(o); });
    try { localStorage.setItem(DRAFT_PREFIX + t.id, JSON.stringify(fresh)); } catch (e) { /* ignore */ }
  }

  function deleteMyTrade() {
    var t = editingTrade;
    myTrades = myTrades.filter(function (x) { return x !== t; });
    saveMyTrades();
    try { localStorage.removeItem(DRAFT_PREFIX + t.id); } catch (e) { /* ignore */ }
    closeOverlays();
    location.hash = "";
  }

  // שליחת המלאכה (וואטסאפ וכו') כדי להוסיף אותה לרשימות הקבועות של כולם
  function shareTradeText() {
    var t = editingTrade;
    var text = "מלאכה חדשה לצ'ק ליסט: " + t.name + "\n" +
      t.items.map(function (i, n) { return (n + 1) + ". " + i.name; }).join("\n");
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { showToast("הרשימה הועתקה – אפשר להדביק בוואטסאפ"); });
    }
  }

  // ---------- מסך ראשי ----------

  function renderHome() {
    var list = $("trade-list");
    list.innerHTML = "";
    allTrades().forEach(function (t) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      var label = document.createElement("span");
      label.textContent = t.name;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = (t.mine ? "מלאכה שלי · " : "") + t.items.length + " פריטים" + (hasDraft(t) ? " · יש טיוטה פתוחה" : "");
      label.appendChild(meta);
      b.appendChild(label);
      b.insertAdjacentHTML("beforeend", ICON_CHEV);
      b.addEventListener("click", function () { cameFromHome = true; location.hash = "#/" + encodeURIComponent(t.id); });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  // ---------- מסך צ'ק ליסט ----------

  function openTrade(t) {
    trade = t;
    draft = loadDraft(t);
    $("trade-title").textContent = t.name;
    $("edit-trade-btn").hidden = !t.mine;
    $("f-project").value = draft.project || "";
    $("f-date").value = draft.date || "";
    $("base-changed").hidden = draft.sig === baseSig(t);
    renderItems();
    showScreen("checklist");
    $("items").querySelectorAll("textarea.name").forEach(autoSize); // אחרי שהמסך גלוי
    window.scrollTo(0, 0);
  }

  function renderItems() {
    var ul = $("items");
    ul.innerHTML = "";
    draft.items.forEach(function (it) { ul.appendChild(itemRow(it)); });
    ul.querySelectorAll("textarea.name").forEach(autoSize);
    updateProgress();
  }

  function itemRow(it) {
    var li = document.createElement("li");
    li.className = "item" + (it.checked ? " checked" : "");
    li.dataset.id = it.id;

    var check = document.createElement("label");
    check.className = "check";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = it.checked;
    cb.setAttribute("aria-label", it.name || "סעיף");
    var box = document.createElement("span");
    box.className = "box";
    box.innerHTML = ICON_CHECK;
    check.appendChild(cb);
    check.appendChild(box);
    cb.addEventListener("change", function () {
      it.checked = cb.checked;
      li.classList.toggle("checked", it.checked);
      saveDraft();
      updateProgress();
    });

    // כל שם סעיף ניתן לעריכה; textarea כדי ששמות ארוכים יירדו שורה
    var name = document.createElement("textarea");
    name.className = "name";
    name.rows = 1;
    name.placeholder = "שם הסעיף";
    name.value = it.name;
    name.enterKeyHint = "done";
    name.setAttribute("aria-label", "שם הסעיף");
    name.addEventListener("input", function () {
      if (/\n/.test(name.value)) name.value = name.value.replace(/\n/g, " ");
      it.name = name.value;
      cb.setAttribute("aria-label", it.name || "סעיף");
      autoSize(name);
      saveDraft();
    });
    name.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); name.blur(); }
    });

    var qty = document.createElement("input");
    qty.type = "text";
    qty.inputMode = "numeric";
    qty.pattern = "[0-9]*";
    qty.className = "qty";
    qty.placeholder = "כמות";
    qty.value = it.qty;
    qty.setAttribute("aria-label", "כמות");
    qty.addEventListener("input", function () {
      var v = qty.value.replace(/[^0-9]/g, "");
      if (v !== qty.value) qty.value = v;
      it.qty = v;
      saveDraft();
    });

    var del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.setAttribute("aria-label", "מחק סעיף");
    del.innerHTML = ICON_TRASH;
    del.addEventListener("click", function () { removeItem(it); });

    li.appendChild(check);
    li.appendChild(name);
    li.appendChild(qty);
    li.appendChild(del);
    return li;
  }

  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function updateProgress() {
    var total = draft.items.length;
    var done = draft.items.filter(function (i) { return i.checked; }).length;
    $("progress-text").textContent = "סומנו " + done + " מתוך " + total;
    $("progress-fill").style.width = total ? (done / total) * 100 + "%" : "0";
  }

  function addItem() {
    var it = { id: uid(), name: "", qty: "", checked: false, custom: true };
    draft.items.push(it);
    saveDraft();
    var row = itemRow(it);
    $("items").appendChild(row);
    updateProgress();
    var input = row.querySelector(".name");
    input.focus();
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function removeItem(it) {
    var idx = draft.items.indexOf(it);
    if (idx < 0) return;
    draft.items.splice(idx, 1);
    saveDraft();
    renderItems();
    showToast("הסעיף נמחק" + (it.name ? ": " + it.name : ""), "בטל", function () {
      draft.items.splice(Math.min(idx, draft.items.length), 0, it);
      saveDraft();
      renderItems();
    });
  }

  function resetDraft() {
    draft = freshDraft(trade);
    try { localStorage.removeItem(DRAFT_PREFIX + trade.id); } catch (e) { /* ignore */ }
    openTrade(trade);
  }

  // ---------- PDF ----------

  function safeFileName(s) {
    // תווים שאסורים בשמות קבצים: " הופך לגרשיים העבריים, השאר מוסרים
    return s.replace(/"/g, "״").replace(/[\\/:*?<>|]/g, "-").replace(/\s+/g, " ").trim();
  }

  function exportPdf() {
    var btn = $("export-btn");
    btn.disabled = true;
    btn.textContent = "מכין PDF…";

    var items = draft.items
      .filter(function (i) { return i.name.trim(); })
      .map(function (i) { return { name: i.name.trim(), qty: i.qty, checked: i.checked }; });

    var data = {
      company: COMPANY,
      tradeName: trade.name,
      project: draft.project.trim(),
      date: isoToDisplay(draft.date),
      items: items,
    };

    Promise.all(PdfTemplate.fonts.map(function (f) { return document.fonts.load(f, "אבג 123"); }))
      .then(function () { return document.fonts.ready; })
      .then(function () { return PdfTemplate.renderPages(data); })
      .then(function (pages) {
        var W = PdfTemplate.pageWidthMm;
        var H = PdfTemplate.pageHeightMm;
        var doc = new window.jspdf.jsPDF({ unit: "mm", format: [W, H], orientation: "portrait", compress: true });
        pages.forEach(function (c, i) {
          if (i > 0) doc.addPage([W, H], "portrait");
          doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, W, H, undefined, "FAST");
        });
        doc.setProperties({ title: trade.name + " " + data.date, creator: COMPANY });
        var fileName = safeFileName(trade.name + " " + isoToDisplay(draft.date, ".")) + ".pdf";
        pdfResult = { blob: doc.output("blob"), fileName: fileName };
        $("pdf-name").textContent = fileName;
        $("pdf-preview").src = pages[0].toDataURL("image/jpeg", 0.6);
        var canShare = !!(navigator.canShare && navigator.canShare({ files: [pdfFile()] }));
        $("pdf-share").hidden = !canShare;
        openOverlay("pdf-dialog");
      })
      .catch(function (err) {
        console.error(err);
        showToast("שגיאה בהפקת ה-PDF");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "ייצוא ל-PDF";
      });
  }

  function pdfFile() {
    return new File([pdfResult.blob], pdfResult.fileName, { type: "application/pdf" });
  }

  function sharePdf() {
    navigator.share({ files: [pdfFile()], title: pdfResult.fileName }).catch(function (err) {
      if (err && err.name !== "AbortError") downloadPdf();
    });
  }

  function downloadPdf() {
    var url = URL.createObjectURL(pdfResult.blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = pdfResult.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // ---------- חלונות והודעות ----------

  function openOverlay(id) { $(id).hidden = false; }
  function closeOverlays() {
    document.querySelectorAll(".overlay").forEach(function (o) { o.hidden = true; });
  }

  var toastTimer;
  function showToast(text, actionLabel, action) {
    var t = $("toast");
    $("toast-text").textContent = text;
    var a = $("toast-action");
    a.hidden = !actionLabel;
    a.textContent = actionLabel || "";
    a.onclick = function () { t.hidden = true; if (action) action(); };
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 6000);
  }

  // ---------- ניווט ----------

  function showScreen(name) {
    $("home").hidden = name !== "home";
    $("checklist").hidden = name !== "checklist";
  }

  function route() {
    closeOverlays();
    $("toast").hidden = true;
    var m = location.hash.match(/^#\/(.+)$/);
    var t = m && allTrades().find(function (x) { return x.id === decodeURIComponent(m[1]); });
    if (t) openTrade(t);
    else {
      trade = null;
      cameFromHome = false;
      renderHome();
      showScreen("home");
    }
  }

  // ---------- אתחול ----------

  function bind() {
    $("back-btn").addEventListener("click", function () {
      if (cameFromHome) history.back();
      else location.hash = "";
    });
    $("f-project").addEventListener("input", function (e) { draft.project = e.target.value; saveDraft(); });
    $("f-date").addEventListener("change", function (e) { draft.date = e.target.value; saveDraft(); });
    $("add-item").addEventListener("click", addItem);
    $("new-trade-btn").addEventListener("click", function () { openTradeDialog(null); });
    $("edit-trade-btn").addEventListener("click", function () { openTradeDialog(trade); });
    $("t-save").addEventListener("click", saveTradeDialog);
    $("t-share").addEventListener("click", shareTradeText);
    $("t-delete").addEventListener("click", function () { $("t-delete-confirm").hidden = false; });
    $("t-delete-no").addEventListener("click", function () { $("t-delete-confirm").hidden = true; });
    $("t-delete-yes").addEventListener("click", deleteMyTrade);
    $("reset-btn").addEventListener("click", function () { openOverlay("reset-dialog"); });
    $("reset-confirm").addEventListener("click", function () { closeOverlays(); resetDraft(); });
    $("export-btn").addEventListener("click", exportPdf);
    $("pdf-share").addEventListener("click", sharePdf);
    $("pdf-download").addEventListener("click", downloadPdf);
    document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", closeOverlays); });
    document.querySelectorAll(".overlay").forEach(function (o) {
      o.addEventListener("click", function (e) { if (e.target === o) closeOverlays(); });
    });
    window.addEventListener("hashchange", route);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    var refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      function offer(worker) {
        $("update-bar").hidden = false;
        $("update-btn").onclick = function () { worker.postMessage("skipWaiting"); };
      }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", function () {
        var w = reg.installing;
        w.addEventListener("statechange", function () {
          if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
        });
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") reg.update().catch(function () {});
      });
    });
  }

  function showVersion() {
    if (!window.caches) return;
    caches.keys().then(function (keys) {
      var k = keys.filter(function (x) { return x.indexOf("cc-checklists-") === 0; }).sort().pop();
      if (k) $("version").textContent = "גרסה " + k.replace("cc-checklists-", "");
    });
  }

  bind();
  registerSW();
  // בתוך האפליקציה המותקנת אין צורך בלינק ההתקנה
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) $("install-link").hidden = true;
  fetch("data/trades.json")
    .then(function (r) { return r.json(); })
    .then(function (json) {
      trades = json.trades || [];
      myTrades = loadMyTrades();
      route();
      showVersion();
    })
    .catch(function () {
      var e = $("home-error");
      e.textContent = "לא ניתן לטעון את רשימת המלאכות. פתח את האפליקציה פעם אחת עם חיבור לאינטרנט.";
      e.hidden = false;
    });
})();
