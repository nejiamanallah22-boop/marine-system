const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

let db;

async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });
  
  // إنشاء الجداول
  await db.exec(`
    -- جدول المستخدمين
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('مسؤول', 'محرر', 'مشاهد')),
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
    
    -- جدول المراكب
    CREATE TABLE IF NOT EXISTS vessels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      number TEXT,
      length REAL,
      category TEXT,
      region TEXT,
      zone TEXT,
      port TEXT,
      supply_place TEXT,
      status TEXT CHECK(status IN ('صالح', 'معطب', 'صيانة')),
      breakdown_type TEXT,
      failure_date DATE,
      end_date DATE,
      reference TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    
    -- جدول سجل الصيانة
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vessel_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT,
      maintenance_date DATE,
      cost REAL,
      technician TEXT,
      next_maintenance_date DATE,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vessel_id) REFERENCES vessels(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    
    -- جدول التذاكر
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'قيد المعالجة',
      priority TEXT DEFAULT 'عادي',
      response TEXT,
      responded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (responded_by) REFERENCES users(id)
    );
    
    -- جدول سجل النشاطات
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    -- جدول الإشعارات
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    -- إنشاء فهارس للسرعة
    CREATE INDEX IF NOT EXISTS idx_vessels_status ON vessels(status);
    CREATE INDEX IF NOT EXISTS idx_vessels_region ON vessels(region);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(created_at);
  `);
  
  // إضافة مستخدمين افتراضيين إذا لم يكن هناك مستخدمين
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  
  if (userCount.count === 0) {
    const hashedPassword1 = await bcrypt.hash('1234', 10);
    const hashedPassword2 = await bcrypt.hash('1234', 10);
    const hashedPassword3 = await bcrypt.hash('1234', 10);
    
    await db.run(
      'INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)',
      ['admin', hashedPassword1, 'مسؤول', 1]
    );
    await db.run(
      'INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)',
      ['editor', hashedPassword2, 'محرر', 1]
    );
    await db.run(
      'INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)',
      ['viewer', hashedPassword3, 'مشاهد', 1]
    );
    
    console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    
    // إضافة مراكب افتراضية
    const defaultVessels = [
      {name: 'البروق 1', number: 'B001', length: 11, category: 'البروق', region: 'الشمال', zone: 'تونس', port: 'تونس', supply_place: 'قاعدة الشمال', status: 'صالح'},
      {name: 'صقر 1', number: 'S001', length: 10, category: 'صقور', region: 'الساحل', zone: 'سوسة', port: 'سوسة', supply_place: 'قاعدة الساحل', status: 'صالح'},
      {name: 'خافرة 1', number: 'K001', length: 20, category: 'خوافر', region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supply_place: 'قاعدة الوسط', status: 'معطب', breakdown_type: 'عطل في المحرك', failure_date: '2025-03-10', end_date: '2025-04-10', reference: 'REF001'},
      {name: 'زورق 1', number: 'Z001', length: 15, category: 'زوارق مزدوجة', region: 'الجنوب', zone: 'جربة', port: 'جربة', supply_place: 'قاعدة الجنوب', status: 'صيانة', breakdown_type: 'صيانة دورية', failure_date: '2025-03-15', end_date: '2025-04-05', reference: 'REF002'},
      {name: 'طوافة 1', number: 'T001', length: 35, category: 'طوافات', region: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supply_place: 'قاعدة الشمال', status: 'صالح'}
    ];
    
    for (const vessel of defaultVessels) {
      await db.run(
        `INSERT INTO vessels (name, number, length, category, region, zone, port, supply_place, status, breakdown_type, failure_date, end_date, reference, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vessel.name, vessel.number, vessel.length, vessel.category, vessel.region, vessel.zone, vessel.port, vessel.supply_place, vessel.status, vessel.breakdown_type, vessel.failure_date, vessel.end_date, vessel.reference, 1]
      );
    }
    
    console.log('✅ تم إنشاء المراكب الافتراضية');
  }
  
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('قاعدة البيانات غير مهيأة');
  }
  return db;
}

module.exports = { initDatabase, getDb };
