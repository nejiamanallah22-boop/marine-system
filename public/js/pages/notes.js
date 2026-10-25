// ============================================================
// المذكرات - notes.js (النسخة المحسنة)
// ============================================================

let allNotes = []; // تأكد من تعريف المتغير إذا لم يكن معرفاً في مكان آخر

function getToken() {
    // دالة مساعدة لجلب التوكن (افترض أنك تستخدمها في مكان آخر)
    return localStorage.getItem('marine_token') || localStorage.getItem('token') || localStorage.getItem('authToken') || null;
}

function loadNotes() {
    const token = getToken();
    if (!token) return;
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data || [];
        renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:rgba(255,255,255,0.2);">
                <i class="fas fa-sticky-note" style="font-size:24px; display:block; margin-bottom:8px; opacity:0.3;"></i>
                لا توجد مذكرات
            </div>
        `;
        return;
    }
    container.innerHTML = allNotes.map(n => `
        <div style="background:rgba(255,255,255,0.02); padding:12px 16px; margin:8px 0; border-radius:8px; border-right:3px solid #60a5fa; transition:all 0.3s;">
            <h4 style="color:rgba(255,255,255,0.8); margin:0; font-size:14px;">${n.title}</h4>
            <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${n.content}</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-size:11px; color:rgba(255,255,255,0.2);">👤 ${n.createdBy || 'مجهول'}</span>
                <span style="font-size:11px; color:rgba(255,255,255,0.15);">📅 ${n.date || ''}</span>
                <!-- زر الطباعة هنا (إذا كانت المذكرة تحتوي على ملف) -->
                ${n.fileId ? `<button onclick="printNoteDocument('${n._id}')" style="background:rgba(167,139,250,0.12); color:#a78bfa; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:11px;"><i class="fas fa-print"></i> طباعة</button>` : ''}
            </div>
        </div>
    `).join('');
}

// دالة الطباعة الآمنة
window.printNoteDocument = async function(id) {
    if (!id) return;
    // افترض أن الرابط هو /api/notes/verbale/:id/download بناءً على الكود السابق
    var url = '/api/notes/verbale/' + encodeURIComponent(id) + '/download';
    var win = window.open('', '_blank'); // فتح نافذة فارغة فوراً لتجنب حظر النوافذ المنبثقة
    
    if (win) {
        win.document.write('<div style="font-family:sans-serif;text-align:center;margin-top:50px;color:#333;">جاري تحميل الوثيقة للطباعة...</div>');
    }

    try {
        var token = getToken();
        var headers = { 'Accept': '*/*' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var res = await fetch(url, { headers: headers, credentials: 'include' });
        
        if (!res.ok) {
            throw new Error('فشل تحميل الملف: ' + res.status);
        }

        var blob = await res.blob();
        var blobUrl = URL.createObjectURL(blob);

        // فتح الملف في النافذة الجديدة
        win.location.href = blobUrl;
        
        // محاولة الطباعة بعد التحميل
        setTimeout(function() {
            try { win.print(); } catch(e) {}
        }, 1000);

    } catch (err) {
        if (win) {
            win.document.body.innerHTML = '<div style="color:red;text-align:center;margin-top:50px;font-family:sans-serif;">حدث خطأ: ' + err.message + '</div>';
        }
        alert('حدث خطأ: ' + err.message);
    }
};

console.log('✅ notes.js loaded with print feature');
