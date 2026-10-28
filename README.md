# קלין קור – צ'ק ליסט ציוד

אפליקציית PWA לצ'ק ליסטים של ציוד לפי מלאכה. עובדת אופליין לגמרי, כולל הפקת PDF.

## עדכון רשימות
כל הרשימות נמצאות ב-`data/trades.json`:
- `name` – שם הפריט
- `qty` – כמות ברירת מחדל (לא חובה)
- `editable: true` – מותר לערוך את שם הפריט בשטח

## אחרי כל שינוי
מעלים באחד את `VERSION` בראש `sw.js`, כדי שהטלפונים יקבלו את הגרסה החדשה.

## מבנה
- `index.html`, `css/style.css`, `js/app.js` – האפליקציה
- `js/pdf-template.js` – תבנית ה-PDF (דף הלוגו ב-`assets/letterhead.jpg`)
- `vendor/` – jsPDF, `fonts/` – Heebo (רישיון OFL)
