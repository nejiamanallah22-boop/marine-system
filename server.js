const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = 'https://rzcwngkpknilfesxdrkk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6Y3duZ2twa25pbGZlc3hkcmtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjI2NDgsImV4cCI6MjA5MTczODY0OH0.9jeNxy0VWWtYkZbegduytsbKDfy7zfqKynLbESKh8ww';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.password === password) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/vessels', async (req, res) => {
    const { data } = await supabase.from('vessels').select('*');
    res.json(data || []);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
