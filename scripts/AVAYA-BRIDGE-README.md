# وكيل مزامنة Avaya المحلي

هذا الوكيل يرفع تقارير Avaya الثلاثة إلى لوحة الحجز كل 3 ساعات عبر اتصال HTTPS صادر فقط:

- `User Inbound Summary`
- `Feature Trace` لفترات DND
- `Agent Time Card`

## حدود الأمان

- يتطلب موافقة IT قبل تركيبه على جهاز الشركة.
- لا يفتح Avaya أو منفذ `7444` للإنترنت، ولا ينشئ Port Forwarding أو نطاقًا عامًا.
- لا يقرأ كلمة مرور Avaya ولا رمز OTP. إعداد Avaya الرسمي هو المسؤول عن تصدير ملفات XLSX إلى مجلد محلي.
- مفتاح الرفع يُدخل مرة واحدة داخل نافذة PowerShell الآمنة، ثم يُشفّر بواسطة Windows DPAPI.
- الرفع مقفل على `https://www.res-dashbord.com/api/avaya/sync` فقط.
- أول تشغيل يقرأ آخر 12 ساعة وبحد أقصى 12 ملفًا لمنع رفع أشهر سابقة بالخطأ.

## المتطلبات

1. جهاز Windows ثابت داخل شبكة الشركة ويستطيع الوصول إلى نظام Avaya.
2. صلاحية Administrator وموافقة IT لتسجيل Scheduled Task يعمل بحساب SYSTEM.
3. إعداد Report Scheduler في Avaya ليحفظ التقارير الثلاثة بصيغة XLSX داخل مجلد محلي ثابت.
4. قيمة `AVAYA_SYNC_KEY` الحالية من مسؤول Netlify؛ لا تُرسل في البريد أو المحادثات.

## التثبيت بعد اعتماد IT

شغّل PowerShell كمسؤول من مجلد `scripts`:

```powershell
.\install-avaya-bridge.ps1 -ExportDirectory "C:\BHG\AvayaExports" -IntervalMinutes 180 -LookbackHours 12
```

سيُطلب مفتاح المزامنة داخل نافذة آمنة، ثم ينشأ Scheduled Task باسم `RES Avaya Report Sync`. تظهر نبضة الوكيل وحالة آخر تقرير في صفحة تقارير Avaya بالموقع.

إذا كانت سياسة المؤسسة تمنع تشغيل سكربت غير موقّع، يجب على IT توقيع الملف أو نشره عبر أداة الإدارة المعتمدة. لا تغيّر Execution Policy ولا تعطل الحماية.
