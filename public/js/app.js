// public/js/app.js
// ============================================================
// 🤖 AI ASSISTANT - MAIN APPLICATION v23
// ============================================================

console.log('✅ App loaded');

// ============================================================
// 🔧 CONFIGURATION
// ============================================================
const API_BASE = '/api/ai';
let conversationId = null;
let isProcessing = false;
let isListening = false;
let recognition = null;
let lastResponse = null;

// ============================================================
// 🚀 DOM REFS
// ============================================================
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const speakerBtn = document.getElementById('speakerBtn');
const typingIndicator = document.getElementById('typingIndicator');
const voiceStatus = document.getElementById('voiceStatus');
const voiceStatusText = document.getElementById('voiceStatusText');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

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
        headers['Authorization'] = 'Bearer ' + token;
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
    typingIndicator.classList.toggle('active', show);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function setOnline(online) {
    if (online) {
        statusDot.className = 'dot';
        statusText.textContent = 'متصل';
    } else {
        statusDot.className = 'dot offline';
        statusText.textContent = 'غير متصل';
    }
}

function showToast(msg, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
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
                <button onclick="copyMessage(this)">📋 نسخ</button>
                <button onclick="speakTextFromBtn(this)">🔊 استماع</button>
            </div>
        ` : ''}
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function copyMessage(btn) {
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

// ============================================================
// 🎤 VOICE INPUT
// ============================================================
const hasSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
const hasSynth = 'speechSynthesis' in window;

console.log('🎤 Speech:', hasSpeech ? '✅' : '❌');
console.log('🔊 Speech Synthesis:', hasSynth ? '✅' : '❌');

if (!hasSpeech) {
    micBtn.className = 'btn btn-mic unsupported';
    micBtn.title = 'المتصفح لا يدعم الميكروفون';
}

if (!hasSynth) {
    speakerBtn.className = 'btn btn-speaker unsupported';
    speakerBtn.title = 'المتصفح لا يدعم النطق';
}

function initSpeech() {
    if (!hasSpeech) return false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = function() {
        isListening = true;
        micBtn.classList.add('listening');
        micBtn.textContent = '⏹️';
        voiceStatus.classList.add('active');
        voiceStatusText.textContent = '🎤 جاري الاستماع...';
        chatInput.placeholder = '🎤 استمع...';
        showToast('🎤 جاري الاستماع...', 'info');
    };

    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                chatInput.value = transcript;
                voiceStatusText.textContent = '✅ تم التعرف: "' + transcript + '"';
                setTimeout(() => {
                    if (transcript.trim()) askAI();
                }, 500);
            } else {
                chatInput.value = transcript;
                voiceStatusText.textContent = '✍️ ' + transcript;
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
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
    voiceStatus.classList.remove('active');
    chatInput.placeholder = 'اكتب سؤالك هنا...';
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
}

// ============================================================
// 🔊 SPEECH OUTPUT
// ============================================================
let synth = null;

function initSynth() {
    if (!hasSynth) return false;
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
        speakerBtn.textContent = '⏹️';
        speakerBtn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
    };
    utterance.onend = function() {
        speakerBtn.textContent = '🔊';
        speakerBtn.style.background = '';
    };
    utterance.onerror = function() {
        speakerBtn.textContent = '🔊';
        speakerBtn.style.background = '';
    };
    synth.speak(utterance);
}

function speakLast() {
    if (lastResponse) { speakText(lastResponse); return; }
    const msgs = chatBox.querySelectorAll('.message.ai');
    if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        const content = last.querySelector('.content');
        if (content) { speakText(content.textContent); return; }
    }
    showToast('لا يوجد رد للاستماع', 'warning');
}

// ============================================================
// 🤖 ASK AI
// ============================================================
async function askAI(message) {
    const input = chatInput;
    const question = message || input.value.trim();
    if (!question) { showToast('❌ الرجاء كتابة سؤال', 'error'); return; }
    if (isProcessing) { showToast('⏳ جاري معالجة طلب سابق...', 'warning'); return; }

    addMessage('user', question);
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    isProcessing = true;
    showTyping(true);

    try {
        const response = await fetch(API_BASE + '/ask', {
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
            throw new Error(error.error || 'خطأ ' + response.status);
        }

        const data = await response.json();

        if (data.success) {
            conversationId = data.conversationId;
            lastResponse = data.response;
            addMessage('ai', data.response);
            setOnline(true);
        } else {
            throw new Error(data.error || 'حدث خطأ غير معروف');
        }

    } catch (error) {
        showTyping(false);
        setOnline(false);
        addMessage('ai', '⚠️ عذراً، حدث خطأ: ' + error.message);
        console.error('AI Error:', error);
    }

    isProcessing = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
}

// ============================================================
// 🗑️ CLEAR CHAT
// ============================================================
function clearChat() {
    if (chatBox.querySelectorAll('.message').length === 0) return;
    if (confirm('هل أنت متأكد من مسح المحادثة؟')) {
        chatBox.innerHTML = '';
        conversationId = null;
        lastResponse = null;
        addMessage('ai', '👋 مرحباً! تم مسح المحادثة.\n\n💬 اكتب سؤالك أو استخدم الأزرار السريعة!');
        showToast('🗑️ تم مسح المحادثة', 'info');
    }
}

// ============================================================
// 📂 UPLOAD FILE
// ============================================================
async function uploadFile() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) { showToast('❌ الرجاء اختيار ملف', 'error'); return; }

    const uploadBtn = document.getElementById('uploadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    uploadBtn.disabled = true;
    uploadStatus.className = 'upload-status show info';
    uploadStatus.textContent = '⏳ جاري رفع الملف...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(API_BASE + '/upload', {
            method: 'POST',
            headers: { 'Authorization': getHeaders()['Authorization'] || '' },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'خطأ ' + response.status);
        }

        const data = await response.json();
        uploadStatus.className = 'upload-status show success';
        uploadStatus.textContent = '✅ تم رفع واستيراد ' + (data.count || 0) + ' سجل';
        showToast('✅ تم استيراد البيانات', 'success');

    } catch (error) {
        uploadStatus.className = 'upload-status show error';
        uploadStatus.textContent = '❌ ' + error.message;
        showToast('❌ ' + error.message, 'error');
    }

    uploadBtn.disabled = false;
}

// ============================================================
// ⌨️ KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); askAI(); }
    if (e.key === 'Escape' && isListening) { stopVoice(); }
    if (e.ctrlKey && e.shiftKey && e.key === 'V') { e.preventDefault(); toggleVoice(); }
    if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); speakLast(); }
});

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================
async function checkHealth() {
    try {
        const response = await fetch(API_BASE + '/health');
        if (response.ok) {
            const data = await response.json();
            setOnline(true);
            console.log('✅ Server healthy:', data);
        } else {
            setOnline(false);
        }
    } catch (error) {
        setOnline(false);
        console.warn('⚠️ Cannot connect to server');
    }
}

// ============================================================
// 🚀 INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initSpeech();
    initSynth();
    if (synth) {
        synth.getVoices();
        synth.onvoiceschanged = function() { synth.getVoices(); };
    }
    checkHealth();
    console.log('✅ AI Assistant v23 loaded');
    console.log('🎤 Speech:', hasSpeech ? '✅' : '❌');
    console.log('🔊 Speech Synthesis:', hasSynth ? '✅' : '❌');
    console.log('📌 Shortcuts: Ctrl+Enter, Ctrl+Shift+V, Ctrl+Shift+S');
});

// ============================================================
// 🧹 CLEANUP
// ============================================================
window.addEventListener('beforeunload', function() {
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
    }
    if (synth) { synth.cancel(); }
});

console.log('🚀 AI Assistant v23 loaded');
console.log('📌 Functions: askAI(), toggleVoice(), speakLast(), clearChat()');
