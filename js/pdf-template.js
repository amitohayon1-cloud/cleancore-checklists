/*
 * תבנית ה-PDF – לפי דף הלוגו הרשמי של החברה (assets/letterhead.jpg בראש כל עמוד).
 *
 * כל העיצוב של ה-PDF נמצא בקובץ הזה בלבד. כדי להחליף תבנית מחליפים את
 * הפונקציה renderPages – היא מקבלת את נתוני הצ'ק ליסט ומחזירה Promise של רשימת
 * canvas, אחד לכל עמוד A4. הטקסט מצויר על ידי הדפדפן עצמו (ctx.direction = "rtl"),
 * ולכן סדר האותיות, הפיסוק, המספרים והניקוד בעברית יוצאים נכונים.
 *
 * data = {
 *   company:   "קלין קור",
 *   tradeName: "ניקוי יציאות + תעלות מ\"א",
 *   project:   "שם פרויקט",
 *   date:      "28/10/2026",
 *   items:     [{ name, qty, checked }],
 * }
 */
(function () {
  "use strict";

  var PAGE_W = 210; // מ"מ
  var PAGE_H = 297;
  var DPI = 200;
  var PX = DPI / 25.4; // פיקסלים למ"מ
  var FONT = '"Heebo", Arial, sans-serif';

  var M = 16; // שוליים – מיושר לקצוות הלוגו
  var ACCENT = "#00a3e0"; // הכחול של הלוגו
  var ACCENT_LIGHT = "#e3f5fc";

  // דף הלוגו: כמו במסמך Word הרשמי – 178×39.3 מ"מ, ממורכז, 3.2 מ"מ מראש הדף
  var LOGO_SRC = "assets/letterhead.jpg";
  var LOGO = { x: (210 - 178.1) / 2, y: 3.2, w: 178.1, h: 39.3 };
  var LOGO_BOTTOM = LOGO.y + LOGO.h;
  var FIRST_HEADER_H = 36; // כותרת המלאכה + שדות בעמוד הראשון
  var OTHER_HEADER_H = 10;
  var COLS = [ // מימין לשמאל
    { key: "num", title: "#", w: 12 },
    { key: "name", title: "פריט", w: 0 }, // רוחב שנשאר
    { key: "qty", title: "כמות", w: 24 },
    { key: "check", title: "✓", w: 18 },
  ];
  var ROW_MIN = 9;
  var LINE_H = 5.6;
  var BODY_SIZE = 4.2; // גובה פונט במ"מ (≈12pt)
  var HEAD_ROW = 10;
  var FOOTER_Y = PAGE_H - 9;

  function newPage() {
    var c = document.createElement("canvas");
    c.width = Math.round(PAGE_W * PX);
    c.height = Math.round(PAGE_H * PX);
    var ctx = c.getContext("2d");
    ctx.scale(PX, PX); // מעכשיו עובדים במ"מ
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.direction = "rtl";
    ctx.textBaseline = "alphabetic";
    return { canvas: c, ctx: ctx };
  }

  // הגאומטריה מצוירת במ"מ (ctx.scale), אבל טקסט מצויר בפיקסלים אמיתיים
  // כדי שגופן קטן לא ייצא מטושטש או עם ריווח שגוי.
  function font(ctx, sizeMm, bold) {
    ctx._font = (bold ? "700 " : "400 ") + (sizeMm * PX).toFixed(2) + "px " + FONT;
  }
  function measure(ctx, s) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = ctx._font;
    var w = ctx.measureText(s).width / PX;
    ctx.restore();
    return w;
  }
  function text(ctx, s, x, y, color, align) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = ctx._font;
    ctx.direction = "rtl";
    ctx.fillStyle = color || "#111";
    ctx.textAlign = align;
    ctx.fillText(s, x * PX, y * PX);
    ctx.restore();
  }
  // טקסט מיושר לימין ב-x (קצה ימני)
  function textR(ctx, s, x, y, color) { text(ctx, s, x, y, color, "right"); }
  function textC(ctx, s, x, y, color) { text(ctx, s, x, y, color, "center"); }

  // שבירת שורות לפי רוחב
  function wrap(ctx, s, maxW) {
    var words = String(s).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (measure(ctx, test) <= maxW || !line) line = test;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function line(ctx, x1, y1, x2, y2, w, color) {
    ctx.strokeStyle = color || "#333";
    ctx.lineWidth = w || 0.25;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function checkbox(ctx, cx, cy, checked) {
    var s = 4.6;
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 0.35;
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    if (checked) {
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.7;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 1.6, cy + 0.1);
      ctx.lineTo(cx - 0.4, cy + 1.3);
      ctx.lineTo(cx + 1.8, cy - 1.4);
      ctx.stroke();
    }
  }

  // מיקומי עמודות (x ימני ושמאלי של כל עמודה)
  function columnLayout() {
    var tableW = PAGE_W - 2 * M;
    var fixed = COLS.reduce(function (a, c) { return a + c.w; }, 0);
    var x = PAGE_W - M;
    return COLS.map(function (c) {
      var w = c.w || tableW - fixed;
      var col = { key: c.key, title: c.title, right: x, left: x - w, w: w };
      x -= w;
      return col;
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("לא ניתן לטעון " + src)); };
      img.src = src;
    });
  }

  function drawPageHeader(ctx, data, first, logo) {
    var R = PAGE_W - M;
    ctx.drawImage(logo, LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    var y = LOGO_BOTTOM;
    if (first) {
      font(ctx, 3.6, true);
      textR(ctx, "צ'ק ליסט ציוד", R, y + 9, ACCENT);
      font(ctx, 6.2, true);
      textR(ctx, data.tradeName, R, y + 17);

      font(ctx, 4.4, true);
      var lbl1 = "שם פרויקט:";
      var lbl2 = "תאריך ביצוע עבודה:";
      textR(ctx, lbl1, R, y + 25.5);
      textR(ctx, lbl2, R, y + 32);
      var lw = Math.max(measure(ctx, lbl1), measure(ctx, lbl2)) + 3;
      font(ctx, 4.4, false);
      textR(ctx, data.project || "—", R - lw, y + 25.5);
      textR(ctx, data.date || "—", R - lw, y + 32);
      return y + FIRST_HEADER_H;
    }
    font(ctx, 3.8, true);
    textR(ctx, data.tradeName + " – המשך", R, y + 6.5, "#444");
    return y + OTHER_HEADER_H;
  }

  function drawTableHead(ctx, cols, y) {
    ctx.fillStyle = ACCENT_LIGHT;
    ctx.fillRect(M, y, PAGE_W - 2 * M, HEAD_ROW);
    font(ctx, BODY_SIZE, true);
    cols.forEach(function (c) {
      var ty = y + HEAD_ROW / 2 + BODY_SIZE * 0.35;
      if (c.key === "name") textR(ctx, c.title, c.right - 2, ty);
      else textC(ctx, c.title, (c.left + c.right) / 2, ty);
    });
    line(ctx, M, y, PAGE_W - M, y, 0.4);
    line(ctx, M, y + HEAD_ROW, PAGE_W - M, y + HEAD_ROW, 0.4);
    return y + HEAD_ROW;
  }

  function drawColumnLines(ctx, cols, top, bottom) {
    cols.forEach(function (c) { line(ctx, c.right, top, c.right, bottom, 0.25); });
    line(ctx, cols[cols.length - 1].left, top, cols[cols.length - 1].left, bottom, 0.25);
  }

  function renderPages(data) {
    return loadImage(LOGO_SRC).then(function (logo) { return layoutAndDraw(data, logo); });
  }

  function layoutAndDraw(data, logo) {
    var cols = columnLayout();
    var nameCol = cols[1];
    var mctx = newPage().ctx;
    font(mctx, BODY_SIZE, false);

    // חישוב שורות
    var rows = data.items.map(function (it, i) {
      var lines = wrap(mctx, it.name, nameCol.w - 4);
      return { it: it, num: i + 1, lines: lines, h: Math.max(ROW_MIN, lines.length * LINE_H + 3.4) };
    });

    // חלוקה לעמודים
    var bottomLimit = FOOTER_Y - 6;
    var pages = [];
    var cur = null;
    var firstTop = LOGO_BOTTOM + FIRST_HEADER_H + HEAD_ROW;
    var otherTop = LOGO_BOTTOM + OTHER_HEADER_H + HEAD_ROW;
    rows.forEach(function (r) {
      if (!cur) cur = { rows: [], y: firstTop };
      if (cur.y + r.h > bottomLimit && cur.rows.length) {
        pages.push(cur);
        cur = { rows: [], y: otherTop };
      }
      cur.rows.push(r);
      cur.y += r.h;
    });
    if (!cur) cur = { rows: [], y: firstTop };
    pages.push(cur);

    var checkedCount = data.items.filter(function (i) { return i.checked; }).length;

    return pages.map(function (pg, pi) {
      var p = newPage();
      var ctx = p.ctx;
      var y = drawPageHeader(ctx, data, pi === 0, logo);
      var tableTop = y;
      y = drawTableHead(ctx, cols, y);

      pg.rows.forEach(function (r, ri) {
        if (ri % 2 === 1) {
          ctx.fillStyle = "#f6f8fa";
          ctx.fillRect(M, y, PAGE_W - 2 * M, r.h);
        }
        var mid = y + r.h / 2;
        var base = mid + BODY_SIZE * 0.35;
        font(ctx, BODY_SIZE, false);
        cols.forEach(function (c) {
          var cx = (c.left + c.right) / 2;
          if (c.key === "num") textC(ctx, String(r.num), cx, base, "#555");
          else if (c.key === "qty") {
            font(ctx, BODY_SIZE, true);
            textC(ctx, r.it.qty ? String(r.it.qty) : "", cx, base);
            font(ctx, BODY_SIZE, false);
          } else if (c.key === "check") checkbox(ctx, cx, mid, r.it.checked);
          else if (c.key === "name") {
            var startY = mid - ((r.lines.length - 1) * LINE_H) / 2 + BODY_SIZE * 0.35;
            r.lines.forEach(function (ln, li) { textR(ctx, ln, c.right - 2, startY + li * LINE_H); });
          }
        });
        y += r.h;
        line(ctx, M, y, PAGE_W - M, y, 0.2, "#999");
      });
      line(ctx, M, y, PAGE_W - M, y, 0.4);
      drawColumnLines(ctx, cols, tableTop, y);

      // סיכום בעמוד האחרון
      if (pi === pages.length - 1) {
        font(ctx, 4, true);
        textR(ctx, "סומנו " + checkedCount + " מתוך " + data.items.length, PAGE_W - M, y + 8);
      }

      // כותרת תחתונה
      font(ctx, 3.2, false);
      textC(ctx, "עמוד " + (pi + 1) + " מתוך " + pages.length, PAGE_W / 2, FOOTER_Y, "#666");
      return p.canvas;
    });
  }

  window.PdfTemplate = {
    pageWidthMm: PAGE_W,
    pageHeightMm: PAGE_H,
    // פונטים שחייבים להיטען לפני הציור
    fonts: ['400 20px "Heebo"', '700 20px "Heebo"'],
    renderPages: renderPages,
  };
})();
