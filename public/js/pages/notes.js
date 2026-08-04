// ============================================================
// المذكرات - notes.js
// ============================================================

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
        <div style="background:rgba(255,255,255,0.02); padding:12px 16px; margin:8px 0; border-radius:8px; border-right:3px solid #60a5fa; transition:all 0.3s; cursor:pointer;">
            <h4 style="color:rgba(255,255,255,0.8); margin:0; font-size:14px;">${n.title}</h4>
            <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${n.content}</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-size:11px; color:rgba(255,255,255,0.2);">👤 ${n.createdBy || 'مجهول'}</span>
                <span style="font-size:11px; color:rgba(255,255,255,0.15);">📅 ${n.date || ''}</span>
            </div>
        </div>
    `).join('');
}

console.log('✅ notes.js loaded');
