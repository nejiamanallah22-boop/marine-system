// ============================================
// MARINE TRACKING SYSTEM V20
// Enterprise-Grade - Production Ready - Zero Downtime
// Complete Production Code
// ============================================

require('dotenv').config();

// ==================== CORE IMPORTS ====================
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// ==================== AUTH & SECURITY ====================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// ==================== ENTERPRISE TOOLS ====================
const Redis = require('ioredis');
const winston = require('winston');
require('winston-daily-rotate-file');
const promClient = require('prom-client');
const { Queue, Worker, QueueScheduler } = require('bullmq');
const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const Joi = require('joi');
const _ = require('lodash');
const moment = require('moment-timezone');
const geolib = require('geolib');
const NodeCache = require('node-cache');
const { Parser } = require('json2csv');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const WebPush = require('web-push');
const cronParser = require('cron-parser');
const fs = require('fs').promises;
const path = require('path');

// ==================== APP INIT ====================
const app = express();
const server = http.createServer(app);

// ==================== CONFIGURATION ====================
const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 5000,
  version: '20.0.0',

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExp: '15m',
    refreshExp: '7d',
    issuer: 'marine-v20',
    audience: 'marine-client'
  },

  mongodb: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 200,
      minPoolSize: 20,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
      heartbeatFrequencyMS: 10000
    }
  },

  redis: {
    url: process.env.REDIS_URL,
    options: {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      lazyConnect: false
    }
  },

  rateLimit: {
    global: { points: 1000, duration: 60, blockDuration: 60 },
    login: { points: 5, duration: 900, blockDuration: 900 },
    api: { points: 100, duration: 60 },
    location: { points: 60, duration: 60 },
    export: { points: 10, duration: 3600 }
  },

  queue: {
    batchSize: 500,
    batchDelayMs: 1000,
    concurrency: 20,
    maxRetries: 5,
    retryDelay: 5000,
    maxBufferSize: 10000,
    maxFailedBatch: 1000
  },

  cache: {
    ttl: { user: 300, vessel: 60, location: 30, stats: 60 },
    maxKeys: 100000
  },

  notifications: {
    email: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    },
    sms: {
      accountSid: process.env.TWILIO_SID,
      authToken: process.env.TWILIO_TOKEN,
      from: process.env.TWILIO_FROM
    },
    push: {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    }
  },

  geofencing: { enabled: true, maxZonesPerVessel: 50, checkInterval: 60000 },
  analytics: { retentionDays: 90, aggregationInterval: 3600000 },
  upload: { maxSize: 50 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'], destination: './uploads' }
};

// ==================== LOGGER ====================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
    winston.format.json()
  ),
  defaultMeta: { service: 'marine-api', version: config.version },
  transports: [
    new winston.transports.DailyRotateFile({ filename: 'logs/error-%DATE%.log', datePattern: 'YYYY-MM-DD', level: 'error', maxSize: '50m', maxFiles: '30d', zippedArchive: true }),
    new winston.transports.DailyRotateFile({ filename: 'logs/combined-%DATE%.log', datePattern: 'YYYY-MM-DD', maxSize: '50m', maxFiles: '30d', zippedArchive: true }),
    new winston.transports.DailyRotateFile({ filename: 'logs/audit-%DATE%.log', datePattern: 'YYYY-MM-DD', level: 'info', maxSize: '50m', maxFiles: '90d', zippedArchive: true }),
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })
  ]
});

// ==================== PROMETHEUS METRICS ====================
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestsTotal = new promClient.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status', 'service'], registers: [register] });
const httpRequestDuration = new promClient.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'], buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [register] });
const activeVessels = new promClient.Gauge({ name: 'active_vessels', help: 'Currently active vessels', registers: [register] });
const activeConnections = new promClient.Gauge({ name: 'active_connections', help: 'Active WebSocket connections', registers: [register] });
const queueSize = new promClient.Gauge({ name: 'location_queue_size', help: 'Pending locations in queue', registers: [register] });
const databaseConnections = new promClient.Gauge({ name: 'database_connections', help: 'Active database connections', registers: [register] });
const cacheHitRate = new promClient.Counter({ name: 'cache_hit_rate_total', help: 'Cache hit rate', labelNames: ['type'], registers: [register] });

// ==================== CONNECTIONS ====================
let redis = null;
let redisAvailable = false;

async function initRedis() {
  try {
    redis = new Redis(config.redis.url, config.redis.options);
    await redis.ping();
    redisAvailable = true;
    logger.info('✅ Redis connected');
    return true;
  } catch (err) {
    logger.error('❌ Redis connection failed:', err.message);
    redisAvailable = false;
    if (config.env === 'production') throw err;
    return false;
  }
}

async function initMongo() {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    logger.info('✅ MongoDB connected');
    mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    setInterval(() => databaseConnections.set(mongoose.connections.length), 10000);
    return true;
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err);
    if (config.env === 'production') throw err;
    return false;
  }
}

