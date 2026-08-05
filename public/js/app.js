// public/js/app.js
// ============================================================
// 📦 التطبيق الرئيسي + المساعد الذكي
// ============================================================

console.log('✅ App loaded');

// ============================================================
// 🔐 دوال تسجيل الدخول
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    
    localStorage.clear();
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    if (username) username.value = '';
    if (password) password.value = '';
    
    if (password) {
        password.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }
    if (username) {
        username.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (password) password.focus();
            }
        });
    }
});

// ============================================================
// 🔐 دالة تسجيل الدخول
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    const loginError = document.getElementById('loginError');
    
    if (!username || !password) {
        if (loginError) {
            loginError.textContent = '❌ الرجاء إدخال اسم المستخدم وكلمة المرور';
            loginError.style.display = 'block';
        }
        return;
    }
    
    const validUsers = {
        'admin': { password: '123456', role: 'مسؤول', name: 'مدير النظام' },
        'north': { password: '123456', role: 'محرر إقليمي', name: 'محرر الشمال' },
        'coast': { password: '123456', role: 'محرر إقليمي', name: 'محرر الساحل' },
        'center': { password: '123456', role: 'محرر إقليمي', name: 'محرر الوسط' },
        'south': { password: '123456', role: 'محرر إقليمي', name: 'محرر الجنوب' },
        'viewer': { password: '123456', role: 'مشاهد', name: 'مشاهد' }
    };
    
    if (validUsers[username] && validUsers[username].password === password) {
        const user = validUsers[username];
        localStorage.setItem('authToken', 'demo-token-' + username);
        localStorage.setItem('user', JSON.stringify({ 
            username: username, 
            role: user.role, 
            name: user.name 
        }));
        
        const loginOverlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        loadPage('dashboard');
        
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) userNameDisplay.textContent = user.name + ' (' + user.role + ')';
        
        updatePermissions(user.role);
        
        if (loginError) loginError.style.display = 'none';
    } else {
        if (loginError) {
            loginError.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة';
            loginError.style.display = 'block';
        }
    }
}

function updatePermissions(role) {
    const adminButtons = document.querySelectorAll('.admin-only');
    const editorButtons = document.querySelectorAll('.editor-only');
    const techButtons = document.querySelectorAll('.tech-only');
    
    if (role === 'مسؤول') {
        adminButtons.forEach(el => el.style.display = '');
        editorButtons.forEach(el => el.style.display = '');
        techButtons.forEach(el => el.style.display = '');
    } else if (role === 'محرر إقليمي') {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = '');
        techButtons.forEach(el => el.style.display = '');
    } else if (role === 'فني صيانة') {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = 'none');
        techButtons.forEach(el => el.style.display = '');
    } else {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = 'none');
        techButtons.forEach(el => el.style.display = 'none');
    }
}

