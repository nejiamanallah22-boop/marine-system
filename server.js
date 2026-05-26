const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ==================== الاتصال بـ MongoDB مباشرة ====================
const uri = "mongodb+srv://marineUser:YOUR_PASSWORD@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح!");
    
    db = client.db("marine_fleet");
    
    // إنشاء المجموعات
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('vessels')) await db.createCollection('vessels');
    if (!collectionNames.includes('users')) await db.createCollection('users');
    if (!collectionNames.includes('tickets')) await db.createCollection('tickets');
    if (!collectionNames.includes('logs')) await db.createCollection('logs');
    
    // إنشاء مستخدم مسؤول
    const adminExists = await db.collection('users').findOne({ name: 'admin' });
    if (!adminExists) {
      const hashedPass = bcrypt.hashSync('admin123', 10);
      await db.collection('users').insertOne({
        name: 'admin',
        pass: hashedPass,
        role: 'مسؤول',
        enabled: true,
        createdAt: new Date()
      });
      console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
    }
    
    return db;
  } catch(err) {
    console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err);
    process.exit(1);
  }
}

// باقي الكود (API Routes)...
// (ضع هنا جميع الـ API Routes من server.js القديم)
