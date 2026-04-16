const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = 'https://rzcwngkpknilfesxdrkk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6Y3duZ2twa25pbGZlc3hkcmtrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE2MjY0OCwiZXhwIjoyMDkxNzM4NjQ4fQ.M6awEIDFWG2LGoxKFhqcP1bBGmKApMjqt7sIb_ek-L0';

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    
    if (error || !user) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    if (user.password === password) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

// GET all vessels
app.get('/api/vessels', async (req, res) => {
    const { data, error } = await supabase.from('vessels').select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// ADD vessel
app.post('/api/vessels', async (req, res) => {
    console.log('Adding vessel:', req.body);
    const { data, error } = await supabase.from('vessels').insert([req.body]).select();
    if (error) {
        console.error('Error adding vessel:', error);
        return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, vessel: data[0] });
});

// UPDATE vessel
app.put('/api/vessels/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { error } = await supabase.from('vessels').update(req.body).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// DELETE vessel
app.delete('/api/vessels/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { error } = await supabase.from('vessels').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// GET users
app.get('/api/users', async (req, res) => {
    const { data, error } = await supabase.from('users').select('id, username, role, enabled');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// ADD user
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    const { data, error } = await supabase.from('users').insert([{ username, password, role: role || 'مشاهد', enabled: true }]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, user: data[0] });
});

// UPDATE user password
app.put('/api/users/:id/password', async (req, res) => {
    const id = parseInt(req.params.id);
    const { error } = await supabase.from('users').update({ password: req.body.password }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// TOGGLE user
app.put('/api/users/:id/toggle', async (req, res) => {
    const id = parseInt(req.params.id);
    const { error } = await supabase.from('users').update({ enabled: req.body.enabled }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// DELETE user
app.delete('/api/users/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// STATS
app.get('/api/stats', async (req, res) => {
    const { data, error } = await supabase.from('vessels').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const total = data.length;
    const salih = data.filter(v => v.status === 'صالح').length;
    const mo3atab = data.filter(v => v.status === 'معطب').length;
    const siyana = data.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

// TICKETS
app.get('/api/tickets', async (req, res) => {
    const { data, error } = await supabase.from('tickets').select('*');
    res.json(data || []);
});

app.post('/api/tickets', async (req, res) => {
    const { data, error } = await supabase.from('tickets').insert([req.body]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// LOGS
app.get('/api/logs', async (req, res) => {
    const { data, error } = await supabase.from('logs').select('*');
    res.json(data || []);
});

// EXPORT
app.get('/api/export', async (req, res) => {
    const { data, error } = await supabase.from('vessels').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ vessels: data });
});

// IMPORT
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
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 Supabase connected`);
    console.log(`🔐 admin / 1234`);
});
