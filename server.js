require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: '⚠️ تجاوزت الحد المسموح'
}));

connectDB();

app.use('/api/vessels', require('./routes/vesselRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/logs', require('./routes/logRoutes'));
app.use('/api/login', require('./routes/authRoutes'));

const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

io.on('connection', (socket) => {
    console.log('✅ مستخدم متصل:', socket.id);
    socket.on('send-location', (data) => {
        socket.broadcast.emit('receive-location', data);
    });
    socket.on('disconnect', () => {
        console.log('❌ مستخدم غير متصل:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
});
