# 🚢 منظومة الوسائل البحرية - Enterprise

نظام متكامل لإدارة الأسطول البحري بمستوى أمان بنكي.

## 📋 الميزات

- 🔐 **أمان Enterprise**: HttpOnly Cookies, CSRF, 2FA, Rate Limiting
- 🗄️ **قاعدة بيانات**: MongoDB Atlas مع دعم Replica Set
- 🖥️ **واجهة حديثة**: React-like SPA مع دعم كامل للعربية
- 📊 **لوحات تحكم**: Dashboard متقدم مع إحصائيات فورية
- 🚢 **إدارة الأسطول**: CRUD كامل للوسائل البحرية
- 🔧 **الصيانة**: تتبع سجلات الصيانة والتكاليف
- 📈 **الجاهزية**: مؤشرات أداء ونسب جاهزية
- 👤 **المستخدمين**: إدارة المستخدمين والصلاحيات
- 📋 **سجل التدقيق**: تتبع جميع العمليات الحساسة

## 🚀 التشغيل السريع

### باستخدام Docker Compose

```bash
# نسخ متغيرات البيئة
cp .env.example .env

# تعديل .env بكلمات مرور قوية
nano .env

# تشغيل النظام
docker-compose up -d

# إنشاء المستخدم الأول
curl -X POST http://localhost:5000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "YourSecurePassword123!",
    "name": "مدير النظام",
    "email": "admin@system.com"
  }'