// ==================== DATABASE SCHEMAS ====================
const UserSchema = new mongoose.Schema({
  _id: { type: String, default: () => `usr_${uuidv4()}` },
  email: { type: String, required: true, unique: true, index: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['super_admin', 'admin', 'operator', 'viewer', 'client'], default: 'operator' },
  permissions: [{ type: String, index: true }],
  phone: { type: String, index: true },
  avatar: String, timezone: { type: String, default: 'UTC' }, language: { type: String, default: 'en' },
  isActive: { type: Boolean, default: true, index: true },
  lastLogin: Date, lastLoginIP: String, lastSessionId: String, lastFingerprint: String,
  tokenVersion: { type: Number, default: 0 }, refreshTokenHash: String,
  mfaEnabled: { type: Boolean, default: false }, mfaSecret: String, mfaBackupCodes: [String],
  failedAttempts: { type: Number, default: 0 }, lockedUntil: Date,
  notificationPreferences: { email: { type: Boolean, default: true }, sms: { type: Boolean, default: false }, push: { type: Boolean, default: true }, alerts: { type: Boolean, default: true }, reports: { type: Boolean, default: true } },
  organizationId: { type: String, index: true }, department: String, position: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

UserSchema.pre('save', async function(next) { if (!this.isModified('password')) return next(); this.password = await bcrypt.hash(this.password, 12); next(); });
UserSchema.methods.comparePassword = async function(candidate) { return bcrypt.compare(candidate, this.password); };
UserSchema.methods.generateMFA = function() { const secret = speakeasy.generateSecret({ length: 20 }); this.mfaSecret = secret.base32; return secret; };
UserSchema.methods.verifyMFA = function(token) { return speakeasy.totp.verify({ secret: this.mfaSecret, encoding: 'base32', token }); };

const VesselSchema = new mongoose.Schema({
  _id: { type: String, default: () => `ves_${uuidv4()}` }, name: { type: String, required: true, index: true },
  imo: { type: String, unique: true, sparse: true, index: true }, mmsi: { type: String, unique: true, sparse: true, index: true }, callsign: String,
  type: { type: String, enum: ['fishing', 'cargo', 'tanker', 'passenger', 'service', 'patrol', 'research', 'tug'], index: true },
  status: { type: String, enum: ['active', 'maintenance', 'idle', 'offline', 'emergency', 'decommissioned'], default: 'active', index: true },
  ownerId: { type: String, ref: 'User', required: true, index: true },
  specifications: { length: Number, width: Number, draft: Number, tonnage: Number, enginePower: Number, maxSpeed: Number, cruisingSpeed: Number, fuelCapacity: Number, freshWaterCapacity: Number, crewCapacity: Number, buildYear: Number, flag: String, homePort: String, registrationPort: String, owner: String, manager: String, insurer: String },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
  lastSeen: { type: Date, index: true }, heading: Number, speed: Number, destination: String, eta: Date,
  tracking: { enabled: { type: Boolean, default: true }, interval: { type: Number, default: 60 }, accuracy: { type: Number, default: 10 }, historyDays: { type: Number, default: 30 } },
  geofence: { enabled: { type: Boolean, default: false }, zones: [{ name: String, type: { type: String, enum: ['circle', 'polygon', 'rectangle'] }, coordinates: mongoose.Schema.Types.Mixed, radius: Number, alertOnEntry: { type: Boolean, default: true }, alertOnExit: { type: Boolean, default: true }, alerts: [{ type: String }] }], activeAlerts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alert' }] },
  maintenance: { lastService: Date, nextService: Date, serviceInterval: Number, tasks: [{ type: String, description: String, dueDate: Date, completed: Boolean, completedAt: Date }] },
  documents: [{ type: String, name: String, url: String, expiryDate: Date, uploadedBy: String, uploadedAt: Date }],
  devices: [{ id: String, type: String, model: String, firmware: String, lastPing: Date, battery: Number, status: String }],
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

VesselSchema.index({ location: '2dsphere' });
VesselSchema.index({ ownerId: 1, status: 1 });
VesselSchema.index({ status: 1, location: '2dsphere' });
VesselSchema.index({ ownerId: 1, lastSeen: -1 });
VesselSchema.index({ type: 1, status: 1 });
VesselSchema.index({ 'specifications.flag': 1 });
VesselSchema.index({ mmsi: 1, imo: 1 });
VesselSchema.index({ destination: 1, eta: 1 });

const LocationSchema = new mongoose.Schema({
  _id: { type: String, default: () => `loc_${uuidv4()}` }, vesselId: { type: String, ref: 'Vessel', required: true, index: true }, userId: { type: String, ref: 'User', required: true },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
  speed: { type: Number, default: 0, index: true }, heading: { type: Number, default: 0 }, accuracy: { type: Number, default: 0 }, altitude: Number, depth: Number, waterTemperature: Number, airTemperature: Number, windSpeed: Number, windDirection: Number,
  satCount: Number, battery: Number, signalStrength: Number,
  events: [{ type: String, description: String, severity: String }],
  timestamp: { type: Date, default: Date.now, index: true }, processedAt: Date, metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

LocationSchema.index({ location: '2dsphere' });
LocationSchema.index({ vesselId: 1, timestamp: -1 });
LocationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });
LocationSchema.index({ vesselId: 1, speed: 1, timestamp: -1 });
LocationSchema.index({ userId: 1, timestamp: -1 });

const AlertSchema = new mongoose.Schema({
  _id: { type: String, default: () => `alt_${uuidv4()}` }, vesselId: { type: String, ref: 'Vessel', required: true, index: true }, userId: { type: String, ref: 'User' },
  type: { type: String, enum: ['geofence', 'speed', 'engine', 'sos', 'maintenance', 'weather', 'collision', 'grounding', 'fire', 'man_overboard'], required: true, index: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
  status: { type: String, enum: ['active', 'acknowledged', 'resolved', 'false_alarm'], default: 'active', index: true },
  message: String, description: String, location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] }, data: mongoose.Schema.Types.Mixed,
  acknowledgedAt: Date, acknowledgedBy: String, resolvedAt: Date, resolvedBy: String, resolution: String,
  notifications: [{ channel: String, sentAt: Date, status: String }]
}, { timestamps: true });

AlertSchema.index({ vesselId: 1, status: 1, createdAt: -1 });
AlertSchema.index({ type: 1, severity: 1, status: 1 });
AlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const TicketSchema = new mongoose.Schema({
  _id: { type: String, default: () => `tkt_${uuidv4()}` }, number: { type: String, unique: true }, title: { type: String, required: true }, description: { type: String, required: true },
  status: { type: String, enum: ['new', 'open', 'in_progress', 'pending', 'resolved', 'closed'], default: 'new', index: true },
  priority: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium', index: true },
  category: String, subcategory: String, createdBy: { type: String, ref: 'User', required: true, index: true }, assignedTo: { type: String, ref: 'User', index: true }, assignedGroup: String,
  comments: [{ message: String, userId: { type: String, ref: 'User' }, attachments: [String], isInternal: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } }],
  attachments: [{ name: String, url: String, type: String, size: Number, uploadedBy: String, uploadedAt: Date }],
  auditLog: [{ action: String, userId: { type: String, ref: 'User' }, changes: mongoose.Schema.Types.Mixed, timestamp: { type: Date, default: Date.now } }],
  sla: { responseTime: Number, resolutionTime: Number, breached: { type: Boolean, default: false }, respondedAt: Date, resolvedAt: Date },
  satisfaction: { rating: { type: Number, min: 1, max: 5 }, comment: String, ratedAt: Date },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

TicketSchema.pre('save', async function(next) { if (!this.number) { const year = new Date().getFullYear(); const count = await mongoose.model('Ticket').countDocuments(); this.number = `TKT-${year}-${String(count + 1).padStart(6, '0')}`; } next(); });
TicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({ number: 1 });
TicketSchema.index({ createdBy: 1, createdAt: -1 });

const AuditLogSchema = new mongoose.Schema({
  _id: { type: String, default: () => `aud_${uuidv4()}` }, action: { type: String, required: true, index: true }, userId: { type: String, ref: 'User', index: true },
  targetId: String, targetType: String, changes: mongoose.Schema.Types.Mixed, ip: String, userAgent: String, requestId: String, duration: Number,
  timestamp: { type: Date, default: Date.now, index: true }
});

AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ targetId: 1, targetType: 1 });
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

const AnalyticsSchema = new mongoose.Schema({
  _id: { type: String, default: () => `ana_${uuidv4()}` }, type: { type: String, enum: ['vessel', 'location', 'alert', 'performance', 'user'], required: true, index: true },
  vesselId: { type: String, ref: 'Vessel', index: true }, userId: { type: String, ref: 'User', index: true },
  metrics: { distance: Number, fuelConsumption: Number, engineHours: Number, alerts: Number, avgSpeed: Number, maxSpeed: Number, idleTime: Number, workingTime: Number },
  interval: { start: { type: Date, required: true }, end: { type: Date, required: true } },
  aggregated: mongoose.Schema.Types.Mixed, metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

AnalyticsSchema.index({ type: 1, interval: { start: 1, end: 1 } });
AnalyticsSchema.index({ vesselId: 1, 'interval.start': -1 });

const ReportSchema = new mongoose.Schema({
  _id: { type: String, default: () => `rpt_${uuidv4()}` }, name: { type: String, required: true },
  type: { type: String, enum: ['vessel_activity', 'alert_summary', 'performance', 'maintenance', 'custom'], required: true },
  format: { type: String, enum: ['pdf', 'csv', 'excel', 'json'], default: 'pdf' },
  parameters: mongoose.Schema.Types.Mixed, data: mongoose.Schema.Types.Mixed,
  generatedBy: { type: String, ref: 'User', required: true }, generatedAt: { type: Date, default: Date.now }, url: String, size: Number,
  schedule: { enabled: Boolean, cron: String, recipients: [String], lastRun: Date, nextRun: Date }
});

ReportSchema.index({ generatedBy: 1, generatedAt: -1 });
ReportSchema.index({ type: 1, generatedAt: -1 });

const WebhookSchema = new mongoose.Schema({
  _id: { type: String, default: () => `whk_${uuidv4()}` }, name: { type: String, required: true }, url: { type: String, required: true }, secret: String,
  events: [{ type: String, required: true }], isActive: { type: Boolean, default: true },
  retryCount: { type: Number, default: 3 }, timeout: { type: Number, default: 5000 },
  lastTriggered: Date, lastSuccess: Date, lastError: String, createdBy: { type: String, ref: 'User' }
}, { timestamps: true });

WebhookSchema.index({ events: 1, isActive: 1 });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Location = mongoose.model('Location', LocationSchema);
const Alert = mongoose.model('Alert', AlertSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const Analytics = mongoose.model('Analytics', AnalyticsSchema);
const Report = mongoose.model('Report', ReportSchema);
const Webhook = mongoose.model('Webhook', WebhookSchema);

// ==================== VALIDATION SCHEMAS ====================
const validation = {
  login: Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(6).required(), mfaToken: Joi.string().length(6).optional() }),
  vessel: Joi.object({ name: Joi.string().min(2).max(100).required(), imo: Joi.string().pattern(/^\d{7}$/).optional(), mmsi: Joi.string().pattern(/^\d{9}$/).optional(), type: Joi.string().valid('fishing', 'cargo', 'tanker', 'passenger', 'service', 'patrol', 'research', 'tug').required(), specifications: Joi.object({ length: Joi.number().positive().optional(), width: Joi.number().positive().optional(), draft: Joi.number().positive().optional(), tonnage: Joi.number().positive().optional(), flag: Joi.string().optional(), homePort: Joi.string().optional() }).optional() }),
  location: Joi.object({ vesselId: Joi.string().required(), lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required(), speed: Joi.number().min(0).max(100).optional(), heading: Joi.number().min(0).max(359).optional(), accuracy: Joi.number().min(0).optional(), altitude: Joi.number().optional(), satCount: Joi.number().min(0).max(30).optional(), battery: Joi.number().min(0).max(100).optional(), events: Joi.array().optional() }),
  ticket: Joi.object({ title: Joi.string().min(3).max(200).required(), description: Joi.string().min(10).max(10000).required(), priority: Joi.string().valid('critical', 'high', 'medium', 'low').default('medium'), category: Joi.string().optional(), attachments: Joi.array().optional() }),
  geofence: Joi.object({ name: Joi.string().required(), type: Joi.string().valid('circle', 'polygon', 'rectangle').required(), coordinates: Joi.alternatives().try(Joi.object({ lat: Joi.number(), lng: Joi.number(), radius: Joi.number() }), Joi.array().items(Joi.object({ lat: Joi.number(), lng: Joi.number() })), Joi.object({ minLat: Joi.number(), maxLat: Joi.number(), minLng: Joi.number(), maxLng: Joi.number() })).required(), alertOnEntry: Joi.boolean().default(true), alertOnExit: Joi.boolean().default(true) }),
  webhook: Joi.object({ name: Joi.string().required(), url: Joi.string().uri().required(), events: Joi.array().items(Joi.string()).min(1).required(), retryCount: Joi.number().min(1).max(10).default(3), timeout: Joi.number().min(1000).max(30000).default(5000) })
};

// ==================== RATE LIMITERS ====================
let rateLimiters = {};

async function initRateLimiters() {
  if (redisAvailable) {
    rateLimiters = {
      global: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:global', ...config.rateLimit.global }),
      login: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:login', ...config.rateLimit.login }),
      api: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:api', ...config.rateLimit.api }),
      location: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:location', ...config.rateLimit.location }),
      export: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl:export', ...config.rateLimit.export })
    };
  } else {
    rateLimiters = {
      global: new RateLimiterMemory(config.rateLimit.global), login: new RateLimiterMemory(config.rateLimit.login),
      api: new RateLimiterMemory(config.rateLimit.api), location: new RateLimiterMemory(config.rateLimit.location), export: new RateLimiterMemory(config.rateLimit.export)
    };
  }
  logger.info('✅ Rate limiters initialized');
}

async function rateLimitMiddleware(req, res, next) {
  try { const key = `${req.ip}:${req.path}`; await rateLimiters.api.consume(key); next(); }
  catch { httpRequestsTotal.labels(req.method, req.path, 429, 'api').inc(); res.status(429).json({ error: 'Too many requests', retryAfter: 60 }); }
}

// ==================== QUEUE SYSTEM ====================
let locationQueue = null, locationWorker = null, queueScheduler = null, notificationQueue = null, analyticsQueue = null;

class LocationBatcher {
  constructor() {
    this.batch = []; this.timer = null; this.flushing = false; this.failedBatch = []; this.MAX_BUFFER_SIZE = config.queue.maxBufferSize; this.FAILED_BATCH_MAX = config.queue.maxFailedBatch;
  }
  async add(location) {
    if (this.batch.length >= this.MAX_BUFFER_SIZE) { logger.warn('Buffer full, forcing flush'); await this.flush(); }
    this.batch.push(location);
    if (this.timer) clearTimeout(this.timer);
    if (this.batch.length >= config.queue.batchSize) { await this.flush(); }
    else { this.timer = setTimeout(() => this.flush(), config.queue.batchDelayMs); }
  }
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (this.failedBatch.length > 0) await this.processFailedBatch();
      if (this.batch.length === 0) { this.flushing = false; return; }
      const toSave = [...this.batch]; this.batch = [];
      try { await locationQueue.add('batch', { locations: toSave }, { attempts: config.queue.maxRetries, backoff: { type: 'exponential', delay: config.queue.retryDelay } }); logger.debug(`Queued ${toSave.length} locations`); }
      catch (err) { logger.error('Queue failed:', err); this.addToFailedBatch(toSave); }
    } finally { this.flushing = false; }
  }
  addToFailedBatch(locations) { if (this.failedBatch.length >= this.FAILED_BATCH_MAX) this.saveToEmergencyFile(this.failedBatch.shift()); this.failedBatch.push(...locations); }
  async processFailedBatch() { const toProcess = [...this.failedBatch]; this.failedBatch = []; try { await locationQueue.add('batch', { locations: toProcess, isRetry: true }, { attempts: 1, priority: 1 }); logger.info(`Processed ${toProcess.length} failed locations`); } catch (err) { logger.error('Failed batch processing error:', err); this.failedBatch.push(...toProcess.slice(0, 100)); this.saveToEmergencyFile(toProcess.slice(100)); } }
  async saveToEmergencyFile(locations) { const emergencyFile = path.join(__dirname, 'emergency_locations.json'); try { let existing = []; if (await fs.access(emergencyFile).then(() => true).catch(() => false)) { const data = await fs.readFile(emergencyFile, 'utf8'); existing = JSON.parse(data); } existing.push(...locations); if (existing.length > 10000) existing = existing.slice(-10000); await fs.writeFile(emergencyFile, JSON.stringify(existing)); logger.warn(`Saved ${locations.length} locations to emergency file`); } catch (err) { logger.error('Failed to save emergency file:', err); } }
}

const batcher = new LocationBatcher();

async function initQueue() {
  if (!redisAvailable) return false;
  queueScheduler = new QueueScheduler('locations', { connection: redis });
  locationQueue = new Queue('locations', { connection: redis, defaultJobOptions: { attempts: config.queue.maxRetries, backoff: { type: 'exponential', delay: config.queue.retryDelay }, removeOnComplete: { age: 3600, count: 1000 }, removeOnFail: { age: 86400, count: 5000 } } });
  notificationQueue = new Queue('notifications', { connection: redis });
  analyticsQueue = new Queue('analytics', { connection: redis });
  locationWorker = new Worker('locations', async (job) => { const { locations } = job.data; await Location.insertMany(locations, { ordered: false }); logger.info(`Saved ${locations.length} locations`); queueSize.dec(); await analyticsQueue.add('process', { locations }); }, { connection: redis, concurrency: config.queue.concurrency, limiter: { max: 500, duration: 1000 } });
  locationWorker.on('completed', (job) => logger.debug(`Job ${job.id} completed`));
  locationWorker.on('failed', (job, err) => logger.error(`Job ${job.id} failed:`, err));
  new Worker('analytics', async (job) => { const { locations } = job.data; for (const loc of locations) await processAnalytics(loc); }, { connection: redis });
  new Worker('notifications', async (job) => { const { type, recipients, data } = job.data; await sendNotifications(type, recipients, data); }, { connection: redis });
  setInterval(async () => { const counts = await locationQueue.getJobCounts(); queueSize.set(counts.waiting || 0); }, 10000);
  logger.info('✅ Queue system initialized');
  return true;
}

// ==================== ANALYTICS SERVICE ====================
async function processAnalytics(location) {
  try {
    const dayStart = moment().startOf('day').toDate();
    const weekStart = moment().startOf('week').toDate();
    const monthStart = moment().startOf('month').toDate();
    const intervals = [{ start: dayStart, end: new Date(), type: 'daily' }, { start: weekStart, end: new Date(), type: 'weekly' }, { start: monthStart, end: new Date(), type: 'monthly' }];
    for (const interval of intervals) {
      await Analytics.updateOne({ vesselId: location.vesselId, type: 'vessel', 'interval.start': interval.start, 'interval.end': interval.end }, { $inc: { 'metrics.distance': location.speed || 0, 'metrics.fuelConsumption': (location.speed || 0) * 0.2, 'metrics.engineHours': 1 }, $max: { 'metrics.maxSpeed': location.speed || 0 }, $set: { 'interval.end': new Date() } }, { upsert: true });
    }
  } catch (err) { logger.error('Analytics processing error:', err); }
}

// ==================== CACHE SERVICE ====================
class CacheService {
  constructor(redisClient) { this.redis = redisClient; this.memoryCache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: config.cache.maxKeys }); this.prefix = 'cache:'; }
  async get(key, useMemory = true) {
    if (useMemory) { const memValue = this.memoryCache.get(key); if (memValue) { cacheHitRate.labels('memory').inc(); return memValue; } }
    if (this.redis) { try { const data = await this.redis.get(`${this.prefix}${key}`); if (data) { cacheHitRate.labels('redis').inc(); return JSON.parse(data); } } catch (err) { logger.error('Cache get error:', err); } }
    cacheHitRate.labels('miss').inc(); return null;
  }
  async set(key, value, ttl = 300, useMemory = true) { if (useMemory) this.memoryCache.set(key, value, ttl); if (this.redis) { try { await this.redis.setex(`${this.prefix}${key}`, ttl, JSON.stringify(value)); } catch (err) { logger.error('Cache set error:', err); } } }
  async del(key) { this.memoryCache.del(key); if (this.redis) { try { await this.redis.del(`${this.prefix}${key}`); } catch (err) { logger.error('Cache del error:', err); } } }
  async delPattern(pattern) { if (this.redis) { try { const keys = await this.redis.keys(`${this.prefix}${pattern}`); if (keys.length) await this.redis.del(...keys); } catch (err) { logger.error('Cache delPattern error:', err); } } }
}

