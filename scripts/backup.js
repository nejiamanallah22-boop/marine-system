#!/usr/bin/env node
// scripts/backup.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine-system';

async function createBackup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path.join(backupDir, filename);

        // جمع البيانات
        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        const vessels = await mongoose.connection.db.collection('vessels').find({}).toArray();
        const auditlogs = await mongoose.connection.db.collection('auditlogs').find({}).toArray();

        const data = {
            timestamp: new Date().toISOString(),
            version: '8.0.0',
            users: users,
            vessels: vessels,
            auditlogs: auditlogs
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`✅ Backup created: ${filename}`);
        console.log(`📦 Size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);

        // حذف النسخ القديمة (احتفظ بآخر 30 نسخة)
        const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-'));
        if (files.length > 30) {
            const sorted = files.sort();
            const toDelete = sorted.slice(0, files.length - 30);
            toDelete.forEach(f => {
                fs.unlinkSync(path.join(backupDir, f));
                console.log(`🗑️ Deleted old backup: ${f}`);
            });
        }

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Backup failed:', error);
        process.exit(1);
    }
}

createBackup();
