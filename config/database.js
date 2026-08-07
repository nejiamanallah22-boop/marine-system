const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

class DatabaseManager {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.models = {};
    }

    async connect() {
        if (this.isConnected) return this;

        const uri = process.env.MONGODB_URI;
        const options = {
            maxPoolSize: 20,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            family: 4,
            autoIndex: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        };

        try {
            await mongoose.connect(uri, options);
            this.connection = mongoose.connection;
            this.isConnected = true;
            
            // تعريف النماذج
            this.defineModels();
            
            // إنشاء الفهارس
            await this.createIndexes();
            
            logger.info('✅ MongoDB connected successfully');
            
            // مراقبة الاتصال
            this.setupMonitoring();
            
            return this;
        } catch (error) {
            logger.error('❌ MongoDB connection error:', error);
            throw error;
        }
    }

    defineModels() {
        // ===== نموذج المستخدم =====
        this.models.User = mongoose.model('User', new mongoose.Schema({
            userId: { type: String, unique: true, required: true },
            username: { type: String, unique: true, required: true },
            email: { type: String, unique: true, required: true },
            passwordHash: { type: String, required: true },
            salt: { type: String, required: true },
            role: { 
                type: String, 
                enum: ['admin', 'manager', 'operator', 'viewer'],
                default: 'viewer'
            },
            permissions: [String],
            apiKey: { type: String, unique: true },
            apiKeyHash: String,
            preferences: {
                language: { type: String, default: 'ar' },
                theme: { type: String, default: 'dark' },
                notifications: { type: Boolean, default: true }
            },
            mfaEnabled: { type: Boolean, default: false },
            mfaSecret: String,
            lastLogin: Date,
            lastIP: String,
            failedAttempts: { type: Number, default: 0 },
            locked: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }));

        // ===== نموذج المركب =====
        this.models.Vessel = mongoose.model('Vessel', new mongoose.Schema({
            vesselId: { type: String, unique: true, required: true },
            name: { type: String, required: true },
            type: { 
                type: String, 
                enum: ['fishing', 'cargo', 'passenger', 'military', 'other'],
                required: true 
            },
            status: {
                type: String,
                enum: ['ready', 'maintenance', 'broken', 'inactive'],
                default: 'ready'
            },
            unit: String,
            engineType: String,
            engineHours: { type: Number, default: 0 },
            operations: { type: Number, default: 0 },
            capacity: Number,
            length: Number,
            width: Number,
            draft: Number,
            manufacturer: String,
            year: Number,
            lastMaintenance: Date,
            nextMaintenance: Date,
            registrationNumber: String,
            sensors: {
                engineTemp: Number,
                fuelLevel: Number,
                oilPressure: Number,
                vibration: Number
            },
            metadata: mongoose.Schema.Types.Mixed,
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }));

        // ===== نموذج الصيانة =====
        this.models.Maintenance = mongoose.model('Maintenance', new mongoose.Schema({
            maintenanceId: { type: String, unique: true, required: true },
            vesselId: { type: String, required: true },
            type: {
                type: String,
                enum: ['preventive', 'corrective', 'predictive', 'emergency'],
                required: true
            },
            status: {
                type: String,
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                default: 'pending'
            },
            priority: {
                type: String,
                enum: ['low', 'medium', 'high', 'critical'],
                default: 'medium'
            },
            cost: { type: Number, default: 0 },
            parts: [{
                name: String,
                quantity: Number,
                cost: Number
            }],
            description: String,
            technician: String,
            startDate: Date,
            endDate: Date,
            scheduledDate: Date,
            completionNotes: String,
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }));

        // ===== نموذج المحادثة =====
        this.models.Conversation = mongoose.model('Conversation', new mongoose.Schema({
            conversationId: { type: String, unique: true, required: true },
            userId: { type: String, required: true },
            messages: [{
                role: { type: String, enum: ['user', 'assistant', 'system'] },
                content: String,
                timestamp: { type: Date, default: Date.now },
                tokens: Number,
                provider: String
            }],
            context: mongoose.Schema.Types.Mixed,
            summary: String,
            tags: [String],
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }));

        // ===== نموذج التوقع =====
        this.models.Prediction = mongoose.model('Prediction', new mongoose.Schema({
            predictionId: { type: String, unique: true, required: true },
            vesselId: { type: String, required: true },
            type: {
                type: String,
                enum: ['failure', 'maintenance', 'performance', 'cost'],
                required: true
            },
            confidence: { type: Number, min: 0, max: 1 },
            result: {
                predictedDate: Date,
                riskLevel: String,
                score: Number,
                details: mongoose.Schema.Types.Mixed
            },
            features: mongoose.Schema.Types.Mixed,
            modelVersion: String,
            createdAt: { type: Date, default: Date.now },
            expiresAt: Date
        }));

        // ===== نموذج سجل التدقيق =====
        this.models.AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
            userId: String,
            action: String,
            ip: String,
            userAgent: String,
            resource: String,
            resourceId: String,
            changes: mongoose.Schema.Types.Mixed,
            result: String,
            error: String,
            timestamp: { type: Date, default: Date.now }
        }, { capped: 10000 })); // الحد الأقصى 10000 سجل
    }

    async createIndexes() {
        // فهارس المستخدم
        await this.models.User.collection.createIndex({ userId: 1 });
        await this.models.User.collection.createIndex({ username: 1 }, { unique: true });
        await this.models.User.collection.createIndex({ email: 1 }, { unique: true });
        await this.models.User.collection.createIndex({ apiKey: 1 }, { unique: true });
        await this.models.User.collection.createIndex({ role: 1 });

        // فهارس المراكب
        await this.models.Vessel.collection.createIndex({ vesselId: 1 });
        await this.models.Vessel.collection.createIndex({ status: 1 });
        await this.models.Vessel.collection.createIndex({ unit: 1 });
        await this.models.Vessel.collection.createIndex({ type: 1 });

        // فهارس الصيانة
        await this.models.Maintenance.collection.createIndex({ vesselId: 1 });
        await this.models.Maintenance.collection.createIndex({ status: 1 });
        await this.models.Maintenance.collection.createIndex({ startDate: 1 });
        await this.models.Maintenance.collection.createIndex({ endDate: 1 });

        // فهارس المحادثات
        await this.models.Conversation.collection.createIndex({ userId: 1 });
        await this.models.Conversation.collection.createIndex({ createdAt: -1 });

        // فهارس التوقعات
        await this.models.Prediction.collection.createIndex({ vesselId: 1 });
        await this.models.Prediction.collection.createIndex({ type: 1 });
        await this.models.Prediction.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

        // فهارس سجل التدقيق
        await this.models.AuditLog.collection.createIndex({ userId: 1 });
        await this.models.AuditLog.collection.createIndex({ timestamp: -1 });
        await this.models.AuditLog.collection.createIndex({ action: 1 });
    }

    setupMonitoring() {
        mongoose.connection.on('disconnected', () => {
            this.isConnected = false;
            logger.warn('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            this.isConnected = true;
            logger.info('✅ MongoDB reconnected');
        });

        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB error:', error);
        });
    }

    async disconnect() {
        if (this.isConnected) {
            await mongoose.disconnect();
            this.isConnected = false;
            logger.info('MongoDB disconnected');
        }
    }

    // ====== دوال مساعدة ======

    async getCollection(collectionName) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        return this.connection.collection(collectionName);
    }

    async countDocuments(model, query = {}) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        return await Model.countDocuments(query);
    }

    async findOne(model, query = {}, options = {}) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        return await Model.findOne(query, options);
    }

    async find(model, query = {}, options = {}) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        let result = Model.find(query);
        if (options.limit) result = result.limit(options.limit);
        if (options.skip) result = result.skip(options.skip);
        if (options.sort) result = result.sort(options.sort);
        if (options.select) result = result.select(options.select);
        return await result.lean();
    }

    async create(model, data) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        const doc = new Model(data);
        return await doc.save();
    }

    async update(model, query, data) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        data.updatedAt = new Date();
        return await Model.findOneAndUpdate(query, data, { new: true });
    }

    async delete(model, query) {
        const Model = this.models[model];
        if (!Model) throw new Error(`Model ${model} not found`);
        return await Model.deleteMany(query);
    }
}

module.exports = new DatabaseManager();
