const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working!' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        res.json({ success: true, user: { username: 'admin', role: 'مسؤول' } });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
