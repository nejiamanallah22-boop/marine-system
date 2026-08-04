// public/js/app.js
// ============================================================
// 🤖 AI ASSISTANT - COMPLETE APPLICATION v6.5
// ============================================================

console.log('✅ App loaded');

// ============================================================
// 🔧 AI CONFIGURATION
// ============================================================
const API_BASE = '/api/ai';
let conversationId = null;
let isProcessing = false;
let isListening = false;
let recognition = null;
let lastResponse = null;

// ============================================================
// 🚀 DOM REFS - سيتم تعيينها بعد تحميل الصفحة
// ============================================================
let chatBox, chatInput, sendBtn, micBtn, speakerBtn;
let typingIndicator, voiceStatus, voiceStatusText, statusDot, statusText;

// ============================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================
function getToken() {
    return localStorage.getItem('authToken') || null;
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTyping(show) {
    if (typingIndicator) {
        typingIndicator.classList.toggle('active', show);
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function setOnlineStatus(online) {
    if (statusDot && statusText) {
        if (online) {
            statusDot.className = 'status-dot';
            statusText.textContent = 'متصل';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'غير متصل';
        }
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

// ============================================================
// 💬 CHAT FUNCTIONS
// ============================================================
function addMessage(role, content, timestamp = new Date()) {
    if (!chatBox) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const sender = role === 'user' ? '👤 أنت' : '🤖 المساعد الذكي';
    
    let formattedContent = escapeHtml(content);
    formattedContent = formattedContent.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${formattedContent}</div>
        <div class="time">${formatTime(timestamp)}</div>
        ${role === 'ai' ? `
            <div class="actions">
                <button class="copy-btn" onclick="copyMessage(this)">📋 نسخ</button>
                <button class="speak-btn" onclick="speakTextFromBtn(this)">🔊 استماع</button>
            </div>
        ` : ''}
    `;
    
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageDiv;
}

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

function speakTextFromBtn(btn) {
    const content = btn.closest('.message').querySelector('.content').textContent;
    speakText(content);
}

// ============================================================
// 🎤 SPEECH RECOGNITION (Voice Input)
// ============================================================
function initSpeechRecognition() {
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
    if (!hasSpeechRecognition) {
        if (micBtn) {
            micBtn.style.display = 'none';
        }
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = function() {
        isListening = true;
        if (micBtn) {
            micBtn.classList.add('listening');
            micBtn.textContent = '⏹️';
        }
        if (voiceStatus) {
            voiceStatus.classList.add('active');
            voiceStatusText.textContent = '🎤 جاري الاستماع... تحدث الآن';
        }
        if (chatInput) chatInput.placeholder = '🎤 استمع...';
        showToast('🎤 جاري الاستماع...', 'info');
    };
    
    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                if (chatInput) chatInput.value = transcript;
                if (voiceStatusText) voiceStatusText.textContent = `✅ تم التعرف: "${transcript}"`;
                setTimeout(() => {
                    if (transcript.trim()) {
                        askAI();
                    }
                }, 500);
            } else {
                if (chatInput) chatInput.value = transcript;
                if (voiceStatusText) voiceStatusText.textContent = `✍️ ${transcript}`;
            }
        }
    };
    
    recognition.onerror = function(event) {
        console.warn('Voice error:', event.error);
        if (event.error === 'not-allowed') {
            showToast('❌ الرجاء السماح بالوصول إلى الميكروفون', 'error');
        } else if (event.error === 'no-speech') {
            showToast('⏳ لم يتم سماع صوت، حاول مرة أخرى', 'warning');
        } else {
            showToast(`⚠️ خطأ في الصوت: ${event.error}`, 'error');
        }
        stopVoiceInput();
    };
    
    recognition.onend = function() {
        stopVoiceInput();
    };
    
    return true;
}

function toggleVoiceInput() {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            showToast('❌ المتصفح لا يدعم الميكروفون', 'error');
            return;
        }
    }
    
    if (isListening) {
        stopVoiceInput();
    } else {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => {
                    startVoiceInput();
                })
                .catch(() => {
                    showToast('❌ الرجاء السماح باستخدام الميكروفون', 'error');
                });
        } else {
            startVoiceInput();
        }
    }
}

function startVoiceInput() {
    if (!recognition) return;
    try {
        recognition.start();
    } catch (e) {
        if (e.message.includes('already started')) {
            stopVoiceInput();
            setTimeout(() => startVoiceInput(), 200);
        } else {
            console.error('Voice start error:', e);
            showToast('⚠️ خطأ في تشغيل الميكروفون', 'error');
        }
    }
}

function stopVoiceInput() {
    isListening = false;
    if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.textContent = '🎤';
    }
    if (voiceStatus) {
        voiceStatus.classList.remove('active');
    }
    if (chatInput) chatInput.placeholder = 'اكتب سؤالك هنا...';
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

// ============================================================
// 🔊 SPEECH SYNTHESIS (Voice Output)
// ============================================================
let speechSynth = null;

function initSpeechSynthesis() {
    const hasSpeechSynthesis = 'speechSynthesis' in window;
    if (!hasSpeechSynthesis) {
        if (speakerBtn) {
            speakerBtn.style.display = 'none';
        }
        return false;
    }
    speechSynth = window.speechSynthesis;
    return true;
}

function speakText(text) {
    if (!speechSynth) {
        if (!initSpeechSynthesis()) {
            showToast('❌ المتصفح لا يدعم النطق', 'error');
            return;
        }
    }
    
    speechSynth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    const voices = speechSynth.getVoices();
    const arabicVoice = voices.find(v => v.lang.includes('ar'));
    if (arabicVoice) {
        utterance.voice = arabicVoice;
    }
    
    utterance.onstart = function() {
        if (speakerBtn) {
            speakerBtn.textContent = '⏹️';
            speakerBtn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
        }
    };
    
    utterance.onend = function() {
        if (speakerBtn) {
            speakerBtn.textContent = '🔊';
            speakerBtn.style.background = '';
        }
    };
    
    utterance.onerror = function(e) {
        console.warn('Speech error:', e);
        if (speakerBtn) {
            speakerBtn.textContent = '🔊';
            speakerBtn.style.background = '';
        }
        showToast('⚠️ خطأ في النطق', 'error');
    };
    
    speechSynth.speak(utterance);
}

function speakLastResponse() {
    if (lastResponse) {
        speakText(lastResponse);
        return;
    }
    
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
    showToast('لا يوجد رد للاستماع', 'warning');
}

// ============================================================
// 🤖 ASK AI - MAIN FUNCTION
// ============================================================
async function askAI(message) {
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
    
    // إضافة رسالة المستخدم
    addMessage('user', question);
    chatInput.value = '';
    chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    isProcessing = true;
    showTyping(true);
    
    try {
        console.log(`📤 إرسال: ${question}`);
        
        const response = await fetch(`${API_BASE}/ask`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                message: question,
                conversationId: conversationId,
                language: 'ar'
            })
        });
        
        showTyping(false);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('❌ HTTP Error:', response.status, error);
            throw new Error(error.error || `خطأ ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ الرد:', data);
        
        if (data.success) {
            conversationId = data.conversationId;
            lastResponse = data.response;
            addMessage('ai', data.response);
            setOnlineStatus(true);
        } else {
            throw new Error(data.error || 'حدث خطأ غير معروف');
        }
        
    } catch (error) {
        showTyping(false);
        setOnlineStatus(false);
        console.error('❌ AI Error:', error);
        addMessage('ai', `⚠️ عذراً، حدث خطأ: ${error.message}`);
    }
    
    isProcessing = false;
    chatInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    chatInput.focus();
}

// ============================================================
// 🗑️ CLEAR CHAT
// ============================================================
function clearChat() {
    if (chatBox) {
        if (chatBox.querySelectorAll('.message').length === 0) return;
        
        if (confirm('هل أنت متأكد من مسح المحادثة؟')) {
            chatBox.innerHTML = '';
            conversationId = null;
            lastResponse = null;
            
            addMessage('ai', 
                '👋 مرحباً! تم مسح المحادثة.\n\n' +
                '💬 اكتب سؤالك أو استخدم الأزرار السريعة!'
            );
            
            showToast('🗑️ تم مسح المحادثة', 'info');
        }
    }
}

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            const data = await response.json();
            setOnlineStatus(true);
            console.log('✅ Server is healthy:', data);
            if (data.gemini && data.gemini.key === '✅ مفعل') {
                console.log('🤖 Gemini AI is ACTIVE!');
            }
        } else {
            setOnlineStatus(false);
            console.warn('⚠️ Server returned error:', response.status);
        }
    } catch (error) {
        setOnlineStatus(false);
        console.warn('⚠️ Cannot connect to server:', error.message);
    }
}

// ============================================================
// 🚀 INITIALIZE AI ASSISTANT
// ============================================================
function initAIAssistant() {
    console.log('🤖 Initializing AI Assistant...');
    
    // تعيين DOM REFS
    chatBox = document.getElementById('chatBox');
    chatInput = document.getElementById('chatInput');
    sendBtn = document.getElementById('sendBtn');
    micBtn = document.getElementById('micBtn');
    speakerBtn = document.getElementById('speakerBtn');
    typingIndicator = document.getElementById('typingIndicator');
    voiceStatus = document.getElementById('voiceStatus');
    voiceStatusText = document.getElementById('voiceStatusText');
    statusDot = document.getElementById('statusDot');
    statusText = document.getElementById('statusText');
    
    // تهيئة الصوت
    initSpeechRecognition();
    initSpeechSynthesis();
    
    // تحميل الأصوات
    if (speechSynth) {
        speechSynth.getVoices();
        speechSynth.onvoiceschanged = function() {
            speechSynth.getVoices();
        };
    }
    
    // التحقق من الصحة
    checkHealth();
    
    console.log('✅ AI Assistant initialized');
    console.log('📌 Functions: askAI(), toggleVoiceInput(), speakLastResponse(), clearChat()');
}

// ============================================================
// ⚡ KEYBOARD SHORTCUTS (Global)
// ============================================================
document.addEventListener('keydown', function(e) {
    // Ctrl+Enter لإرسال
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        askAI();
    }
    // Escape لإيقاف الميكروفون
    if (e.key === 'Escape' && isListening) {
        stopVoiceInput();
    }
    // Ctrl+Shift+V للصوت
    if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        toggleVoiceInput();
    }
    // Ctrl+Shift+S للنطق
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        speakLastResponse();
    }
});

// ============================================================
// 🔄 EXPOSE FUNCTIONS TO GLOBAL SCOPE (للوصول من HTML)
// ============================================================
window.askAI = askAI;
window.toggleVoiceInput = toggleVoiceInput;
window.speakLastResponse = speakLastResponse;
window.clearChat = clearChat;
window.copyMessage = copyMessage;
window.speakTextFromBtn = speakTextFromBtn;

// ============================================================
// 🧹 CLEANUP
// ============================================================
window.addEventListener('beforeunload', function() {
    if (recognition) {
        try {
            recognition.abort();
        } catch (e) {}
    }
    if (speechSynth) {
        speechSynth.cancel();
    }
});

console.log('🚀 AI Assistant v6.5 loaded successfully!');
console.log('📌 Functions available: askAI(), toggleVoiceInput(), speakLastResponse(), clearChat()');