let cache = null;

// ==================== NOTIFICATION SERVICE ====================
let emailTransporter = null, twilioClient = null;

async function initNotifications() {
  if (config.notifications.email.host) { emailTransporter = nodemailer.createTransport(config.notifications.email); logger.info('✅ Email service initialized'); }
  if (config.notifications.sms.accountSid) { twilioClient = twilio(config.notifications.sms.accountSid, config.notifications.sms.authToken); logger.info('✅ SMS service initialized'); }
  if (config.notifications.push.publicKey) { WebPush.setVapidDetails('mailto:admin@marine.com', config.notifications.push.publicKey, config.notifications.push.privateKey); logger.info('✅ Push notification service initialized'); }
}

async function sendEmail(to, subject, html, attachments = []) {
  if (!emailTransporter) return false;
  try { await emailTransporter.sendMail({ from: `Marine System <${config.notifications.email.auth.user}>`, to, subject, html, attachments }); return true; }
  catch (err) { logger.error('Email send error:', err); return false; }
}

async function sendSMS(to, message) {
  if (!twilioClient) return false;
  try { await twilioClient.messages.create({ body: message, to, from: config.notifications.sms.from }); return true; }
  catch (err) { logger.error('SMS send error:', err); return false; }
}

async function sendPushNotification(subscription, payload) {
  try { await WebPush.sendNotification(subscription, JSON.stringify(payload)); return true; }
  catch (err) { logger.error('Push notification error:', err); return false; }
}

