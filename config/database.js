// ============================================================
// 🗄️ database.js
// MARINE SYSTEM - Enterprise MongoDB Manager
// Production Ready - Render + MongoDB Atlas
// ============================================================

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

// ============================================================
// ⚙️ CONFIG
// ============================================================

const CONFIG = Object.freeze({
    mongoUri:
        process.env.MONGODB_URI ||
        process.env.MONGO_URI,

    maxPoolSize:
        Number(process.env.MONGO_MAX_POOL_SIZE) || 20,

    minPoolSize:
        Number(process.env.MONGO_MIN_POOL_SIZE) || 5,

    serverSelectionTimeoutMS: 10000,

    socketTimeoutMS: 45000,

    connectTimeoutMS: 10000,

    heartbeatFrequencyMS: 10000
});

// ============================================================
// 🛡️ DATABASE MANAGER
// ============================================================

class DatabaseManager {

    constructor() {

        this.connection = null;

        this.isConnected = false;

        this.isConnecting = false;

        this.models = {};

        this.indexesCreated = false;
    }

    // ========================================================
    // 🔌 CONNECT
    // ========================================================

    async connect() {

        if (
            this.isConnected &&
            mongoose.connection.readyState === 1
        ) {
            return this;
        }

        if (this.isConnecting) {

            await this.waitForConnection();

            return this;
        }

        if (!CONFIG.mongoUri) {

            throw new Error(
                '❌ MONGODB_URI / MONGO_URI غير موجود في Environment Variables'
            );
        }

        this.isConnecting = true;

        try {

            logger.info(
                '🗄️ Connecting to MongoDB...'
            );

            await mongoose.connect(
                CONFIG.mongoUri,
                {
                    maxPoolSize:
                        CONFIG.maxPoolSize,

                    minPoolSize:
                        CONFIG.minPoolSize,

                    serverSelectionTimeoutMS:
                        CONFIG.serverSelectionTimeoutMS,

                    socketTimeoutMS:
                        CONFIG.socketTimeoutMS,

                    connectTimeoutMS:
                        CONFIG.connectTimeoutMS,

                    heartbeatFrequencyMS:
                        CONFIG.heartbeatFrequencyMS,

                    family: 4,

                    autoIndex:
                        process.env.NODE_ENV !==
                        'production',

                    autoCreate:
                        process.env.NODE_ENV !==
                        'production'
                }
            );

            this.connection =
                mongoose.connection;

            this.isConnected = true;

            this.isConnecting = false;

            // تعريف Models
            this.defineModels();

            // إنشاء Indexes مرة واحدة
            if (!this.indexesCreated) {

                await this.createIndexes();

                this.indexesCreated = true;
            }

            this.setupMonitoring();

            logger.info(
                '✅ MongoDB connected successfully'
            );

            logger.info(
                `🗄️ Database: ${this.connection.name}`
            );

            return this;

        } catch (error) {

            this.isConnecting = false;

            this.isConnected = false;

            logger.error(
                '❌ MongoDB connection failed:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // ⏳ WAIT FOR CONNECTION
    // ========================================================

    async waitForConnection(
        timeout = 15000
    ) {

        const start =
            Date.now();

        while (
            this.isConnecting &&
            Date.now() - start < timeout
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        100
                    )
            );
        }

        if (
            mongoose.connection.readyState !==
            1
        ) {

            throw new Error(
                'MongoDB connection timeout'
            );
        }
    }

    // ========================================================
    // 📦 MODELS
    // ========================================================

    defineModels() {

        // ----------------------------------------------------
        // 👤 USER
        // ----------------------------------------------------

        const userSchema =
            new mongoose.Schema(

                {
                    userId: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true,
                        trim: true
                    },

                    username: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true,
                        trim: true,
                        lowercase: true,
                        minlength: 3,
                        maxlength: 100
                    },

                    email: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true,
                        trim: true,
                        lowercase: true,
                        maxlength: 254
                    },

                    passwordHash: {
                        type: String,
                        required: true,
                        select: false
                    },

                    role: {
                        type: String,

                        enum: [
                            'admin',
                            'manager',
                            'operator',
                            'viewer'
                        ],

                        default: 'viewer',

                        index: true
                    },

                    permissions: {
                        type: [String],
                        default: []
                    },

                    // لا نخزن API Key الأصلي
                    apiKeyHash: {
                        type: String,
                        select: false
                    },

                    preferences: {

                        language: {
                            type: String,
                            default: 'ar'
                        },

                        theme: {
                            type: String,
                            default: 'dark'
                        },

                        notifications: {
                            type: Boolean,
                            default: true
                        }
                    },

                    mfaEnabled: {
                        type: Boolean,
                        default: false
                    },

                    mfaSecret: {
                        type: String,
                        select: false
                    },

                    lastLogin: Date,

                    lastIP: String,

                    failedAttempts: {
                        type: Number,
                        default: 0,
                        min: 0
                    },

                    lockedUntil: Date,

                    isActive: {
                        type: Boolean,
                        default: true,
                        index: true
                    }
                },

