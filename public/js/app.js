// public/js/app.js
// ============================================================
// 📦 التطبيق الكامل - النسخة الأصلية + المساعد الذكي
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
// 📊 دوال تحميل البيانات (النماذج الأولية)
// ============================================================

function loadDashboard() {
    console.log('📊 Loading dashboard...');
    // يمكن إضافة كود dashboard هنا
}

function loadVessels() {
    console.log('🚢 Loading vessels...');
    // يمكن إضافة كود vessels هنا
}

function loadMaintenance() {
    console.log('🔧 Loading maintenance...');
    // يمكن إضافة كود maintenance هنا
}

function loadTickets() {
    console.log('🎫 Loading tickets...');
    // يمكن إضافة كود tickets هنا
}

function loadUsers() {
    console.log('👥 Loading users...');
    // يمكن إضافة كود users هنا
}

function loadNotes() {
    console.log('📝 Loading notes...');
    // يمكن إضافة كود notes هنا
}

function loadSessions() {
    console.log('🔄 Loading sessions...');
    // يمكن إضافة كود sessions هنا
}

function initMap() {
    console.log('🗺️ Initializing map...');
}

function initTrackingPage() {
    console.log('📍 Initializing tracking...');
}

// ============================================================
// 🧠 المساعد الذكي - AI ASSISTANT
// ============================================================

const API_BASE = '/api/ai';
let conversationId = null;
let isProcessing = false;
let isListening = false;
let recognition = null;
let lastResponse = null;

async function askAI(message) {
    const chatInput = document.getElementById('chatInput');
    const chatBox = document.getElementById('chatBox');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    
    if (!chatInput) {
        console.error('❌ chatInput not found');
        return;
    }
    
    const question = message || chatInput.value.trim();
    
    if (!question) {
        showToast('❌ الرجاء كتابة سؤال', 'error');
        return;
    }
    
    if (isProcessing) {
        showToast('⏳ جاري معالجة طلب سابق...', 'warning');
        return;
    }
    
    addAIMessage('user', question, chatBox);
    chatInput.value = '';
    chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    isProcessing = true;
    showTypingAI(true, typingIndicator);
    
    try {
        const token = localStorage.getItem('authToken') || null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        
        const response = await fetch(`${API_BASE}/ask`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                message: question,
                conversationId: conversationId,
                language: 'ar'
            })
        });
        
        showTypingAI(false, typingIndicator);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `خطأ ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            conversationId = data.conversationId;
            lastResponse = data.response;
            addAIMessage('ai', data.response, chatBox);
        } else {
            throw new Error(data.error || 'حدث خطأ غير معروف');
        }
        
    } catch (error) {
        showTypingAI(false, typingIndicator);
        console.error('❌ AI Error:', error);
        addAIMessage('ai', `⚠️ عذراً، حدث خطأ: ${error.message}`, chatBox);
    }
    
    isProcessing = false;
    chatInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    chatInput.focus();
}

function addAIMessage(role, content, chatBox) {
    if (!chatBox) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const sender = role === 'user' ? '👤 أنت' : '🤖 المساعد الذكي';
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    
    let formattedContent = content.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${formattedContent}</div>
        <div class="time">${time}</div>
        ${role === 'ai' ? `
            <div class="actions">
                <button onclick="copyAIMessage(this)">📋 نسخ</button>
                <button onclick="speakTextFromBtn(this)">🔊 استماع</button>
            </div>
        ` : ''}
    `;
    
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function copyAIMessage(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    navigator.clipboard.writeText(content).then(() => {
        const original = btn.textContent;
        btn.textContent = '✅ تم النسخ';
        setTimeout(() => btn.textContent = original, 1500);
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(btn.closest('.message').querySelector('.content'));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        const original = btn.textContent;
        btn.textContent = '✅ تم النسخ';
        setTimeout(() => btn.textContent = original, 1500);
    });
}

function speakTextFromBtn(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    speakTextAI(content);
}