async function sendNotifications(type, recipients, data) {
  if (!recipients) return;
  const promises = [];
  if (recipients.email && data.email) promises.push(sendEmail(recipients.email, data.subject, data.html).catch(err => logger.error(`Email notification failed: ${err.message}`)));
  if (recipients.sms && data.sms) promises.push(sendSMS(recipients.sms, data.sms).catch(err => logger.error(`SMS notification failed: ${err.message}`)));
  if (recipients.push && data.push) promises.push(sendPushNotification(recipients.push, data.push).catch(err => logger.error(`Push notification failed: ${err.message}`)));
  await Promise.allSettled(promises);
}

// ==================== TOKEN SERVICE ====================
class TokenService {
  constructor(redisClient) { this.redis = redisClient; this.prefix = 'token:'; }
  async revoke(jti, expiresIn) { const ttl = Math.max(Math.floor(expiresIn / 1000), 60); await this.redis.setex(`${this.prefix}${jti}`, ttl, 'revoked'); }
  async isRevoked(jti) { return await this.redis.get(`${this.prefix}${jti}`) !== null; }
}

let tokenService = null;

// ==================== AUTH SERVICE ====================
class AuthService {
  constructor(tokenService, cache) { this.tokenService = tokenService; this.cache = cache; }
  async login(email, password, mfaToken, ip, userAgent) {
    await validation.login.validateAsync({ email, password, mfaToken });
    const user = await User.findOne({ email });
    if (!user) throw new Error('Invalid credentials');
    if (!user.isActive) throw new Error('Account disabled');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error(`Account locked until ${user.lockedUntil}`);
    const valid = await user.comparePassword(password);
    if (!valid) { user.failedAttempts += 1; if (user.failedAttempts >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); await user.save(); throw new Error('Invalid credentials'); }
    if (user.mfaEnabled) { if (!mfaToken) throw new Error('MFA token required'); const verified = user.verifyMFA(mfaToken); if (!verified) throw new Error('Invalid MFA token'); }
    user.failedAttempts = 0; user.lockedUntil = null;
    const sessionId = uuidv4(); const fingerprint = crypto.createHash('sha256').update(`${userAgent}|${ip}`).digest('hex').substring(0, 32); const jti = uuidv4();
    const payload = { sub: user._id, email: user.email, role: user.role, name: user.name, permissions: user.permissions, sessionId, fingerprint, jti, version: user.tokenVersion, iss: config.jwt.issuer, aud: config.jwt.audience };
    const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExp });
    const refreshToken = jwt.sign({ sub: user._id, version: user.tokenVersion }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExp });
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.refreshTokenHash = refreshHash; user.lastLogin = new Date(); user.lastLoginIP = ip; user.lastSessionId = sessionId; user.lastFingerprint = fingerprint;
    await user.save();
    await this.cache.del(`user:${user._id}`);
    await AuditLog.create({ action: 'auth.login', userId: user._id, ip, userAgent, timestamp: new Date() });
    return { accessToken, refreshToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, mfaEnabled: user.mfaEnabled } };
  }
  async setupMFA(userId) { const user = await User.findById(userId); if (!user) throw new Error('User not found'); const secret = user.generateMFA(); await user.save(); const otpauth = speakeasy.otpauthURL({ secret: secret.base32, label: `Marine System: ${user.email}`, issuer: 'MarineTracker' }); const qrCode = await QRCode.toDataURL(otpauth); return { secret: secret.base32, qrCode }; }
  async verifyMFA(userId, token) { const user = await User.findById(userId); if (!user) throw new Error('User not found'); const verified = user.verifyMFA(token); if (verified) { user.mfaEnabled = true; await user.save(); } return verified; }
  async refresh(refreshToken, ip, userAgent) {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, { issuer: config.jwt.issuer, audience: config.jwt.audience });
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) throw new Error('User not found');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    if (user.refreshTokenHash !== hash) throw new Error('Invalid refresh token');
    if (user.tokenVersion !== decoded.version) throw new Error('Token version mismatch');
    const sessionId = uuidv4(); const fingerprint = crypto.createHash('sha256').update(`${userAgent}|${ip}`).digest('hex').substring(0, 32); const jti = uuidv4();
    const payload = { sub: user._id, email: user.email, role: user.role, name: user.name, permissions: user.permissions, sessionId, fingerprint, jti, version: user.tokenVersion, iss: config.jwt.issuer, aud: config.jwt.audience };
    const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExp });
    const newRefreshToken = jwt.sign({ sub: user._id, version: user.tokenVersion }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExp });
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    user.refreshTokenHash = newRefreshHash; user.lastSessionId = sessionId; user.lastFingerprint = fingerprint;
    await user.save();
    await this.tokenService.revoke(decoded.jti, 900000);
    return { accessToken, refreshToken: newRefreshToken };
  }
}

// ==================== VESSEL SERVICE ====================
class VesselService {
  constructor(cache) { this.cache = cache; }
  async create(data, userId, ip, userAgent) { const validated = await validation.vessel.validateAsync(data); const vessel = await Vessel.create({ ...validated, ownerId: userId }); await AuditLog.create({ action: 'vessel.create', userId, targetId: vessel._id, targetType: 'vessel', changes: validated, ip, userAgent }); await this.cache.delPattern(`vessels:${userId}:*`); return vessel; }
  async update(id, data, userId, role, ip, userAgent) { const vessel = await Vessel.findById(id); if (!vessel) throw new Error('Vessel not found'); if (vessel.ownerId !== userId && !['super_admin', 'admin'].includes(role)) throw new Error('Forbidden'); const oldData = vessel.toObject(); Object.assign(vessel, data); vessel.updatedAt = new Date(); await vessel.save(); await AuditLog.create({ action: 'vessel.update', userId, targetId: id, targetType: 'vessel', changes: { old: oldData, new: data }, ip, userAgent }); await this.cache.del(`vessel:${id}`); await this.cache.delPattern(`vessels:${userId}:*`); await triggerWebhooks('vessel.updated', { vesselId: id, changes: data }); return vessel; }
  async getById(id, userId, role) { const cached = await this.cache.get(`vessel:${id}`); if (cached) return cached; const vessel = await Vessel.findById(id).populate('ownerId', 'name email'); if (!vessel) throw new Error('Vessel not found'); if (vessel.ownerId._id !== userId && !['super_admin', 'admin'].includes(role)) throw new Error('Forbidden'); await this.cache.set(`vessel:${id}`, vessel, config.cache.ttl.vessel); return vessel; }
  async getUserVessels(userId, role, filters = {}, page = 1, limit = 20) { const cacheKey = `vessels:${userId}:${role}:${JSON.stringify(filters)}:${page}:${limit}`; const cached = await this.cache.get(cacheKey); if (cached) return cached; const query = ['super_admin', 'admin'].includes(role) ? {} : { ownerId: userId }; Object.assign(query, filters); const vessels = await Vessel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('ownerId', 'name email'); const total = await Vessel.countDocuments(query); const result = { vessels, total, page, limit, totalPages: Math.ceil(total / limit) }; await this.cache.set(cacheKey, result, 60); return result; }
  async addGeofence(vesselId, geofenceData, userId, role) { const vessel = await this.getById(vesselId, userId, role); if (vessel.geofence.zones.length >= config.geofencing.maxZonesPerVessel) throw new Error(`Maximum ${config.geofencing.maxZonesPerVessel} geofences per vessel`); const validated = await validation.geofence.validateAsync(geofenceData); vessel.geofence.zones.push(validated); vessel.geofence.enabled = true; await vessel.save(); await this.cache.del(`vessel:${vesselId}`); return vessel.geofence.zones; }
  async removeGeofence(vesselId, zoneIndex, userId, role) { const vessel = await this.getById(vesselId, userId, role); vessel.geofence.zones.splice(zoneIndex, 1); if (vessel.geofence.zones.length === 0) vessel.geofence.enabled = false; await vessel.save(); await this.cache.del(`vessel:${vesselId}`); return vessel.geofence.zones; }
  async delete(id, userId, role, ip, userAgent) { if (role !== 'super_admin' && role !== 'admin') throw new Error('Forbidden'); const vessel = await Vessel.findById(id); if (!vessel) throw new Error('Vessel not found'); await vessel.deleteOne(); await AuditLog.create({ action: 'vessel.delete', userId, targetId: id, targetType: 'vessel', changes: vessel.toObject(), ip, userAgent }); await this.cache.del(`vessel:${id}`); await this.cache.delPattern(`vessels:${vessel.ownerId}:*`); }
}

