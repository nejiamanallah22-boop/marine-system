const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { logger, logSecurity } = require('../services/logger');
const { extractDevice, extractBrowser } = require('../utils/helpers');
const User = require('../models/User');
const Location = require('../models/Location');

class SocketService {
  constructor(server) {
    this.io = null;
    this.connectedUsers = new Map();
    this.userSockets = new Map();
    this.rooms = new Map();
    this.init(server);
  }

  init(server) {
    this.io = socketIO(server, {
      cors: {
        origin: config.cors.origins,
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      allowEIO3: true
    });

    // 🔐 مصادقة Socket.IO
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          logSecurity('Socket connection without token', {
            ip: socket.handshake.address
          });
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);
        
        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }

        socket.userId = user._id;
        socket.userName = user.name;
        socket.userRole = user.role;
        socket.user = user;
        next();
      } catch (error) {
        logSecurity('Invalid socket token', {
          ip: socket.handshake.address,
          error: error.message
        });
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', this.handleConnection.bind(this));
    logger.info('📡 Socket.IO server initialized with authentication');
  }

  handleConnection(socket) {
    logger.info('📡 Socket connected', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName
    });

    // إضافة المستخدم
    this.addUser(socket);
    this.emitUserList();

    // انضمام لغرفة المستخدم
    socket.join(`user:${socket.userId}`);

    // Event listeners
    socket.on('join-room', (roomId) => this.joinRoom(socket, roomId));
    socket.on('leave-room', (roomId) => this.leaveRoom(socket, roomId));
    socket.on('update-location', (data) => this.updateLocation(socket, data));
    socket.on('send-message', (data) => this.handleMessage(socket, data));
    socket.on('typing', (data) => this.handleTyping(socket, data));
    socket.on('get-users', () => this.emitUserList(socket));
    socket.on('disconnect', () => this.handleDisconnect(socket));
    socket.on('error', (error) => {
      logger.error('Socket error:', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message
      });
    });
  }

  addUser(socket) {
    const userData = {
      id: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      userRole: socket.userRole,
      connectedAt: new Date(),
      lastActivity: new Date(),
      ip: socket.handshake.address,
      device: extractDevice(socket.handshake.headers['user-agent']),
      browser: extractBrowser(socket.handshake.headers['user-agent']),
      location: null
    };

    this.connectedUsers.set(socket.id, userData);
    
    if (!this.userSockets.has(socket.userId)) {
      this.userSockets.set(socket.userId, new Set());
    }
    this.userSockets.get(socket.userId).add(socket.id);

    logger.debug('User added to socket', {
      userId: socket.userId,
      socketId: socket.id,
      totalUsers: this.connectedUsers.size
    });
  }

  async updateLocation(socket, data) {
    try {
      if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        return socket.emit('error', { message: 'إحداثيات غير صالحة' });
      }

      if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
        return socket.emit('error', { message: 'إحداثيات خارج النطاق' });
      }

      const user = this.connectedUsers.get(socket.id);
      if (!user) return;

      user.location = { lat: data.lat, lng: data.lng, updatedAt: new Date() };
      user.lastActivity = new Date();

      // حفظ في قاعدة البيانات
      await Location.create({
        userName: user.userName,
        userRole: user.userRole,
        lat: data.lat,
        lng: data.lng,
        action: data.action || 'تحديث موقع',
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        device: user.device,
        browser: user.browser
      });

      // بث الموقع
      this.io.emit('location-update', {
        userId: socket.userId,
        userName: user.userName,
        userRole: user.userRole,
        location: user.location,
        timestamp: new Date().toISOString()
      });

      logger.debug('Location updated', {
        userId: socket.userId,
        lat: data.lat,
        lng: data.lng
      });
    } catch (error) {
      logger.error('Location update error:', error);
      socket.emit('error', { message: 'خطأ في تحديث الموقع' });
    }
  }

  // دوال أخرى...
  joinRoom(socket, roomId) {
    if (!roomId) return;
    socket.join(roomId);
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId).add(socket.id);
    
    this.io.to(roomId).emit('room-members', {
      roomId,
      count: this.rooms.get(roomId).size,
      users: this.getRoomUsers(roomId)
    });
  }

  leaveRoom(socket, roomId) {
    if (!roomId) return;
    socket.leave(roomId);
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(socket.id);
      if (this.rooms.get(roomId).size === 0) this.rooms.delete(roomId);
    }
  }

  getRoomUsers(roomId) {
    if (!this.rooms.has(roomId)) return [];
    const users = [];
    for (const socketId of this.rooms.get(roomId)) {
      const user = this.connectedUsers.get(socketId);
      if (user) users.push(user);
    }
    return users;
  }

  handleMessage(socket, data) {
    if (!data || !data.message) {
      return socket.emit('error', { message: 'الرسالة مطلوبة' });
    }

    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      userId: socket.userId,
      userName: user.userName,
      userRole: user.userRole,
      message: data.message,
      timestamp: new Date().toISOString(),
      room: data.room || 'global'
    };

    if (data.room) {
      this.io.to(data.room).emit('new-message', message);
    } else {
      this.io.emit('new-message', message);
    }
  }

  handleTyping(socket, data) {
    const user = this.connectedUsers.get(socket.id);
    if (!user) return;

    const typingData = {
      userId: socket.userId,
      userName: user.userName,
      isTyping: data.isTyping || false,
      timestamp: new Date().toISOString()
    };

    if (data.room) {
      socket.to(data.room).emit('user-typing', typingData);
    } else {
      socket.broadcast.emit('user-typing', typingData);
    }
  }

  handleDisconnect(socket) {
    const user = this.connectedUsers.get(socket.id);
    
    if (user) {
      // إزالة من الغرف
      for (const [roomId, sockets] of this.rooms) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) this.rooms.delete(roomId);
        }
      }

      this.connectedUsers.delete(socket.id);
      
      if (this.userSockets.has(user.userId)) {
        this.userSockets.get(user.userId).delete(socket.id);
        if (this.userSockets.get(user.userId).size === 0) {
          this.userSockets.delete(user.userId);
        }
      }

      this.io.emit('user-disconnected', {
        userId: user.userId,
        userName: user.userName,
        timestamp: new Date().toISOString()
      });

      this.emitUserList();

      logger.info('Socket disconnected', {
        userId: user.userId,
        socketId: socket.id,
        totalUsers: this.connectedUsers.size
      });
    }
  }

  emitUserList(socket = null) {
    const users = Array.from(this.connectedUsers.values()).map(user => ({
      userId: user.userId,
      userName: user.userName,
      userRole: user.userRole,
      device: user.device,
      browser: user.browser,
      location: user.location,
      connectedAt: user.connectedAt,
      lastActivity: user.lastActivity
    }));

    const event = 'user-list';
    const data = users;
    
    if (socket) {
      socket.emit(event, data);
    } else {
      this.io.emit(event, data);
    }
  }

  close() {
    if (this.io) {
      this.io.close();
      logger.info('Socket.IO server closed');
    }
  }
}

module.exports = SocketService;
