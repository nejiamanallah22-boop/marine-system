const socketIO = require('socket.io');
const { logger, logSecurity } = require('./logger');
const { config } = require('../config/env');
const { extractDevice, extractBrowser } = require('./helperService');

class SocketService {
  constructor(server) {
    this.io = null;
    this.connectedUsers = new Map();
    this.rooms = new Map();
    this.userSockets = new Map();
    this.init(server);
  }

  init(server) {
    this.io = socketIO(server, {
      cors: {
        origin: config.corsOrigins || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    this.io.use((socket, next) => {
      // التحقق من التوكن
      const token = socket.handshake.auth.token;
      if (!token) {
        logSecurity('Socket connection without token', {
          ip: socket.handshake.address
        });
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        socket.userId = decoded.id;
        socket.userName = decoded.name;
        socket.userRole = decoded.role;
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
    logger.info('📡 Socket.IO server initialized');
  }

  handleConnection(socket) {
    logger.info('📡 Socket connected', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName
    });

    // إضافة المستخدم
    this.addUser(socket);

    // إرسال قائمة المستخدمين المتصلين
    this.emitUserList();

    // تسجيل المستخدم في غرفته الخاصة
    socket.join(`user:${socket.userId}`);

    // 👂 مستمعات الأحداث
    socket.on('join-room', (roomId) => {
      this.joinRoom(socket, roomId);
    });

    socket.on('leave-room', (roomId) => {
      this.leaveRoom(socket, roomId);
    });

    socket.on('update-location', (data) => {
      this.updateLocation(socket, data);
    });

    socket.on('send-message', (data) => {
      this.handleMessage(socket, data);
    });

    socket.on('typing', (data) => {
      this.handleTyping(socket, data);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });

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
    
    // ربط المستخدم بالـ Socket
    if (!this.userSockets.has(socket.userId)) {
      this.userSockets.set(socket.userId, new Set());
    }
    this.userSockets.get(socket.userId).add(socket.id);

    logger.info('User added to socket', {
      userId: socket.userId,
      socketId: socket.id,
      totalUsers: this.connectedUsers.size
    });
  }

  removeUser(socketId) {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      // إزالة من قائمة Sockets الخاصة بالمستخدم
      if (this.userSockets.has(user.userId)) {
        this.userSockets.get(user.userId).delete(socketId);
        if (this.userSockets.get(user.userId).size === 0) {
          this.userSockets.delete(user.userId);
        }
      }

      this.connectedUsers.delete(socketId);
      
      logger.info('User removed from socket', {
        userId: user.userId,
        socketId: socketId,
        totalUsers: this.connectedUsers.size
      });

      return user;
    }
    return null;
  }

  getUser(socketId) {
    return this.connectedUsers.get(socketId);
  }

  getUserByUserId(userId) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return null;
    
    for (const socketId of socketIds) {
      const user = this.connectedUsers.get(socketId);
      if (user) return user;
    }
    return null;
  }

  getUsers() {
    return Array.from(this.connectedUsers.values());
  }

  getActiveUsers() {
    return this.getUsers().filter(user => {
      const diff = Date.now() - new Date(user.lastActivity);
      return diff < 300000; // 5 دقائق
    });
  }

  joinRoom(socket, roomId) {
    if (!roomId) return;
    
    socket.join(roomId);
    
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(socket.id);

    logger.info('User joined room', {
      userId: socket.userId,
      roomId,
      socketId: socket.id
    });

    // إرسال عدد الأعضاء في الغرفة
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
      if (this.rooms.get(roomId).size === 0) {
        this.rooms.delete(roomId);
      }
    }

    logger.info('User left room', {
      userId: socket.userId,
      roomId,
      socketId: socket.id
    });
  }

  getRoomUsers(roomId) {
    if (!this.rooms.has(roomId)) return [];
    
    const users = [];
    for (const socketId of this.rooms.get(roomId)) {
      const user = this.getUser(socketId);
      if (user) users.push(user);
    }
    return users;
  }

  updateLocation(socket, data) {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      return socket.emit('error', { message: 'إحداثيات غير صالحة' });
    }

    // التحقق من صحة الإحداثيات
    if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
      return socket.emit('error', { message: 'إحداثيات خارج النطاق المسموح' });
    }

    const user = this.getUser(socket.id);
    if (!user) return;

    user.location = {
      lat: data.lat,
      lng: data.lng,
      updatedAt: new Date()
    };
    user.lastActivity = new Date();

    // تحديث موقع المستخدم في قاعدة البيانات
    // يمكن إضافة كود لحفظ الموقع في قاعدة البيانات هنا

    // بث الموقع لجميع المستخدمين
    this.io.emit('location-update', {
      userId: socket.userId,
      userName: user.userName,
      userRole: user.userRole,
      location: user.location,
      timestamp: new Date().toISOString()
    });

    // بث الموقع إلى غرفة معينة إذا كانت موجودة
    // يمكن إضافة منطق للغرف هنا

    logger.debug('Location updated', {
      userId: socket.userId,
      lat: data.lat,
      lng: data.lng
    });
  }

  handleMessage(socket, data) {
    if (!data || !data.message) {
      return socket.emit('error', { message: 'الرسالة مطلوبة' });
    }

    const user = this.getUser(socket.id);
    if (!user) return;

    const message = {
      id: generateId(),
      userId: socket.userId,
      userName: user.userName,
      userRole: user.userRole,
      message: data.message,
      timestamp: new Date().toISOString(),
      room: data.room || 'global'
    };

    if (data.room) {
      // إرسال إلى غرفة محددة
      this.io.to(data.room).emit('new-message', message);
    } else {
      // إرسال للجميع
      this.io.emit('new-message', message);
    }

    logger.info('Message sent', {
      userId: socket.userId,
      room: data.room || 'global',
      messageLength: data.message.length
    });
  }

  handleTyping(socket, data) {
    const user = this.getUser(socket.id);
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
    const user = this.removeUser(socket.id);
    
    if (user) {
      // إزالة من جميع الغرف
      for (const [roomId, sockets] of this.rooms) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.rooms.delete(roomId);
          }
        }
      }

      // إعلام الجميع بفصل المستخدم
      this.io.emit('user-disconnected', {
        userId: user.userId,
        userName: user.userName,
        timestamp: new Date().toISOString()
      });

      // تحديث قائمة المستخدمين المتصلين
      this.emitUserList();

      logger.info('Socket disconnected', {
        userId: user.userId,
        socketId: socket.id,
        totalUsers: this.connectedUsers.size
      });
    }
  }

  emitUserList() {
    const users = this.getUsers().map(user => ({
      userId: user.userId,
      userName: user.userName,
      userRole: user.userRole,
      device: user.device,
      browser: user.browser,
      location: user.location,
      connectedAt: user.connectedAt,
      lastActivity: user.lastActivity
    }));

    this.io.emit('user-list', users);
  }

  // دوال مساعدة للإرسال
  sendToUser(userId, event, data) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return false;

    for (const socketId of socketIds) {
      this.io.to(socketId).emit(event, data);
    }
    return true;
  }

  sendToRoom(roomId, event, data) {
    if (!this.rooms.has(roomId)) return false;
    this.io.to(roomId).emit(event, data);
    return true;
  }

  sendToAll(event, data) {
    this.io.emit(event, data);
  }

  // إغلاق الخدمة
  close() {
    if (this.io) {
      this.io.close();
      logger.info('Socket.IO server closed');
    }
  }
}

module.exports = SocketService;