// ==================== LOCATION SERVICE ====================
class LocationService {
  async push(data, userId) { const validated = await validation.location.validateAsync(data); await batcher.add({ vesselId: validated.vesselId, userId, location: { type: 'Point', coordinates: [validated.lng, validated.lat] }, speed: validated.speed || 0, heading: validated.heading || 0, accuracy: validated.accuracy || 0, altitude: validated.altitude, satCount: validated.satCount, battery: validated.battery, events: validated.events, timestamp: new Date() }); await Vessel.findByIdAndUpdate(validated.vesselId, { location: { type: 'Point', coordinates: [validated.lng, validated.lat] }, lastSeen: new Date(), speed: validated.speed || 0, heading: validated.heading || 0 }); await this.checkGeofence(validated.vesselId, validated.lat, validated.lng); await this.checkSpeedAlerts(validated.vesselId, validated.speed); }
  async checkGeofence(vesselId, lat, lng) { const vessel = await Vessel.findById(vesselId); if (!vessel?.geofence?.enabled) return; for (let i = 0; i < vessel.geofence.zones.length; i++) { const zone = vessel.geofence.zones[i]; let inside = false; if (zone.type === 'circle') { const distance = geolib.getDistance({ latitude: lat, longitude: lng }, { latitude: zone.coordinates.lat, longitude: zone.coordinates.lng }); inside = distance <= zone.radius; } else if (zone.type === 'polygon') { inside = geolib.isPointInPolygon({ latitude: lat, longitude: lng }, zone.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng }))); } if (inside && zone.alertOnEntry) { await Alert.create({ vesselId, type: 'geofence', severity: 'medium', message: `Vessel entered geofence: ${zone.name}`, location: { type: 'Point', coordinates: [lng, lat] } }); } else if (!inside && zone.alertOnExit) { await Alert.create({ vesselId, type: 'geofence', severity: 'medium', message: `Vessel exited geofence: ${zone.name}`, location: { type: 'Point', coordinates: [lng, lat] } }); } } }
  async checkSpeedAlerts(vesselId, speed) { const vessel = await Vessel.findById(vesselId); const maxSpeed = vessel?.specifications?.maxSpeed || 30; if (speed > maxSpeed * 1.2) { await Alert.create({ vesselId, type: 'speed', severity: 'high', message: `Vessel exceeding speed limit: ${speed} knots`, data: { speed, limit: maxSpeed } }); } }
  async getHistory(vesselId, from, to, limit = 100, page = 1) { const query = { vesselId }; if (from) query.timestamp = { $gte: new Date(from) }; if (to) query.timestamp = { ...query.timestamp, $lte: new Date(to) }; const locations = await Location.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(Math.min(limit, 1000)); const total = await Location.countDocuments(query); return { locations, total, page, limit, totalPages: Math.ceil(total / limit) }; }
  async getTrack(vesselId, from, to, simplify = true) { const query = { vesselId }; if (from) query.timestamp = { $gte: new Date(from) }; if (to) query.timestamp = { ...query.timestamp, $lte: new Date(to) }; let locations = await Location.find(query).sort({ timestamp: 1 }).limit(10000); if (simplify && locations.length > 1000) locations = this.simplifyTrack(locations, 0.001); return locations.map(loc => ({ lat: loc.location.coordinates[1], lng: loc.location.coordinates[0], timestamp: loc.timestamp, speed: loc.speed, heading: loc.heading, altitude: loc.altitude })); }
  simplifyTrack(points, tolerance) { if (points.length <= 2) return points; let maxDistance = 0, maxIndex = 0; const first = points[0], last = points[points.length - 1]; for (let i = 1; i < points.length - 1; i++) { const distance = this.pointLineDistance({ lat: points[i].location.coordinates[1], lng: points[i].location.coordinates[0] }, { lat: first.location.coordinates[1], lng: first.location.coordinates[0] }, { lat: last.location.coordinates[1], lng: last.location.coordinates[0] }); if (distance > maxDistance) { maxDistance = distance; maxIndex = i; } } if (maxDistance > tolerance) { const left = this.simplifyTrack(points.slice(0, maxIndex + 1), tolerance); const right = this.simplifyTrack(points.slice(maxIndex), tolerance); return left.slice(0, -1).concat(right); } return [first, last]; }
  pointLineDistance(point, lineStart, lineEnd) { const x0 = point.lng, y0 = point.lat; const x1 = lineStart.lng, y1 = lineStart.lat; const x2 = lineEnd.lng, y2 = lineEnd.lat; const numerator = Math.abs((x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1)); const denominator = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)); return numerator / denominator; }
  async getNearby(lat, lng, radius = 5000, limit = 50, filters = {}) { const query = { location: { $near: { $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] }, $maxDistance: radius } }, ...filters }; return Vessel.find(query).limit(limit).populate('ownerId', 'name'); }
  async getLastPosition(vesselId) { return Location.findOne({ vesselId }).sort({ timestamp: -1 }); }
}

// ==================== TICKET SERVICE ====================
class TicketService {
  async create(data, userId, ip, userAgent) { const validated = await validation.ticket.validateAsync(data); const ticket = await Ticket.create({ ...validated, createdBy: userId, auditLog: [{ action: 'created', userId, timestamp: new Date() }], sla: { responseTime: 3600, resolutionTime: 86400 } }); await AuditLog.create({ action: 'ticket.create', userId, targetId: ticket._id, targetType: 'ticket', changes: validated, ip, userAgent }); await triggerWebhooks('ticket.created', { ticketId: ticket._id }); return ticket; }
  async addComment(id, message, userId, isInternal = false) { const ticket = await Ticket.findById(id); if (!ticket) throw new Error('Ticket not found'); ticket.comments.push({ message, userId, isInternal, createdAt: new Date() }); ticket.status = 'in_progress'; if (!ticket.sla.respondedAt) ticket.sla.respondedAt = new Date(); await ticket.save(); await triggerWebhooks('ticket.updated', { ticketId: id }); return ticket; }
  async updateStatus(id, status, userId) { const ticket = await Ticket.findByIdAndUpdate(id, { status, resolvedAt: status === 'resolved' ? new Date() : null, $push: { auditLog: { action: `status_changed_to_${status}`, userId, timestamp: new Date() } } }, { new: true }); if (status === 'resolved') { ticket.sla.resolvedAt = new Date(); await ticket.save(); } await triggerWebhooks('ticket.status_changed', { ticketId: id, status }); return ticket; }
  async assignTicket(id, assignedTo, userId, role) { if (!['super_admin', 'admin'].includes(role)) throw new Error('Forbidden'); const ticket = await Ticket.findByIdAndUpdate(id, { assignedTo, $push: { auditLog: { action: `assigned_to_${assignedTo}`, userId, timestamp: new Date() } } }, { new: true }); return ticket; }
  async addSatisfactionRating(id, rating, comment, userId) { const ticket = await Ticket.findOne({ _id: id, createdBy: userId }); if (!ticket) throw new Error('Ticket not found'); ticket.satisfaction = { rating, comment, ratedAt: new Date() }; await ticket.save(); return ticket; }
  async getUserTickets(userId, role, filters = {}, page = 1, limit = 20) { const query = ['super_admin', 'admin'].includes(role) ? {} : { createdBy: userId }; Object.assign(query, filters); const tickets = await Ticket.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('createdBy', 'name email').populate('assignedTo', 'name email'); const total = await Ticket.countDocuments(query); return { tickets, total, page, limit, totalPages: Math.ceil(total / limit) }; }
  async getStats() { const status = await Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]); const priority = await Ticket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]); const avgResolutionTime = await Ticket.aggregate([{ $match: { resolvedAt: { $exists: true } } }, { $project: { resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] } } }, { $group: { _id: null, avgTime: { $avg: '$resolutionTime' } } }]); return { status, priority, avgResolutionTime: avgResolutionTime[0]?.avgTime || 0 }; }
}

// ==================== ALERT SERVICE ====================
class AlertService {
  async create(vesselId, type, severity, message, userId, location, data = {}) { const alert = await Alert.create({ vesselId, userId, type, severity, message, location: location ? { type: 'Point', coordinates: [location.lng, location.lat] } : undefined, data }); await triggerWebhooks('alert.created', { alertId: alert._id }); if (severity === 'critical' || severity === 'high') await this.sendAlertNotifications(alert); return alert; }
  async sendAlertNotifications(alert) { const vessel = await Vessel.findById(alert.vesselId).populate('ownerId'); if (!vessel) return; const user = await User.findById(vessel.ownerId); if (!user) return; await notificationQueue.add('send', { type: 'alert', recipients: { email: user.notificationPreferences.email ? user.email : null, sms: user.notificationPreferences.sms ? user.phone : null }, data: { subject: `[${alert.severity.toUpperCase()}] ${alert.type} alert for ${vessel.name}`, html: `<h2>Alert for ${vessel.name}</h2><p>${alert.message}</p><p>Severity: ${alert.severity}</p><p>Time: ${new Date().toISOString()}</p>`, sms: `${vessel.name}: ${alert.message}` } }); }
  async acknowledge(id, userId) { const alert = await Alert.findByIdAndUpdate(id, { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId }, { new: true }); return alert; }
  async resolve(id, userId, resolution) { const alert = await Alert.findByIdAndUpdate(id, { status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution }, { new: true }); return alert; }
  async getActiveAlerts(vesselId = null, type = null) { const query = { status: 'active' }; if (vesselId) query.vesselId = vesselId; if (type) query.type = type; return Alert.find(query).sort({ createdAt: -1 }).populate('vesselId', 'name'); }
  async getAlertHistory(filters = {}, page = 1, limit = 50) { const alerts = await Alert.find(filters).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('vesselId', 'name').populate('acknowledgedBy', 'name').populate('resolvedBy', 'name'); const total = await Alert.countDocuments(filters); return { alerts, total, page, limit, totalPages: Math.ceil(total / limit) }; }
  async getStats(vesselId = null) { const match = vesselId ? { vesselId } : {}; const stats = await Alert.aggregate([{ $match: match }, { $group: { _id: { type: '$type', severity: '$severity', status: '$status' }, count: { $sum: 1 } } }]); return stats; }
}