// ============================================================
// 📄 دوال تحميل الصفحات
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    document.querySelectorAll('.page-content').forEach(el => el.remove());
    
    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) throw new Error(`Page ${pageName} not found`);
            return res.text();
        })
        .then(html => {
            const div = document.createElement('div');
            div.className = 'page-content';
            div.id = 'page-' + pageName;
            div.innerHTML = html;
            container.appendChild(div);
            
            setTimeout(() => {
                initPage(pageName);
            }, 100);
        })
        .catch(err => {
            console.error('Error:', err);
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#f87171;">
                    ❌ خطأ في تحميل الصفحة: ${pageName}
                    <br><small>${err.message}</small>
                </div>
            `;
        });
}

function initPage(pageName) {
    console.log('📄 Initializing page:', pageName);
    switch(pageName) {
        case 'dashboard': 
            if (typeof loadDashboard === 'function') loadDashboard(); 
            break;
        case 'fleet': 
            if (typeof loadVessels === 'function') loadVessels(); 
            break;
        case 'maintenance': 
            if (typeof loadMaintenance === 'function') loadMaintenance(); 
            break;
        case 'efficiency': 
            if (typeof loadVessels === 'function') loadVessels(); 
            break;
        case 'support': 
            if (typeof loadTickets === 'function') loadTickets(); 
            break;
        case 'users': 
            if (typeof loadUsers === 'function') loadUsers(); 
            break;
        case 'notes': 
            if (typeof loadNotes === 'function') loadNotes(); 
            break;
        case 'sessions': 
            if (typeof loadSessions === 'function') loadSessions(); 
            break;
        case 'map': 
            if (typeof initMap === 'function') initMap(); 
            break;
        case 'tracking': 
            if (typeof initTrackingPage === 'function') initTrackingPage(); 
            break;
        case 'ai-assistant': 
            if (typeof initAIAssistant === 'function') initAIAssistant(); 
            break;
        default: 
            console.log('⚠️ Unknown page:', pageName);
    }
}

function showPage(pageName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.nav-btn');
    const pageMap = {
        'dashboard': 0, 'fleet': 1, 'maintenance': 2, 'efficiency': 3,
        'support': 4, 'tracking': 5, 'map': 6, 'users': 7, 'notes': 8, 
        'sessions': 9, 'ai-assistant': 10
    };
    if (pageMap[pageName] !== undefined && btns[pageMap[pageName]]) {
        btns[pageMap[pageName]].classList.add('active');
    }
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 992) {
        sidebar.classList.remove('open');
    }
    loadPage(pageName);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

// ============================================================
// 📊 دوال تحميل البيانات
// ============================================================

function loadDashboard() {
    console.log('📊 Loading dashboard...');
}

function loadVessels() {
    console.log('🚢 Loading vessels...');
}

function loadMaintenance() {
    console.log('🔧 Loading maintenance...');
}

function loadTickets() {
    console.log('🎫 Loading tickets...');
}

function loadUsers() {
    console.log('👥 Loading users...');
}

function loadNotes() {
    console.log('📝 Loading notes...');
}

function loadSessions() {
    console.log('🔄 Loading sessions...');
}

function initMap() {
    console.log('🗺️ Initializing map...');
}

function initTrackingPage() {
    console.log('📍 Initializing tracking...');
}

// ============================================================
// 🤖 AI ASSISTANT - مع دعم كامل للـ API
// ============================================================

const API_BASE = '/api/ai';
let conversationId = null;
let isProcessing = false;
let isListening = false;
let recognition = null;
let lastResponse = null;

function initAIAssistant() {
    console.log('🤖 Initializing AI Assistant...');
    
    // تهيئة الأزرار في صفحة المساعد
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');
    const micBtn = document.getElementById('micBtn');
    const speakerBtn = document.getElementById('speakerBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            askAI();
        });
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    }
    
    if (micBtn) {
        micBtn.addEventListener('click', function() {
            toggleVoice();
        });
    }
    
    if (speakerBtn) {
        speakerBtn.addEventListener('click', function() {
            speakLast();
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            clearChat();
        });
    }
    
    // التحقق من صحة الخادم
    checkHealth();
    
    console.log('✅ AI Assistant ready!');
}

// ============================================================
// 💬 AI FUNCTIONS
// ============================================================

async function askAI(message) {
    const chatInput = document.getElementById('chatInput');
    const chatBox = document.getElementById('chatBox');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    
    if (!chatInput) return;
    
    const question = message || chatInput.value.trim();
    if (!question) {
        showToast('❌ الرجاء كتابة سؤال', 'error');
        return;
    }
    
    if (isProcessing) {
        showToast('⏳ جاري معالجة طلب سابق...', 'warning');
        return;
    }
    
    addAIMessage('user', question);
    chatInput.value = '';
    chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    isProcessing = true;
    showTypingAI(true);
    
    try {
        const token = localStorage.getItem('authToken') || null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        
        const response = await fetch(API_BASE + '/ask', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                message: question,
                conversationId: conversationId,
                language: 'ar'
            })
        });
        
        showTypingAI(false);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'خطأ ' + response.status);
        }
        
        const data = await response.json();
        
        if (data.success) {
            conversationId = data.conversationId;
            lastResponse = data.response;
            addAIMessage('ai', data.response);
            setOnlineStatus(true);
        } else {
            throw new Error(data.error || 'حدث خطأ غير معروف');
        }
        
    } catch (error) {
        showTypingAI(false);
        setOnlineStatus(false);
        addAIMessage('ai', '⚠️ عذراً، حدث خطأ: ' + error.message);
        console.error('AI Error:', error);
    }
    
    isProcessing = false;
    chatInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    chatInput.focus();
}

function addAIMessage(role, content, timestamp = new Date()) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    
    const div = document.createElement('div');
    div.className = 'message ' + role;
    const sender = role === 'user' ? '👤 أنت' : '🤖 المساعد الذكي';
    let formatted = escapeHtml(content).replace(/\n/g, '<br>');
    div.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${formatted}</div>
        <div class="time">${formatTime(timestamp)}</div>
        ${role === 'ai' ? `
            <div class="actions">
                <button onclick="copyAIMessage(this)">📋 نسخ</button>
                <button onclick="speakTextFromBtn(this)">🔊 استماع</button>
            </div>
        ` : ''}
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function copyAIMessage(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    navigator.clipboard.writeText(content).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✅ تم النسخ';
        setTimeout(() => btn.textContent = orig, 1500);
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(btn.closest('.message').querySelector('.content'));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        const orig = btn.textContent;
        btn.textContent = '✅ تم النسخ';
        setTimeout(() => btn.textContent = orig, 1500);
    });
}

function speakTextFromBtn(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    speakText(content);
}

function showTypingAI(show) {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.classList.toggle('active', show);
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function setOnlineStatus(online) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (statusDot && statusText) {
        if (online) {
            statusDot.className = 'dot';
            statusText.textContent = 'متصل';
        } else {
            statusDot.className = 'dot offline';
            statusText.textContent = 'غير متصل';
        }
    }
}

function clearChat() {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    if (chatBox.querySelectorAll('.message').length === 0) return;
    if (confirm('هل أنت متأكد من مسح المحادثة؟')) {
        chatBox.innerHTML = '';
        conversationId = null;
        lastResponse = null;
        addAIMessage('ai', '👋 مرحباً! تم مسح المحادثة.\n\n💬 اكتب سؤالك أو استخدم الأزرار السريعة!');
        showToast('🗑️ تم مسح المحادثة', 'info');
    }
}

// ============================================================
// 🎤 VOICE INPUT
// ============================================================

const hasSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
const hasSynth = 'speechSynthesis' in window;

function initSpeech() {
    if (!hasSpeech) {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.className = 'btn btn-mic unsupported';
            micBtn.title = 'المتصفح لا يدعم الميكروفون';
        }
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.classList.add('listening');
            micBtn.textContent = '⏹️';
        }
        const voiceStatus = document.getElementById('voiceStatus');
        if (voiceStatus) {
            voiceStatus.classList.add('active');
            voiceStatus.textContent = '🎤 جاري الاستماع...';
        }
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.placeholder = '🎤 استمع...';
        showToast('🎤 جاري الاستماع...', 'info');
    };

    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                const chatInput = document.getElementById('chatInput');
                const voiceStatus = document.getElementById('voiceStatus');
                if (chatInput) chatInput.value = transcript;
                if (voiceStatus) voiceStatus.textContent = '✅ تم التعرف: "' + transcript + '"';
                setTimeout(() => {
                    if (transcript.trim()) askAI();
                }, 500);
            } else {
                const chatInput = document.getElementById('chatInput');
                const voiceStatus = document.getElementById('voiceStatus');
                if (chatInput) chatInput.value = transcript;
                if (voiceStatus) voiceStatus.textContent = '✍️ ' + transcript;
            }
        }
    };

    recognition.onerror = function(event) {
        console.warn('Voice error:', event.error);
        if (event.error === 'not-allowed') {
            showToast('❌ الرجاء السماح بالميكروفون', 'error');
        } else if (event.error === 'no-speech') {
            showToast('⏳ لم يتم سماع صوت', 'warning');
        }
        stopVoice();
    };

    recognition.onend = function() {
        stopVoice();
    };

    return true;
}

function toggleVoice() {
    if (!recognition) {
        if (!initSpeech()) {
            showToast('❌ المتصفح لا يدعم الميكروفون', 'error');
            return;
        }
    }
    if (isListening) {
        stopVoice();
    } else {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => startVoice())
                .catch(() => showToast('❌ الرجاء السماح بالميكروفون', 'error'));
        } else {
            startVoice();
        }
    }
}

function startVoice() {
    if (!recognition) return;
    try { recognition.start(); } catch (e) {
        if (e.message.includes('already started')) {
            stopVoice();
            setTimeout(() => startVoice(), 200);
        }
    }
}

function stopVoice() {
    isListening = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.textContent = '🎤';
    }
    const voiceStatus = document.getElementById('voiceStatus');
    if (voiceStatus) {
        voiceStatus.classList.remove('active');
    }
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.placeholder = 'اكتب سؤالك هنا...';
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
}

// ============================================================
// 🔊 SPEECH OUTPUT
// ============================================================

let synth = null;

function initSynth() {
    if (!hasSynth) {
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.className = 'btn btn-speaker unsupported';
            speakerBtn.title = 'المتصفح لا يدعم النطق';
        }
        return false;
    }
    synth = window.speechSynthesis;
    return true;
}

function speakText(text) {
    if (!synth) {
        if (!initSynth()) {
            showToast('❌ المتصفح لا يدعم النطق', 'error');
            return;
        }
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    const voices = synth.getVoices();
    const arabic = voices.find(v => v.lang.includes('ar'));
    if (arabic) utterance.voice = arabic;
    utterance.onstart = function() {
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.textContent = '⏹️';
            speakerBtn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
        }
    };
    utterance.onend = function() {
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.textContent = '🔊';
            speakerBtn.style.background = '';
        }
    };
    utterance.onerror = function() {
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.textContent = '🔊';
            speakerBtn.style.background = '';
        }
    };
    synth.speak(utterance);
}

function speakLast() {
    if (lastResponse) { speakText(lastResponse); return; }
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        const msgs = chatBox.querySelectorAll('.message.ai');
        if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            const content = last.querySelector('.content');
            if (content) { speakText(content.textContent); return; }
        }
    }
    showToast('لا يوجد رد للاستماع', 'warning');
}

// ============================================================
// 🍞 TOAST
// ============================================================

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

async function checkHealth() {
    try {
        const response = await fetch(API_BASE + '/health');
        if (response.ok) {
            const data = await response.json();
            setOnlineStatus(true);
            console.log('✅ Server healthy:', data);
        } else {
            setOnlineStatus(false);
        }
    } catch (error) {
        setOnlineStatus(false);
        console.warn('⚠️ Cannot connect to server');
    }
}

// ============================================================
// 🚀 EXPOSE FUNCTIONS
// ============================================================

window.askAI = askAI;
window.toggleVoice = toggleVoice;
window.speakLast = speakLast;
window.clearChat = clearChat;
window.initAIAssistant = initAIAssistant;
window.doLogin = doLogin;
window.loadPage = loadPage;
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.logout = logout;

console.log('✅ التطبيق جاهز!');
console.log('👑 admin / 123456');
console.log('🤖 دوال المساعد: askAI(), toggleVoice(), speakLast(), clearChat()');