                {
                    timestamps: true,

                    versionKey: false
                }
            );

        // ----------------------------------------------------
        // 🚢 VESSEL
        // ----------------------------------------------------

        const vesselSchema =
            new mongoose.Schema(

                {
                    vesselId: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true,
                        trim: true
                    },

                    name: {
                        type: String,
                        required: true,
                        trim: true
                    },

                    type: {
                        type: String,

                        enum: [
                            'fishing',
                            'cargo',
                            'passenger',
                            'military',
                            'other'
                        ],

                        required: true,

                        index: true
                    },

                    status: {
                        type: String,

                        enum: [
                            'ready',
                            'maintenance',
                            'broken',
                            'inactive'
                        ],

                        default: 'ready',

                        index: true
                    },

                    unit: {
                        type: String,
                        trim: true,
                        index: true
                    },

                    engineType: String,

                    engineHours: {
                        type: Number,
                        default: 0,
                        min: 0
                    },

                    operations: {
                        type: Number,
                        default: 0,
                        min: 0
                    },

                    capacity: Number,

                    length: Number,

                    width: Number,

                    draft: Number,

                    manufacturer: String,

                    year: Number,

                    lastMaintenance: Date,

                    nextMaintenance: {
                        type: Date,
                        index: true
                    },

                    registrationNumber: {
                        type: String,
                        trim: true
                    },

                    sensors: {

                        engineTemp: Number,

                        fuelLevel: {
                            type: Number,
                            min: 0,
                            max: 100
                        },

                        oilPressure: Number,

                        vibration: Number
                    },

                    metadata:
                        mongoose.Schema.Types.Mixed
                },

                {
                    timestamps: true,

                    versionKey: false
                }
            );

        // ----------------------------------------------------
        // 🔧 MAINTENANCE
        // ----------------------------------------------------

        const maintenanceSchema =
            new mongoose.Schema(

                {
                    maintenanceId: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true
                    },

                    vesselId: {
                        type: String,
                        required: true,
                        index: true
                    },

                    type: {
                        type: String,

                        enum: [
                            'preventive',
                            'corrective',
                            'predictive',
                            'emergency'
                        ],

                        required: true
                    },

                    status: {
                        type: String,

                        enum: [
                            'pending',
                            'in_progress',
                            'completed',
                            'cancelled'
                        ],

                        default: 'pending',

                        index: true
                    },

                    priority: {
                        type: String,

                        enum: [
                            'low',
                            'medium',
                            'high',
                            'critical'
                        ],

                        default: 'medium',

                        index: true
                    },

                    cost: {
                        type: Number,
                        default: 0,
                        min: 0
                    },

                    parts: [

                        {
                            name: {
                                type: String,
                                required: true
                            },

                            quantity: {
                                type: Number,
                                default: 1,
                                min: 1
                            },

                            cost: {
                                type: Number,
                                default: 0,
                                min: 0
                            }
                        }
                    ],

                    description: String,

                    technician: String,

                    startDate: Date,

                    endDate: Date,

                    scheduledDate: {
                        type: Date,
                        index: true
                    },

                    completionNotes: String
                },

                {
                    timestamps: true,

                    versionKey: false
                }
            );

        // ----------------------------------------------------
        // 🤖 CONVERSATION
        // ----------------------------------------------------

        const conversationSchema =
            new mongoose.Schema(

                {
                    conversationId: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true
                    },

                    userId: {
                        type: String,
                        required: true,
                        index: true
                    },

                    messages: [

                        {
                            role: {
                                type: String,

                                enum: [
                                    'user',
                                    'assistant',
                                    'system'
                                ],

                                required: true
                            },

                            content: {
                                type: String,
                                required: true
                            },

                            timestamp: {
                                type: Date,
                                default: Date.now
                            },

                            tokens: Number,

                            provider: String
                        }
                    ],

                    context:
                        mongoose.Schema.Types.Mixed,

                    summary: String,

                    tags: [String]
                },

                {
                    timestamps: true,

                    versionKey: false
                }
            );

        // ----------------------------------------------------
        // 🔮 PREDICTION
        // ----------------------------------------------------

        const predictionSchema =
            new mongoose.Schema(

                {
                    predictionId: {
                        type: String,
                        required: true,
                        unique: true,
                        index: true
                    },

                    vesselId: {
                        type: String,
                        required: true,
                        index: true
                    },

                    type: {
                        type: String,

                        enum: [
                            'failure',
                            'maintenance',
                            'performance',
                            'cost'
                        ],

                        required: true
                    },

                    confidence: {
                        type: Number,
                        min: 0,
                        max: 1
                    },

                    result: {

                        predictedDate: Date,

                        riskLevel: String,

                        score: Number,

                        details:
                            mongoose.Schema.Types.Mixed
                    },

                    features:
                        mongoose.Schema.Types.Mixed,

                    modelVersion: String,

                    expiresAt: {
                        type: Date,
                        index: true
                    }
                },

                {
                    timestamps: true,

                    versionKey: false
                }
            );

        // TTL index
        predictionSchema.index(
            { expiresAt: 1 },
            {
                expireAfterSeconds: 0
            }
        );

        // ----------------------------------------------------
        // 📜 AUDIT LOG
        // ----------------------------------------------------

        const auditLogSchema =
            new mongoose.Schema(

                {
                    userId: {
                        type: String,
                        index: true
                    },

                    action: {
                        type: String,
                        required: true,
                        index: true
                    },

                    ip: String,

                    userAgent: String,

                    resource: String,

                    resourceId: String,

                    changes:
                        mongoose.Schema.Types.Mixed,

                    result: String,

                    error: String,

                    timestamp: {
                        type: Date,
                        default: Date.now,
                        index: true
                    }
                },

                {
                    capped: {
                        size:
                            50 * 1024 * 1024,

                        max: 100000
                    },

                    versionKey: false
                }
            );

        // ----------------------------------------------------
        // 🛡️ Safe Model Registration
        // ----------------------------------------------------

        this.models.User =
            mongoose.models.User ||
            mongoose.model(
                'User',
                userSchema
            );

        this.models.Vessel =
            mongoose.models.Vessel ||
            mongoose.model(
                'Vessel',
                vesselSchema
            );

        this.models.Maintenance =
            mongoose.models.Maintenance ||
            mongoose.model(
                'Maintenance',
                maintenanceSchema
            );

        this.models.Conversation =
            mongoose.models.Conversation ||
            mongoose.model(
                'Conversation',
                conversationSchema
            );

        this.models.Prediction =
            mongoose.models.Prediction ||
            mongoose.model(
                'Prediction',
                predictionSchema
            );

        this.models.AuditLog =
            mongoose.models.AuditLog ||
            mongoose.model(
                'AuditLog',
                auditLogSchema
            );
    }

    // ========================================================
    // 📊 INDEXES
    // ========================================================

    async createIndexes() {

        if (!this.isConnected) {
            throw new Error(
                'Database not connected'
            );
        }

        if (
            process.env.NODE_ENV ===
            'production'
        ) {

            logger.info(
                '📊 Creating MongoDB indexes...'
            );
        }

        try {

            await Promise.all([

                this.models.User.createIndexes(),

                this.models.Vessel.createIndexes(),

                this.models.Maintenance.createIndexes(),

                this.models.Conversation.createIndexes(),

                this.models.Prediction.createIndexes(),

                this.models.AuditLog.createIndexes()
            ]);

            logger.info(
                '✅ MongoDB indexes ready'
            );

        } catch (error) {

            logger.error(
                '❌ Index creation failed:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // ❤️ MONITORING
    // ========================================================

    setupMonitoring() {

        if (!this.connection) {
            return;
        }

        this.connection.on(
            'connected',
            () => {

                this.isConnected = true;

                logger.info(
                    '🟢 MongoDB connected'
                );
            }
        );

        this.connection.on(
            'disconnected',
            () => {

                this.isConnected = false;

                logger.warn(
                    '🟠 MongoDB disconnected'
                );
            }
        );

        this.connection.on(
            'reconnected',
            () => {

                this.isConnected = true;

                logger.info(
                    '🟢 MongoDB reconnected'
                );
            }
        );

        this.connection.on(
            'error',
            error => {

                logger.error(
                    '🔴 MongoDB error:',
                    error
                );
            }
        );
    }

    // ========================================================
    // 🩺 HEALTH
    // ========================================================

    getHealth() {

        const state =
            mongoose.connection.readyState;

        const states = {

            0: 'disconnected',

            1: 'connected',

            2: 'connecting',

            3: 'disconnecting'
        };

        return {

            connected:
                state === 1,

            state:
                states[state] ||
                'unknown',

            database:
                mongoose.connection.name ||
                null,

            host:
                mongoose.connection.host ||
                null,

            readyState:
                state
        };
    }

    // ========================================================
    // 🔍 MODEL
    // ========================================================

    getModel(name) {

        const Model =
            this.models[name];

        if (!Model) {

            throw new Error(
                `Model "${name}" not found`
            );
        }

        return Model;
    }

    // ========================================================
    // 📊 COUNT
    // ========================================================

    async countDocuments(
        model,
        query = {}
    ) {

        return this
            .getModel(model)
            .countDocuments(query);
    }

    // ========================================================
    // 🔎 FIND ONE
    // ========================================================

    async findOne(
        model,
        query = {},
        options = {}
    ) {

        let request =
            this
                .getModel(model)
                .findOne(query);

        if (options.select) {

            request =
                request.select(
                    options.select
                );
        }

        if (options.lean !== false) {

            request =
                request.lean();
        }

        return request.exec();
    }

    // ========================================================
    // 🔎 FIND
    // ========================================================

    async find(
        model,
        query = {},
        options = {}
    ) {

        let request =
            this
                .getModel(model)
                .find(query);

        if (options.limit) {

            request =
                request.limit(
                    Math.min(
                        Number(options.limit),
                        500
                    )
                );
        }

        if (options.skip) {

            request =
                request.skip(
                    Math.max(
                        Number(options.skip),
                        0
                    )
                );
        }

        if (options.sort) {

            request =
                request.sort(
                    options.sort
                );
        }

        if (options.select) {

            request =
                request.select(
                    options.select
                );
        }

        return request
            .lean()
            .exec();
    }

    // ========================================================
    // ➕ CREATE
    // ========================================================

    async create(
        model,
        data
    ) {

        const Model =
            this.getModel(model);

        return Model.create(data);
    }

    // ========================================================
    // ✏️ UPDATE
    // ========================================================

    async update(
        model,
        query,
        data
    ) {

        const Model =
            this.getModel(model);

        return Model
            .findOneAndUpdate(
                query,
                {
                    $set: data
                },
                {
                    new: true,

                    runValidators: true
                }
            )
            .lean()
            .exec();
    }

    // ========================================================
    // 🗑️ DELETE
    // ========================================================

    async delete(
        model,
        query
    ) {

        const Model =
            this.getModel(model);

        return Model.deleteMany(
            query
        );
    }

    // ========================================================
    // 🔐 API KEY HASH
    // ========================================================

    static hashApiKey(apiKey) {

        return crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');
    }

    // ========================================================
    // 🔌 DISCONNECT
    // ========================================================

    async disconnect() {

        if (
            mongoose.connection
                .readyState !== 0
        ) {

            try {

                await mongoose.disconnect();

                this.connection = null;

                this.isConnected = false;

                this.isConnecting = false;

                logger.info(
                    '🔌 MongoDB disconnected safely'
                );

            } catch (error) {

                logger.error(
                    '❌ MongoDB disconnect error:',
                    error
                );

                throw error;
            }
        }
    }

    // ========================================================
    // 🛑 GRACEFUL SHUTDOWN
    // ========================================================

    async shutdown() {

        logger.info(
            '🛑 Database shutdown started...'
        );

        await this.disconnect();

        logger.info(
            '✅ Database shutdown completed'
        );
    }
}

// ============================================================
// 🌐 SINGLETON
// ============================================================

const database =
    new DatabaseManager();

// ============================================================
// 📤 EXPORT
// ============================================================

module.exports =
    database;