// ==================== REPORT SERVICE ====================
class ReportService {
  async generateReport(type, parameters, userId) { let data = [], filename = ''; switch (type) { case 'vessel_activity': data = await this.getVesselActivityReport(parameters); filename = `vessel_activity_${moment().format('YYYYMMDD_HHmmss')}`; break; case 'alert_summary': data = await this.getAlertSummaryReport(parameters); filename = `alert_summary_${moment().format('YYYYMMDD_HHmmss')}`; break; case 'performance': data = await this.getPerformanceReport(parameters); filename = `performance_${moment().format('YYYYMMDD_HHmmss')}`; break; default: throw new Error('Unknown report type'); } const report = await Report.create({ name: `${type}_${moment().format('YYYY-MM-DD_HH:mm')}`, type, parameters, data, generatedBy: userId, generatedAt: new Date() }); if (parameters.format === 'csv') { const parser = new Parser(); const csv = parser.parse(data); report.url = await this.saveFile(`${filename}.csv`, csv); } await report.save(); return report; }
  async getVesselActivityReport(parameters) { const { vesselId, from, to } = parameters; const locations = await Location.find({ vesselId, timestamp: { $gte: new Date(from), $lte: new Date(to) } }).sort({ timestamp: 1 }); let totalDistance = 0, lastPoint = null; for (const loc of locations) { if (lastPoint) { totalDistance += geolib.getDistance({ latitude: lastPoint.location.coordinates[1], longitude: lastPoint.location.coordinates[0] }, { latitude: loc.location.coordinates[1], longitude: loc.location.coordinates[0] }); } lastPoint = loc; } return { vesselId, period: { from, to }, totalDistance: (totalDistance / 1000).toFixed(2), avgSpeed: _.meanBy(locations, 'speed').toFixed(1), maxSpeed: _.maxBy(locations, 'speed')?.speed || 0, totalPoints: locations.length }; }
  async getAlertSummaryReport(parameters) { const { from, to, severity } = parameters; const query = { createdAt: { $gte: new Date(from), $lte: new Date(to) } }; if (severity) query.severity = severity; const alerts = await Alert.find(query).populate('vesselId', 'name'); const byType = _.groupBy(alerts, 'type'); const bySeverity = _.groupBy(alerts, 'severity'); const byVessel = _.groupBy(alerts, a => a.vesselId?.name || 'Unknown'); return { period: { from, to }, total: alerts.length, byType: Object.keys(byType).map(t => ({ type: t, count: byType[t].length })), bySeverity: Object.keys(bySeverity).map(s => ({ severity: s, count: bySeverity[s].length })), topVessels: Object.keys(byVessel).map(v => ({ vessel: v, count: byVessel[v].length })).sort((a, b) => b.count - a.count).slice(0, 10) }; }
  async getPerformanceReport(parameters) { const { from, to } = parameters; const locations = await Location.find({ timestamp: { $gte: new Date(from), $lte: new Date(to) } }); const vessels = await Vessel.find(); const vesselPerformance = await Promise.all(vessels.map(async vessel => { const vesselLocs = locations.filter(l => l.vesselId === vessel._id); return { vesselId: vessel._id, vesselName: vessel.name, totalPoints: vesselLocs.length, avgSpeed: _.meanBy(vesselLocs, 'speed').toFixed(1), maxSpeed: _.maxBy(vesselLocs, 'speed')?.speed || 0, lastSeen: _.maxBy(vesselLocs, 'timestamp')?.timestamp }; })); return { period: { from, to }, totalVessels: vessels.length, activeVessels: vesselPerformance.filter(v => v.totalPoints > 0).length, totalLocations: locations.length, vesselPerformance: vesselPerformance.sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 20) }; }
  async saveFile(filename, content) { const dir = path.join(__dirname, 'reports'); await fs.mkdir(dir, { recursive: true }); const filePath = path.join(dir, filename); await fs.writeFile(filePath, content); return `/reports/${filename}`; }
}

// ==================== WEBHOOK SERVICE ====================
async function triggerWebhooks(event, data) {
  const webhooks = await Webhook.find({ events: event, isActive: true });
  for (const webhook of webhooks) {
    axios.post(webhook.url, { event, data, timestamp: new Date().toISOString() }, { headers: { 'X-Webhook-Signature': crypto.createHmac('sha256', webhook.secret).update(JSON.stringify({ event, data })).digest('hex'), 'Content-Type': 'application/json' }, timeout: webhook.timeout }).catch(err => { logger.error(`Webhook ${webhook._id} failed:`, err.message); });
  }
}

// ==================== AUTH MIDDLEWARE ====================
async function authMiddleware(req, res, next) {
  const startTime = Date.now();
  const path = req.route?.path || req.path;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) { httpRequestsTotal.labels(req.method, path, 401, 'auth').inc(); return res.status(401).json({ error: 'No token provided' }); }
    const decoded = jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer, audience: config.jwt.audience });
    const revoked = await tokenService.isRevoked(decoded.jti);
    if (revoked) { httpRequestsTotal.labels(req.method, path, 401, 'auth').inc(); return res.status(401).json({ error: 'Token revoked' }); }
    let user = await cache.get(`user:${decoded.sub}`);
    if (!user) { user = await User.findById(decoded.sub).select('-password -refreshTokenHash -mfaSecret'); if (user) await cache.set(`user:${decoded.sub}`, user, config.cache.ttl.user); }
    if (!user || !user.isActive) { httpRequestsTotal.labels(req.method, path, 401, 'auth').inc(); return res.status(401).json({ error: 'User not found' }); }
    req.user = { ...decoded, ...user.toObject() }; req.userId = decoded.sub;
    httpRequestsTotal.labels(req.method, path, 200, 'auth').inc(); httpRequestDuration.labels(req.method, path).observe((Date.now() - startTime) / 1000);
    next();
  } catch (err) {
    httpRequestsTotal.labels(req.method, path, 401, 'auth').inc();
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    logger.error('Auth error:', err); return res.status(401).json({ error: 'Invalid token' });
  }
}

