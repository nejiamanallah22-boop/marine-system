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
    console.log(`Login attempt: ${username}`);

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !user) {
        console.log('User not found');
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.password === password) {
        console.log('Login success');
        return res.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } else {
        console.log('Password mismatch');
        return res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/vessels', async (req, res) => {
    const { data, error } = await supabase.from('vessels').select('*');
    res.json(data || []);
});

app.get('/api/users', async (req, res) => {
    const { data, error } = await supabase.from('users').select('id, username, role, enabled');
    res.json(data || []);
});

app.post('/api/vessels', async (req, res) => {
    const vessel = req.body;
    const { data, error } = await supabase.from('vessels').insert([vessel]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, vessel: data[0] });
});

app.put('/api/vessels/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    await supabase.from('vessels').update(updates).eq('id', id);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', async (req, res) => {
    const { id } = req.params;
    await supabase.from('vessels').delete().eq('id', id);
    res.json({ success: true });
});

app.get('/api/tickets', async (req, res) => {
    const { data } = await supabase.from('tickets').select('*');
    res.json(data || []);
});

app.post('/api/tickets', async (req, res) => {
    const ticket = req.body;
    await supabase.from('tickets').insert([ticket]);
    res.json({ success: true });
});

app.get('/api/logs', async (req, res) => {
    const { data } = await supabase.from('logs').select('*');
    res.json(data || []);
});

app.get('/api/stats', async (req, res) => {
    const { data } = await supabase.from('vessels').select('*');
    const total = data.length;
    const salih = data.filter(v => v.status === 'صالح').length;
    const mo3atab = data.filter(v => v.status === 'معطب').length;
    const siyana = data.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

app.get('/api/export', async (req, res) => {
    const { data } = await supabase.from('vessels').select('*');
    res.json({ vessels: data || [] });
});

app.post('/api/import', async (req, res) => {
    const { vessels } = req.body;
    let imported = 0;
    for (const v of vessels) {
        const { error } = await supabase.from('vessels').insert([v]);
        if (!error) imported++;
    }
    res.json({ success: true, imported });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
