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

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username);
    
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    
    if (error || !user) {
        console.log('User not found:', error);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    if (user.password === password) {
        console.log('Login success for:', username);
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } else {
        console.log('Wrong password for:', username);
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

app.get('/api/vessels', async (req, res) => {
    const { data } = await supabase.from('vessels').select('*');
    res.json(data || []);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 Supabase connected`);
});