function speakTextAI(text) {
    if (!('speechSynthesis' in window)) {
        showToast('❌ المتصفح لا يدعم النطق', 'error');
        return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

function speakLastResponse() {
    if (lastResponse) {
        speakTextAI(lastResponse);
        return;
    }
    
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        const messages = chatBox.querySelectorAll('.message.ai');
        if (messages.length > 0) {
            const last = messages[messages.length - 1];
            const content = last.querySelector('.content');
            if (content) {
                speakTextAI(content.textContent);
                return;
            }
        }
    }
    showToast('لا يوجد رد للاستماع', 'warning');
}

function toggleVoiceInput() {
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
    if (!hasSpeechRecognition) {
        showToast('❌ استخدم Chrome للميكروفون', 'error');
        return;
    }
    
    if (isListening) {
        stopVoiceInput();
        return;
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
            voiceStatus.innerHTML = '🎤 جاري الاستماع... تحدث الآن';
        }
        document.getElementById('chatInput').placeholder = '🎤 استمع...';
    };
    
    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                document.getElementById('chatInput').value = transcript;
                const voiceStatus = document.getElementById('voiceStatus');
                if (voiceStatus) {
                    voiceStatus.innerHTML = `✅ تم التعرف: "${transcript}"`;
                }
                setTimeout(() => {
                    if (transcript.trim()) {
                        askAI();
                    }
                }, 500);
            } else {
                document.getElementById('chatInput').value = transcript;
                const voiceStatus = document.getElementById('voiceStatus');
                if (voiceStatus) {
                    voiceStatus.innerHTML = `✍️ ${transcript}`;
                }
            }
        }
    };
    
    recognition.onerror = function(event) {
        console.warn('Voice error:', event.error);
        if (event.error === 'not-allowed') {
            showToast('❌ الرجاء السماح باستخدام الميكروفون', 'error');
        } else if (event.error === 'no-speech') {
            showToast('⏳ لم يتم سماع صوت، حاول مرة أخرى', 'warning');
        }
        stopVoiceInput();
    };
    
    recognition.onend = function() {
        stopVoiceInput();
    };
    
    recognition.start();
}

function stopVoiceInput() {
    isListening = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.textContent = '🎤';
    }
    const voiceStatus = document.getElementById('voiceStatus');
    if (voiceStatus) {
        voiceStatus.classList.remove('active');
        voiceStatus.innerHTML = '';
    }
    document.getElementById('chatInput').placeholder = 'اكتب سؤالك هنا...';
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

function showTypingAI(show, indicator) {
    if (!indicator) indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.classList.toggle('active', show);
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
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
        
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message ai';
        welcomeDiv.innerHTML = `
            <div class="sender">🤖 المساعد الذكي</div>
            <div class="content">👋 مرحباً! تم مسح المحادثة.<br><br>💬 اكتب سؤالك أو استخدم الأزرار السريعة!</div>
            <div class="time">الآن</div>
        `;
        chatBox.appendChild(welcomeDiv);
        
        showToast('🗑️ تم مسح المحادثة', 'info');
    }
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function initAIAssistant() {
    console.log('🤖 AI Assistant initializing...');
    checkHealthAI();
    
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            askAI();
        }
        if (e.key === 'Escape' && isListening) {
            stopVoiceInput();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            toggleVoiceInput();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            speakLastResponse();
        }
    });
    
    console.log('✅ AI Assistant ready!');
}

async function checkHealthAI() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Server healthy:', data);
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            if (statusDot) statusDot.className = 'status-dot';
            if (statusText) statusText.textContent = 'متصل';
        }
    } catch (error) {
        console.warn('⚠️ Cannot connect to server');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        if (statusDot) statusDot.className = 'status-dot offline';
        if (statusText) statusText.textContent = 'غير متصل';
    }
}

// ============================================================
// 🔄 EXPOSE FUNCTIONS TO GLOBAL
// ============================================================

// دوال التطبيق الأساسية
window.doLogin = doLogin;
window.loadPage = loadPage;
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.logout = logout;
window.updatePermissions = updatePermissions;

// دوال تحميل البيانات
window.loadDashboard = loadDashboard;
window.loadVessels = loadVessels;
window.loadMaintenance = loadMaintenance;
window.loadTickets = loadTickets;
window.loadUsers = loadUsers;
window.loadNotes = loadNotes;
window.loadSessions = loadSessions;
window.initMap = initMap;
window.initTrackingPage = initTrackingPage;

// دوال المساعد الذكي
window.askAI = askAI;
window.toggleVoiceInput = toggleVoiceInput;
window.speakLastResponse = speakLastResponse;
window.clearChat = clearChat;
window.copyAIMessage = copyAIMessage;
window.speakTextFromBtn = speakTextFromBtn;
window.initAIAssistant = initAIAssistant;

// ============================================================
// 🚀 رسالة التشغيل
// ============================================================

console.log('✅ التطبيق جاهز!');
console.log('📝 استخدم admin / 123456 للدخول');
console.log('📌 الصفحات المتاحة: dashboard, fleet, maintenance, efficiency, support, users, notes, sessions, map, tracking, ai-assistant');
console.log('🤖 دوال المساعد الذكي: askAI(), toggleVoiceInput(), speakLastResponse(), clearChat()');
console.log('👨‍💻 تم التطوير بواسطة: المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي');
