// public/js/app.js
// ============================================================
// 🤖 إضافة دالة المساعد الذكي إلى التطبيق الحالي
// ============================================================

console.log('✅ App loaded');

// ============================================================
// 🧠 AI ASSISTANT FUNCTIONS - تضاف إلى التطبيق الحالي
// ============================================================

const API_BASE = '/api/ai';
let conversationId = null;
let isProcessing = false;
let isListening = false;
let recognition = null;
let lastResponse = null;

// ============================================================
// 💬 ASK AI - الدالة الرئيسية
// ============================================================
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
        alert('❌ الرجاء كتابة سؤال');
        return;
    }
    
    if (isProcessing) {
        alert('⏳ جاري معالجة طلب سابق...');
        return;
    }
    
    // إضافة رسالة المستخدم
    addMessage('user', question, chatBox);
    chatInput.value = '';
    chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    isProcessing = true;
    showTyping(true, typingIndicator);
    
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
        
        showTyping(false, typingIndicator);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `خطأ ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            conversationId = data.conversationId;
            lastResponse = data.response;
            addMessage('ai', data.response, chatBox);
        } else {
            throw new Error(data.error || 'حدث خطأ غير معروف');
        }
        
    } catch (error) {
        showTyping(false, typingIndicator);
        console.error('❌ AI Error:', error);
        addMessage('ai', `⚠️ عذراً، حدث خطأ: ${error.message}`, chatBox);
    }
    
    isProcessing = false;
    chatInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    chatInput.focus();
}

// ============================================================
// 💬 ADD MESSAGE - إضافة رسالة إلى الشات
// ============================================================
function addMessage(role, content, chatBox) {
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
                <button onclick="copyMessage(this)">📋 نسخ</button>
                <button onclick="speakTextFromBtn(this)">🔊 استماع</button>
            </div>
        ` : ''}
    `;
    
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ============================================================
// 📋 COPY MESSAGE
// ============================================================
function copyMessage(btn) {
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

// ============================================================
// 🔊 SPEAK TEXT - نطق النص
// ============================================================
function speakTextFromBtn(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    speakText(content);
}

function speakText(text) {
    if (!('speechSynthesis' in window)) {
        alert('❌ المتصفح لا يدعم النطق');
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
        speakText(lastResponse);
        return;
    }
    
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        const messages = chatBox.querySelectorAll('.message.ai');
        if (messages.length > 0) {
            const last = messages[messages.length - 1];
            const content = last.querySelector('.content');
            if (content) {
                speakText(content.textContent);
                return;
            }
        }
    }
    alert('لا يوجد رد للاستماع');
}

// ============================================================
// 🎤 TOGGLE VOICE INPUT - تفعيل الميكروفون
// ============================================================
function toggleVoiceInput() {
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
    if (!hasSpeechRecognition) {
        alert('❌ المتصفح لا يدعم الميكروفون. استخدم Chrome.');
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
            alert('❌ الرجاء السماح بالوصول إلى الميكروفون');
        } else if (event.error === 'no-speech') {
            alert('⏳ لم يتم سماع صوت، حاول مرة أخرى');
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

// ============================================================
// 🌀 TYPING INDICATOR
// ============================================================
function showTyping(show, indicator) {
    if (!indicator) indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.classList.toggle('active', show);
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// ============================================================
// 🗑️ CLEAR CHAT
// ============================================================
function clearChat() {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    
    if (chatBox.querySelectorAll('.message').length === 0) return;
    
    if (confirm('هل أنت متأكد من مسح المحادثة؟')) {
        chatBox.innerHTML = '';
        conversationId = null;
        lastResponse = null;
        
        // إعادة رسالة الترحيب
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'message ai';
        welcomeDiv.innerHTML = `
            <div class="sender">🤖 المساعد الذكي</div>
            <div class="content">👋 مرحباً! تم مسح المحادثة.<br><br>💬 اكتب سؤالك أو استخدم الأزرار السريعة!</div>
            <div class="time">الآن</div>
        `;
        chatBox.appendChild(welcomeDiv);
        
        alert('🗑️ تم مسح المحادثة');
    }
}

// ============================================================
// 🏥 CHECK HEALTH
// ============================================================
async function checkHealth() {
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
// 🚀 INITIALIZE
// ============================================================
function initAIAssistant() {
    console.log('🤖 AI Assistant initializing...');
    checkHealth();
    
    // Keyboard shortcuts
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
    console.log('📌 Functions: askAI(), toggleVoiceInput(), speakLastResponse(), clearChat()');
}

// ============================================================
// 🔄 EXPOSE FUNCTIONS TO GLOBAL
// ============================================================
window.askAI = askAI;
window.toggleVoiceInput = toggleVoiceInput;
window.speakLastResponse = speakLastResponse;
window.clearChat = clearChat;
window.copyMessage = copyMessage;
window.speakTextFromBtn = speakTextFromBtn;
window.initAIAssistant = initAIAssistant;

// ============================================================
// 🧹 CLEANUP
// ============================================================
window.addEventListener('beforeunload', function() {
    if (recognition) {
        try { recognition.abort(); } catch(e) {}
    }
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
});

console.log('✅ AI Assistant functions loaded successfully!');
console.log('📌 استخدم admin / 123456 للدخول');
console.log('👨‍💻 تم التطوير بواسطة: المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي');
