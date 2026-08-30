FROM node:20-alpine

WORKDIR /app

# تثبيت الاعتماديات
COPY package*.json ./
RUN npm ci --only=production

# نسخ الكود
COPY . .

# إنشاء الأدلة
RUN mkdir -p logs uploads backups

# المستخدم
RUN addgroup -g 1001 -S marine && adduser -S marine -u 1001
USER marine

EXPOSE 5000

CMD ["node", "server.js"]