function requirePermission(permission) { return (req, res, next) => { if (!req.user.permissions?.includes(permission) && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Insufficient permissions' }); next(); }; }
function requireRole(roles) { return (req, res, next) => { if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' }); next(); }; }

// ==================== EXPRESS MIDDLEWARE ====================
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "data:", "https:"], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: [] } } }));
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
app.use(cors({ origin: corsOrigins, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'] }));
app.use(express.json({ limit: '20mb' })); app.use(express.urlencoded({ extended: true, limit: '20mb' })); app.use(cookieParser()); app.use(compression({ level: 6 }));
app.use((req, res, next) => { req.id = uuidv4(); res.setHeader('X-Request-ID', req.id); next(); });
app.use((req, res, next) => { const start = Date.now(); res.on('finish', () => { const duration = Date.now() - start; logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, { requestId: req.id, ip: req.ip, userAgent: req.headers['user-agent'] }); if (duration > 1000) logger.warn('Slow request detected', { method: req.method, url: req.url, duration, ip: req.ip, requestId: req.id }); }); next(); });
app.use(rateLimitMiddleware);

// ==================== API ROUTES ====================
const router = express.Router();

router.get('/health', async (req, res) => { res.json({ status: 'healthy', version: config.version, timestamp: new Date().toISOString(), uptime: process.uptime(), services: { mongodb: mongoose.connection.readyState === 1, redis: redisAvailable, queue: locationQueue !== null }, metrics: { memory: process.memoryUsage(), activeVessels: activeVessels.get(), activeConnections: activeConnections.get(), queueSize: queueSize.get() } }); });
router.get('/health/detailed', async (req, res) => { const memoryUsage = process.memoryUsage(); const queueCounts = locationQueue ? await locationQueue.getJobCounts() : {}; res.json({ status: 'healthy', timestamp: new Date().toISOString(), memory: { rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB', heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB', heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB' }, queue: { waiting: queueCounts.waiting || 0, active: queueCounts.active || 0, completed: queueCounts.completed || 0, failed: queueCounts.failed || 0 }, connections: { mongodb: mongoose.connection.readyState === 1, redis: redisAvailable, websocket: activeConnections.get() } }); });
router.get('/metrics', async (req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });

// Auth Routes
router.post('/auth/login', async (req, res) => { try { await rateLimiters.login.consume(`${req.ip}:${req.body?.email || 'unknown'}`); const { accessToken, refreshToken, user } = await authService.login(req.body.email, req.body.password, req.body.mfaToken, req.ip, req.headers['user-agent']); res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: config.env === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/v1/auth/refresh' }); res.json({ accessToken, user }); } catch (err) { res.status(401).json({ error: err.message }); } });
router.post('/auth/mfa/setup', authMiddleware, async (req, res) => { try { const { secret, qrCode } = await authService.setupMFA(req.userId); res.json({ secret, qrCode }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.post('/auth/mfa/verify', authMiddleware, async (req, res) => { try { const verified = await authService.verifyMFA(req.userId, req.body.token); res.json({ verified }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.post('/auth/refresh', async (req, res) => { try { const refreshToken = req.cookies.refreshToken; if (!refreshToken) throw new Error('No refresh token'); const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken, req.ip, req.headers['user-agent']); res.cookie('refreshToken', newRefreshToken, { httpOnly: true, secure: config.env === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/v1/auth/refresh' }); res.json({ accessToken }); } catch (err) { res.status(401).json({ error: err.message }); } });
router.post('/auth/logout', authMiddleware, async (req, res) => { const token = req.headers.authorization?.split(' ')[1]; const refreshToken = req.cookies.refreshToken; await authService.logout(token, refreshToken, req.userId); res.clearCookie('refreshToken'); res.json({ message: 'Logged out successfully' }); });

// Vessel Routes
router.get('/vessels', authMiddleware, async (req, res) => { const { page = 1, limit = 20, status, type } = req.query; const filters = {}; if (status) filters.status = status; if (type) filters.type = type; const result = await vesselService.getUserVessels(req.userId, req.user.role, filters, parseInt(page), parseInt(limit)); res.json(result); });
router.get('/vessels/:id', authMiddleware, async (req, res) => { const vessel = await vesselService.getById(req.params.id, req.userId, req.user.role); res.json(vessel); });
router.post('/vessels', authMiddleware, requirePermission('vessel.create'), async (req, res) => { const vessel = await vesselService.create(req.body, req.userId, req.ip, req.headers['user-agent']); res.status(201).json(vessel); });
router.put('/vessels/:id', authMiddleware, requirePermission('vessel.update'), async (req, res) => { const vessel = await vesselService.update(req.params.id, req.body, req.userId, req.user.role, req.ip, req.headers['user-agent']); res.json(vessel); });
router.delete('/vessels/:id', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { await vesselService.delete(req.params.id, req.userId, req.user.role, req.ip, req.headers['user-agent']); res.json({ message: 'Vessel deleted' }); });
router.post('/vessels/:id/geofences', authMiddleware, requirePermission('vessel.update'), async (req, res) => { const zones = await vesselService.addGeofence(req.params.id, req.body, req.userId, req.user.role); res.json(zones); });
router.delete('/vessels/:id/geofences/:index', authMiddleware, requirePermission('vessel.update'), async (req, res) => { const zones = await vesselService.removeGeofence(req.params.id, parseInt(req.params.index), req.userId, req.user.role); res.json(zones); });

// Location Routes
router.post('/locations', authMiddleware, async (req, res) => { try { await rateLimiters.location.consume(req.ip); await locationService.push(req.body, req.userId); res.status(202).json({ message: 'Location accepted' }); } catch (err) { if (err instanceof Error && err.message === 'Too many requests') res.status(429).json({ error: 'Too many location updates' }); else res.status(400).json({ error: err.message }); } });
router.get('/locations/:vesselId', authMiddleware, async (req, res) => { const { from, to, limit = 100, page = 1 } = req.query; const history = await locationService.getHistory(req.params.vesselId, from, to, parseInt(limit), parseInt(page)); res.json(history); });
router.get('/locations/:vesselId/track', authMiddleware, async (req, res) => { const { from, to, simplify = true } = req.query; const track = await locationService.getTrack(req.params.vesselId, from, to, simplify !== 'false'); res.json(track); });
router.get('/vessels/near', authMiddleware, async (req, res) => { const { lat, lng, radius = 5000, limit = 50, status, type } = req.query; const filters = {}; if (status) filters.status = status; if (type) filters.type = type; const vessels = await locationService.getNearby(lat, lng, parseInt(radius), parseInt(limit), filters); res.json(vessels); });
router.get('/locations/:vesselId/last', authMiddleware, async (req, res) => { const location = await locationService.getLastPosition(req.params.vesselId); res.json(location); });

// Alert Routes
router.get('/alerts', authMiddleware, async (req, res) => { const { vesselId, type } = req.query; const alerts = await alertService.getActiveAlerts(vesselId, type); res.json(alerts); });
router.get('/alerts/history', authMiddleware, async (req, res) => { const { page = 1, limit = 50, vesselId, type, severity } = req.query; const filters = {}; if (vesselId) filters.vesselId = vesselId; if (type) filters.type = type; if (severity) filters.severity = severity; const result = await alertService.getAlertHistory(filters, parseInt(page), parseInt(limit)); res.json(result); });
router.post('/alerts/:id/acknowledge', authMiddleware, async (req, res) => { const alert = await alertService.acknowledge(req.params.id, req.userId); res.json(alert); });
router.post('/alerts/:id/resolve', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const alert = await alertService.resolve(req.params.id, req.userId, req.body.resolution); res.json(alert); });
router.get('/alerts/stats', authMiddleware, async (req, res) => { const stats = await alertService.getStats(req.query.vesselId); res.json(stats); });

// Ticket Routes
router.get('/tickets', authMiddleware, async (req, res) => { const { page = 1, limit = 20, status, priority } = req.query; const filters = {}; if (status) filters.status = status; if (priority) filters.priority = priority; const result = await ticketService.getUserTickets(req.userId, req.user.role, filters, parseInt(page), parseInt(limit)); res.json(result); });
router.post('/tickets', authMiddleware, async (req, res) => { const ticket = await ticketService.create(req.body, req.userId, req.ip, req.headers['user-agent']); res.status(201).json(ticket); });
router.get('/tickets/:id', authMiddleware, async (req, res) => { const ticket = await Ticket.findById(req.params.id).populate('createdBy', 'name email').populate('assignedTo', 'name email').populate('comments.userId', 'name'); if (!ticket) return res.status(404).json({ error: 'Ticket not found' }); if (ticket.createdBy._id !== req.userId && !['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' }); res.json(ticket); });
router.post('/tickets/:id/comments', authMiddleware, async (req, res) => { const ticket = await ticketService.addComment(req.params.id, req.body.message, req.userId, req.body.isInternal); res.json(ticket); });
router.put('/tickets/:id/status', authMiddleware, async (req, res) => { const ticket = await ticketService.updateStatus(req.params.id, req.body.status, req.userId); res.json(ticket); });
router.post('/tickets/:id/assign', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const ticket = await ticketService.assignTicket(req.params.id, req.body.assignedTo, req.userId, req.user.role); res.json(ticket); });
router.post('/tickets/:id/rating', authMiddleware, async (req, res) => { const { rating, comment } = req.body; const ticket = await ticketService.addSatisfactionRating(req.params.id, rating, comment, req.userId); res.json(ticket); });
router.get('/tickets/stats', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const stats = await ticketService.getStats(); res.json(stats); });

// Report Routes
router.post('/reports/generate', authMiddleware, requirePermission('report.generate'), async (req, res) => { try { await rateLimiters.export.consume(req.ip); const report = await reportService.generateReport(req.body.type, req.body.parameters, req.userId); res.json(report); } catch (err) { res.status(400).json({ error: err.message }); } });
router.get('/reports', authMiddleware, async (req, res) => { const reports = await Report.find({ generatedBy: req.userId }).sort({ generatedAt: -1 }).limit(50); res.json(reports); });
router.get('/reports/:id/download', authMiddleware, async (req, res) => { const report = await Report.findById(req.params.id); if (!report) return res.status(404).json({ error: 'Report not found' }); if (report.generatedBy !== req.userId && !['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' }); res.download(report.url); });

// Webhook Routes
router.get('/webhooks', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const webhooks = await Webhook.find(); res.json(webhooks); });
router.post('/webhooks', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const validated = await validation.webhook.validateAsync(req.body); const webhook = await Webhook.create({ ...validated, secret: crypto.randomBytes(32).toString('hex'), createdBy: req.userId }); res.status(201).json(webhook); });
router.delete('/webhooks/:id', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { await Webhook.findByIdAndDelete(req.params.id); res.json({ message: 'Webhook deleted' }); });

// Admin Routes
router.get('/admin/stats', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const [totalVessels, activeVesselsCount, totalUsers, openTickets, activeAlerts, totalLocations] = await Promise.all([Vessel.countDocuments(), Vessel.countDocuments({ status: 'active' }), User.countDocuments({ isActive: true }), Ticket.countDocuments({ status: { $in: ['new', 'open', 'in_progress'] } }), Alert.countDocuments({ status: 'active' }), Location.countDocuments({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })]); res.json({ vessels: { total: totalVessels, active: activeVesselsCount }, users: totalUsers, tickets: { open: openTickets }, alerts: { active: activeAlerts }, locations: { last24h: totalLocations }, system: { uptime: process.uptime(), memory: process.memoryUsage(), redis: redisAvailable, queueSize: queueSize.get(), activeConnections: activeConnections.get() } }); });
router.get('/admin/users', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const { page = 1, limit = 20, role, isActive } = req.query; const query = {}; if (role) query.role = role; if (isActive) query.isActive = isActive === 'true'; const users = await User.find(query, '-password -refreshTokenHash -mfaSecret').skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)); const total = await User.countDocuments(query); res.json({ users, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }); });
router.post('/admin/users', authMiddleware, requireRole(['super_admin']), async (req, res) => { const user = new User(req.body); await user.save(); res.status(201).json({ id: user._id, email: user.email, role: user.role }); });
router.put('/admin/users/:id/status', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ error: 'User not found' }); user.isActive = req.body.isActive; if (!req.body.isActive) user.tokenVersion += 1; await user.save(); await cache.del(`user:${user._id}`); res.json({ id: user._id, isActive: user.isActive }); });
router.put('/admin/users/:id/role', authMiddleware, requireRole(['super_admin']), async (req, res) => { const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ error: 'User not found' }); user.role = req.body.role; user.tokenVersion += 1; await user.save(); await cache.del(`user:${user._id}`); res.json({ id: user._id, role: user.role }); });
router.get('/admin/audit', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const { limit = 100, userId, action, from, to } = req.query; const query = {}; if (userId) query.userId = userId; if (action) query.action = action; if (from) query.timestamp = { $gte: new Date(from) }; if (to) query.timestamp = { ...query.timestamp, $lte: new Date(to) }; const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(parseInt(limit)); res.json(logs); });
router.get('/admin/analytics', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res) => { const { type, vesselId, days = 30 } = req.query; const start = moment().subtract(days, 'days').startOf('day').toDate(); const analytics = await Analytics.find({ type, vesselId, 'interval.start': { $gte: start } }).sort({ 'interval.start': -1 }); res.json(analytics); });

app.use('/api/v1', router);

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => { logger.error('Unhandled error:', { error: err.message, stack: err.stack, requestId: req.id }); res.status(500).json({ error: 'Internal server error', requestId: req.id }); });

// ==================== SOCKET.IO ====================
let io = null;

async function initSocket() {
  if (!redisAvailable) return;
  const socketIo = require('socket.io');
  const { createAdapter } = require('@socket.io/redis-adapter');
  const adapter = createAdapter(redis, redis);
  io = socketIo(server, { cors: { origin: corsOrigins, credentials: true }, transports: ['websocket', 'polling'], adapter, pingTimeout: 60000, pingInterval: 25000, maxHttpBufferSize: 1e6 });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer, audience: config.jwt.audience });
      const revoked = await tokenService.isRevoked(decoded.jti);
      if (revoked) return next(new Error('Token revoked'));
      const user = await User.findById(decoded.sub);
      if (!user || !user.isActive) return next(new Error('User not found'));
      socket.userId = user._id; socket.userRole = user.role; socket.permissions = user.permissions;
      next();
    } catch (err) { next(new Error('Invalid token')); }
  });
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.userId}`); activeConnections.inc();
    socket.join(`user:${socket.userId}`);
    if (['super_admin', 'admin'].includes(socket.userRole)) socket.join('admin');
    socket.on('location:update', async (data) => { try { await locationService.push(data, socket.userId); io.to('admin').emit('location:received', { userId: socket.userId, vesselId: data.vesselId, lat: data.lat, lng: data.lng, speed: data.speed, heading: data.heading, timestamp: Date.now() }); } catch (err) { socket.emit('error', { message: err.message }); } });
    socket.on('alert:acknowledge', async (data) => { if (!['super_admin', 'admin'].includes(socket.userRole)) { socket.emit('error', { message: 'Insufficient permissions' }); return; } const alert = await alertService.acknowledge(data.alertId, socket.userId); io.to('admin').emit('alert:updated', alert); });
    socket.on('subscribe:vessel', (vesselId) => { socket.join(`vessel:${vesselId}`); });
    socket.on('unsubscribe:vessel', (vesselId) => { socket.leave(`vessel:${vesselId}`); });
    socket.on('disconnect', () => { logger.info(`Socket disconnected: ${socket.userId}`); activeConnections.dec(); });
  });
  logger.info('✅ Socket.IO initialized');
}

// ==================== RECOVER EMERGENCY DATA ====================
async function recoverEmergencyData() {
  const emergencyFile = path.join(__dirname, 'emergency_locations.json');
  try {
    const exists = await fs.access(emergencyFile).then(() => true).catch(() => false);
    if (exists) {
      const data = await fs.readFile(emergencyFile, 'utf8');
      const locations = JSON.parse(data);
      if (locations.length > 0) {
        logger.info(`Found ${locations.length} locations in emergency file, recovering...`);
        for (let i = 0; i < locations.length; i += config.queue.batchSize) { const batch = locations.slice(i, i + config.queue.batchSize); await locationQueue.add('recovery', { locations: batch }, { attempts: 5, priority: 2 }); }
        await fs.unlink(emergencyFile);
        logger.info('Emergency data recovery completed');
      }
    }
  } catch (err) { logger.error('Emergency recovery failed:', err); }
}

// ==================== SCHEDULED REPORTS ====================
async function processScheduledReports() {
  const reports = await Report.find({ 'schedule.enabled': true, 'schedule.nextRun': { $lte: new Date() } });
  for (const report of reports) {
    try {
      await reportService.generateReport(report.type, report.parameters, report.generatedBy);
      report.schedule.lastRun = new Date();
      try { const interval = cronParser.parseExpression(report.schedule.cron); report.schedule.nextRun = interval.next().toDate(); } catch (cronErr) { logger.error(`Invalid cron expression for report ${report._id}:`, cronErr); report.schedule.enabled = false; }
      await report.save();
      if (report.schedule.recipients?.length) { const emailPromises = report.schedule.recipients.map(recipient => sendEmail(recipient, `Scheduled Report: ${report.name}`, `<p>Your scheduled report is ready.</p>`).catch(mailErr => logger.error(`Failed sending mail to ${recipient}:`, mailErr))); await Promise.all(emailPromises); }
    } catch (err) { logger.error(`Scheduled report ${report._id} failed:`, err); }
  }
}

// ==================== GRACEFUL SHUTDOWN ====================
async function gracefulShutdown() {
  logger.info('Shutting down gracefully...');
  const shutdownTimeout = setTimeout(() => { logger.error('Forced shutdown due to timeout'); process.exit(1); }, 60000);
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (io) await io.close();
    if (locationWorker) await locationWorker.close();
    if (locationQueue) await locationQueue.close();
    if (queueScheduler) await queueScheduler.close();
    if (redis) await redis.quit();
    await mongoose.disconnect();
    clearTimeout(shutdownTimeout);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) { logger.error('Error during shutdown:', err); process.exit(1); }
}

// ==================== DEFAULT ADMIN ====================
async function createDefaultAdmin() {
  const adminExists = await User.findOne({ role: 'super_admin' });
  if (!adminExists && process.env.ADMIN_PASSWORD) {
    await User.create({ name: 'System Administrator', email: 'admin@marine.com', password: process.env.ADMIN_PASSWORD, role: 'super_admin', permissions: ['*'], isActive: true });
    logger.info('✅ Default admin user created');
  }
}

// ==================== START SERVER ====================
async function start() {
  try {
    await initMongo();
    await initRedis();
    await initRateLimiters();
    await initNotifications();
    cache = new CacheService(redis);
    tokenService = new TokenService(redis);
    authService = new AuthService(tokenService, cache);
    vesselService = new VesselService(cache);
    locationService = new LocationService();
    ticketService = new TicketService();
    alertService = new AlertService();
    reportService = new ReportService();
    await initQueue();
    await recoverEmergencyData();
    await createDefaultAdmin();
    setInterval(async () => { const count = await Vessel.countDocuments({ status: 'active' }); activeVessels.set(count); }, 60000);
    setInterval(async () => { await processScheduledReports(); }, 3600000);
    await initSocket();
    app.use('/api/v1', router);
    server.listen(config.port, () => { console.log(`\n╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗\n║                              MARINE TRACKING SYSTEM V20 - ENTERPRISE EDITION                          ║\n╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣\n║  🌐 Environment: ${config.env.padEnd(86)}║\n║  🚀 Port: ${String(config.port).padEnd(86)}║\n║  📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'.padEnd(86)}║\n║  🔴 Redis: ${redisAvailable ? 'Connected' : 'Disconnected'.padEnd(86)}║\n║  📡 Socket.IO: ${io ? 'Ready'.padEnd(90)}║\n║  📦 Queue: BullMQ (${config.queue.concurrency} workers)${' '.padEnd(90 - String(config.queue.concurrency).length - 10)}║\n║  📧 Email: ${emailTransporter ? 'Configured' : 'Not configured'.padEnd(86)}║\n║  📱 SMS: ${twilioClient ? 'Configured' : 'Not configured'.padEnd(86)}║\n║  🔐 Security: JWT + MFA + Rate Limiting + Blacklist                                                   ║\n║  📈 Metrics: Prometheus + Grafana Ready                                                              ║\n║  💾 Cache: Redis + Memory (${config.cache.maxKeys.toLocaleString()} keys)${' '.padEnd(86 - config.cache.maxKeys.toLocaleString().length)}║\n║  🗺️ Geospatial: 2dsphere + Geofencing + Route Optimization                                          ║\n║  📝 Audit: Complete audit trail (1 year retention)                                                   ║\n║  🔔 Alerts: Real-time + SMS + Email + Push                                                           ║\n║  📊 Analytics: Vessel performance + Reports + CSV/PDF export                                         ║\n║  🔗 Webhooks: Outgoing events to external systems                                                    ║\n╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝\n`); });
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (err) { logger.error('Failed to start server:', err); process.exit(1); }
}

start();
