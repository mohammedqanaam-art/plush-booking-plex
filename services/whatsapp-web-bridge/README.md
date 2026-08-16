# BHG WhatsApp Web Bridge

ربط واتساب بالكود عبر WhatsApp Web باستخدام Baileys، بدون WhatsApp Business Cloud API.

## التشغيل

1. انسخ `.env.example` إلى `.env`.
2. ضع `BRIDGE_TOKEN` عشوائيًا وطويلًا.
3. ضع رقم واتساب في `WA_PHONE_NUMBER` بصيغة دولية أرقام فقط، مثال السعودية `9665XXXXXXXX`.
4. اختر مسار الرد:
   - `N8N_INBOUND_URL` لتمرير الرسائل إلى n8n وإرجاع `{ "reply": "..." }`.
   - أو `MODEL_API_KEY` للرد مباشرة عبر Meta Model API / Muse Spark.
5. شغّل:

```bash
docker compose up -d --build
```

6. افحص الحالة:

```bash
curl http://localhost:3000/health
```

7. احصل على Pairing Code:

```bash
curl -H "Authorization: Bearer YOUR_BRIDGE_TOKEN" http://localhost:3000/pairing-code
```

ثم في واتساب: **الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف** وأدخل الكود.

## إرسال رسالة من n8n أو نظام داخلي

```bash
curl -X POST http://localhost:3000/send \
  -H "Authorization: Bearer YOUR_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"9665XXXXXXXX","text":"اختبار"}'
```

## التخزين

الجلسة تحفظ داخل `/data/auth`. لا تحذف هذا المجلد ولا ترفعه إلى GitHub. إذا تم تسجيل خروج الجهاز المرتبط، احذف بيانات الجلسة محليًا وأعد الربط.

## الاستضافة

الخدمة تحتاج Process دائم وقرصًا دائمًا لحفظ Session. شغّلها على VPS أو جهاز ثابت أو Docker Host. لا تعتمد على Netlify Functions لتشغيل جلسة WhatsApp Web الدائمة.

## تنبيه

Baileys عميل غير رسمي يعتمد على بروتوكول WhatsApp Web. تجنب الرسائل الجماعية والـspam، واستخدم رقمًا مخصصًا للاختبار قبل الاعتماد التشغيلي.
