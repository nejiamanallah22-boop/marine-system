// ============================================================
// استيراد الملفات - file-import.js
// ============================================================

// ===== استيراد المراكب =====

function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showUploadStatus('⚠️ الرجاء اختيار ملف أولاً', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    const allowedExtensions = ['xlsx', 'xls', 'csv', 'pdf'];
    if (!allowedExtensions.includes(fileExtension)) {
        showUploadStatus('❌ نوع الملف غير مدعوم. المدعوم: Excel, CSV, PDF', 'error');
        return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ جاري التحليل...';
    showUploadStatus('⏳ جاري قراءة الملف...', 'info');
    
    const reader = new FileReader();
    
    if (fileExtension === 'csv') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const data = parseCSV(text);
                handleImportedData(data, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة الملف: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file, 'UTF-8');
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                if (typeof XLSX === 'undefined') {
                    showUploadStatus('❌ مكتبة Excel غير محملة. يرجى تثبيت SheetJS', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = '📤 رفع واستيراد';
                    return;
                }
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                handleImportedData(jsonData, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة ملف Excel: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsArrayBuffer(file);
    } else if (fileExtension === 'pdf') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                parsePDF(text, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة ملف PDF: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file);
    }
}

function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        result.push(row);
    }
    return result;
}

function parsePDF(text, fileName) {
    const lines = text.split('\n');
    const data = [];
    let currentVessel = {};
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.includes('الاسم') || trimmed.includes('اسم المركب')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.name = parts[1].trim();
        } else if (trimmed.includes('الرقم') || trimmed.includes('رقم')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.num = parts[1].trim();
        } else if (trimmed.includes('الطول') || trimmed.includes('طول')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.len = parseFloat(parts[1].trim()) || 0;
        } else if (trimmed.includes('الفئة') || trimmed.includes('نوع')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.cat = parts[1].trim();
        } else if (trimmed.includes('الحالة') || trimmed.includes('الجاهزية')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.stat = parts[1].trim();
        } else if (trimmed.includes('المنطقة')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.reg = parts[1].trim();
        } else if (trimmed.includes('الميناء')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.port = parts[1].trim();
        } else if (trimmed.includes('الوحدة')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.supp = parts[1].trim();
        }
    }
    
    if (currentVessel.name) {
        data.push(currentVessel);
    }
    
    if (data.length === 0) {
        showUploadStatus('⚠️ لم يتم العثور على بيانات مراكب في ملف PDF', 'error');
        return;
    }
    
    handleImportedData(data, fileName);
}

function handleImportedData(data, fileName) {
    if (!data || data.length === 0) {
        showUploadStatus('⚠️ لم يتم العثور على بيانات في الملف', 'error');
        return;
    }
    
    importedData = data;
    importedFileName = fileName;
    
    const previewContainer = document.getElementById('dataPreview');
    const importedDataDiv = document.getElementById('importedData');
    
    if (previewContainer) {
        let html = '<table><thead><tr>';
        const headers = Object.keys(data[0]);
        headers.forEach(h => {
            html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        data.slice(0, 10).forEach(row => {
            html += '<tr>';
            headers.forEach(h => {
                html += `<td>${row[h] || '-'}</td>`;
            });
            html += '</tr>';
        });
        
        if (data.length > 10) {
            html += `<tr><td colspan="${headers.length}" style="text-align:center; color:rgba(255,255,255,0.2);">... و ${data.length - 10} سجل آخر</td></tr>`;
        }
        
        html += '</tbody></table>';
        previewContainer.innerHTML = html;
    }
    
    if (importedDataDiv) {
        importedDataDiv.classList.add('show');
    }
    
    showUploadStatus(`✅ تم استيراد ${data.length} سجل من ${fileName}`, 'success');
    
    addMessage('ai', `📂 تم استيراد <strong>${data.length}</strong> سجل من ملف <strong>${fileName}</strong><br><br>🔍 البيانات جاهزة للتسجيل. اضغط "تأكيد وتسجيل" لإضافتها إلى قاعدة البيانات.`);
}

function showUploadStatus(message, type = 'info') {
    const status = document.getElementById('uploadStatus');
    if (!status) return;
    
    status.textContent = message;
    status.className = 'upload-status show ' + type;
    
    if (type === 'error') {
        setTimeout(() => {
            status.className = 'upload-status';
        }, 5000);
    }
}

function confirmImport() {
    if (!importedData || importedData.length === 0) {
        showAlert('⚠️ لا توجد بيانات للاستيراد', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    showAlert(`⏳ جاري تسجيل ${importedData.length} مركب...`, 'info');
    
    let successCount = 0;
    let errorCount = 0;
    let processed = 0;
    
    importedData.forEach(async (row, index) => {
        try {
            const vesselData = {
                name: row['الاسم'] || row['اسم'] || row['اسم المركب'] || row['name'] || '',
                num: row['الرقم'] || row['رقم'] || row['num'] || '',
                len: parseFloat(row['الطول'] || row['طول'] || row['len'] || 0),
                cat: row['الفئة'] || row['نوع'] || row['cat'] || 'البروق',
                reg: row['المنطقة'] || row['reg'] || '',
                zone: row['المنطقة'] || row['zone'] || '',
                port: row['الميناء'] || row['port'] || '',
                supp: row['الوحدة'] || row['supp'] || '',
                stat: row['الحالة'] || row['الجاهزية'] || row['stat'] || 'صالح',
                break: row['العطل'] || row['break'] || '',
                fDate: row['تاريخ'] || row['fDate'] || '',
                eDate: row['تاريخ الانتهاء'] || row['eDate'] || '',
                ref: row['المرجع'] || row['ref'] || '',
                repairer: row['المصلح'] || row['repairer'] || ''
            };
            
            if (!vesselData.name) {
                errorCount++;
                processed++;
                checkImportComplete(processed, successCount, errorCount);
                return;
            }
            
            const response = await fetch('/api/vessels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(vesselData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Error importing row:', row, result.error);
            }
        } catch (error) {
            errorCount++;
            console.error('Import error:', error);
        }
        
        processed++;
        checkImportComplete(processed, successCount, errorCount);
    });
    
    if (importedData.length === 0) {
        showAlert('⚠️ لا توجد بيانات للاستيراد', 'warning');
    }
}

function checkImportComplete(processed, successCount, errorCount) {
    if (processed === importedData.length) {
        const total = importedData.length;
        const message = `✅ تم تسجيل ${successCount} من ${total} مركب بنجاح${errorCount > 0 ? `، ${errorCount} فشل` : ''}`;
        showAlert(message, errorCount > 0 ? 'warning' : 'success');
        
        loadVessels();
        
        addMessage('ai', `📊 <strong>نتيجة الاستيراد:</strong><br><br>
        ✅ تم تسجيل ${successCount} مركب بنجاح<br>
        ${errorCount > 0 ? `❌ فشل تسجيل ${errorCount} مركب` : '🎉 جميع المراكب تم تسجيلها بنجاح!'}`);
        
        document.getElementById('importedData').classList.remove('show');
        importedData = [];
    }
}

function cancelImport() {
    importedData = [];
    importedFileName = '';
    document.getElementById('importedData').classList.remove('show');
    document.getElementById('dataPreview').innerHTML = '';
    document.getElementById('fileInput').value = '';
    showUploadStatus('❌ تم إلغاء الاستيراد', 'error');
    setTimeout(() => {
        document.getElementById('uploadStatus').className = 'upload-status';
    }, 3000);
}

// ===== استيراد المذكرات (Note Verbale) =====

function uploadNoteFile() {
    const fileInput = document.getElementById('noteFileInput');
    const uploadStatus = document.getElementById('noteUploadStatus');
    const uploadBtn = document.getElementById('noteUploadBtn');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showNoteUploadStatus('⚠️ الرجاء اختيار ملف أولاً', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    const allowedExtensions = ['xlsx', 'xls', 'csv', 'pdf', 'doc', 'docx', 'txt'];
    if (!allowedExtensions.includes(fileExtension)) {
        showNoteUploadStatus('❌ نوع الملف غير مدعوم. المدعوم: Excel, CSV, PDF, Word, TXT', 'error');
        return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ جاري التحليل...';
    showNoteUploadStatus('⏳ جاري قراءة الملف...', 'info');
    
    const reader = new FileReader();
    
    if (fileExtension === 'csv') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const data = parseNoteCSV(text);
                handleImportedNotes(data, fileName);
            } catch (error) {
                showNoteUploadStatus('❌ خطأ في قراءة الملف: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file, 'UTF-8');
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                if (typeof XLSX === 'undefined') {
                    showNoteUploadStatus('❌ مكتبة Excel غير محملة', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = '📤 رفع واستيراد';
                    return;
                }
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                handleImportedNotes(jsonData, fileName);
            } catch (error) {
                showNoteUploadStatus('❌ خطأ في قراءة ملف Excel: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsArrayBuffer(file);
    } else if (fileExtension === 'pdf') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                parseNotePDF(text, fileName);
            } catch (error) {
                showNoteUploadStatus('❌ خطأ في قراءة ملف PDF: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file);
    } else if (fileExtension === 'txt' || fileExtension === 'doc' || fileExtension === 'docx') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                parseNoteText(text, fileName);
            } catch (error) {
                showNoteUploadStatus('❌ خطأ في قراءة الملف: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file);
    }
}

function parseNoteCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        result.push(row);
    }
    return result;
}

function parseNotePDF(text, fileName) {
    const lines = text.split('\n');
    const notes = [];
    let currentNote = {};
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.includes('العنوان') || trimmed.includes('Title') || trimmed.includes('موضوع')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentNote.title = parts[1].trim();
        } else if (trimmed.includes('المحتوى') || trimmed.includes('Content') || trimmed.includes('نص')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentNote.content = parts[1].trim();
        } else if (trimmed.includes('التاريخ') || trimmed.includes('Date')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentNote.date = parts[1].trim();
        } else if (trimmed.includes('المرسل') || trimmed.includes('From') || trimmed.includes('من')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentNote.createdBy = parts[1].trim();
        } else if (trimmed.includes('Note Verbale') || trimmed.includes('مذكرة')) {
            if (currentNote.title || currentNote.content) {
                if (!currentNote.title) currentNote.title = 'مذكرة بدون عنوان';
                if (!currentNote.content) currentNote.content = trimmed;
                if (!currentNote.date) currentNote.date = new Date().toISOString().split('T')[0];
                if (!currentNote.createdBy) currentNote.createdBy = currentUser?.name || 'مجهول';
                notes.push(currentNote);
                currentNote = {};
            }
        }
    }
    
    if (currentNote.title || currentNote.content) {
        if (!currentNote.title) currentNote.title = 'مذكرة بدون عنوان';
        if (!currentNote.content) currentNote.content = 'محتوى المذكرة';
        if (!currentNote.date) currentNote.date = new Date().toISOString().split('T')[0];
        if (!currentNote.createdBy) currentNote.createdBy = currentUser?.name || 'مجهول';
        notes.push(currentNote);
    }
    
    if (notes.length === 0) {
        showNoteUploadStatus('⚠️ لم يتم العثور على مذكرات في ملف PDF', 'error');
        return;
    }
    
    handleImportedNotes(notes, fileName);
}

function parseNoteText(text, fileName) {
    const lines = text.split('\n');
    const notes = [];
    let currentNote = {};
    let contentLines = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (currentNote.title || contentLines.length > 0) {
                if (currentNote.title || contentLines.length > 0) {
                    if (!currentNote.title) currentNote.title = 'مذكرة من الملف';
                    currentNote.content = contentLines.join(' ') || trimmed;
                    if (!currentNote.date) currentNote.date = new Date().toISOString().split('T')[0];
                    if (!currentNote.createdBy) currentNote.createdBy = currentUser?.name || 'مجهول';
                    notes.push(currentNote);
                    currentNote = {};
                    contentLines = [];
                }
            }
            continue;
        }
        
        if (trimmed.includes(':')) {
            const parts = trimmed.split(':');
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            
            if (key.includes('العنوان') || key.includes('Title') || key.includes('موضوع')) {
                currentNote.title = value;
            } else if (key.includes('التاريخ') || key.includes('Date')) {
                currentNote.date = value;
            } else if (key.includes('المرسل') || key.includes('From') || key.includes('من')) {
                currentNote.createdBy = value;
            } else {
                contentLines.push(trimmed);
            }
        } else {
            contentLines.push(trimmed);
        }
    }
    
    if (currentNote.title || contentLines.length > 0) {
        if (!currentNote.title) currentNote.title = 'مذكرة من الملف';
        currentNote.content = contentLines.join(' ');
        if (!currentNote.date) currentNote.date = new Date().toISOString().split('T')[0];
        if (!currentNote.createdBy) currentNote.createdBy = currentUser?.name || 'مجهول';
        notes.push(currentNote);
    }
    
    if (notes.length === 0) {
        notes.push({
            title: 'مذكرة مستوردة',
            content: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
            date: new Date().toISOString().split('T')[0],
            createdBy: currentUser?.name || 'مجهول'
        });
    }
    
    handleImportedNotes(notes, fileName);
}

function handleImportedNotes(data, fileName) {
    if (!data || data.length === 0) {
        showNoteUploadStatus('⚠️ لم يتم العثور على مذكرات في الملف', 'error');
        return;
    }
    
    importedNotes = data;
    importedNotesFileName = fileName;
    
    const previewContainer = document.getElementById('notePreview');
    const importedNotesDiv = document.getElementById('importedNotesData');
    
    if (previewContainer) {
        let html = '';
        data.forEach((note, index) => {
            const title = note['العنوان'] || note['Title'] || note['title'] || note['موضوع'] || note['subject'] || `مذكرة ${index + 1}`;
            const content = note['المحتوى'] || note['Content'] || note['content'] || note['نص'] || note['text'] || 'محتوى المذكرة';
            const date = note['التاريخ'] || note['Date'] || note['date'] || note['تاريخ'] || new Date().toISOString().split('T')[0];
            const createdBy = note['المرسل'] || note['From'] || note['from'] || note['createdBy'] || note['من'] || currentUser?.name || 'مجهول';
            
            html += `
                <div style="
                    background: rgba(255,255,255,0.02);
                    padding: 12px 16px;
                    margin: 8px 0;
                    border-radius: 8px;
                    border-right: 3px solid #60a5fa;
                ">
                    <h4 style="color:rgba(255,255,255,0.8); margin:0; font-size:14px;">${title}</h4>
                    <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px;">${content}</p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                        <span style="font-size:11px; color:rgba(255,255,255,0.2);">👤 ${createdBy}</span>
                        <span style="font-size:11px; color:rgba(255,255,255,0.15);">📅 ${date}</span>
                    </div>
                </div>
            `;
        });
        previewContainer.innerHTML = html;
    }
    
    if (importedNotesDiv) {
        importedNotesDiv.classList.add('show');
    }
    
    showNoteUploadStatus(`✅ تم استيراد ${data.length} مذكرة من ${fileName}`, 'success');
}

function showNoteUploadStatus(message, type = 'info') {
    const status = document.getElementById('noteUploadStatus');
    if (!status) return;
    
    status.textContent = message;
    status.className = 'upload-status show ' + type;
    
    if (type === 'error') {
        setTimeout(() => {
            status.className = 'upload-status';
        }, 5000);
    }
}

function confirmNotesImport() {
    if (!importedNotes || importedNotes.length === 0) {
        showAlert('⚠️ لا توجد مذكرات للاستيراد', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    showAlert(`⏳ جاري تسجيل ${importedNotes.length} مذكرة...`, 'info');
    
    let successCount = 0;
    let errorCount = 0;
    let processed = 0;
    
    importedNotes.forEach(async (row, index) => {
        try {
            const title = row['العنوان'] || row['Title'] || row['title'] || row['موضوع'] || row['subject'] || `مذكرة ${index + 1}`;
            const content = row['المحتوى'] || row['Content'] || row['content'] || row['نص'] || row['text'] || 'محتوى المذكرة';
            const date = row['التاريخ'] || row['Date'] || row['date'] || row['تاريخ'] || new Date().toISOString().split('T')[0];
            const createdBy = row['المرسل'] || row['From'] || row['from'] || row['createdBy'] || row['من'] || currentUser?.name || 'مجهول';
            
            if (!title || !content) {
                errorCount++;
                processed++;
                checkNoteImportComplete(processed, successCount, errorCount);
                return;
            }
            
            const noteData = {
                title: title,
                content: content,
                date: date,
                createdBy: createdBy
            };
            
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(noteData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Error importing note:', row, result.error);
            }
        } catch (error) {
            errorCount++;
            console.error('Import note error:', error);
        }
        
        processed++;
        checkNoteImportComplete(processed, successCount, errorCount);
    });
    
    if (importedNotes.length === 0) {
        showAlert('⚠️ لا توجد مذكرات للاستيراد', 'warning');
    }
}

function checkNoteImportComplete(processed, successCount, errorCount) {
    if (processed === importedNotes.length) {
        const total = importedNotes.length;
        const message = `✅ تم تسجيل ${successCount} من ${total} مذكرة بنجاح${errorCount > 0 ? `، ${errorCount} فشل` : ''}`;
        showAlert(message, errorCount > 0 ? 'warning' : 'success');
        
        loadNotes();
        
        document.getElementById('importedNotesData').classList.remove('show');
        importedNotes = [];
    }
}

function cancelNotesImport() {
    importedNotes = [];
    importedNotesFileName = '';
    document.getElementById('importedNotesData').classList.remove('show');
    document.getElementById('notePreview').innerHTML = '';
    document.getElementById('noteFileInput').value = '';
    showNoteUploadStatus('❌ تم إلغاء الاستيراد', 'error');
    setTimeout(() => {
        document.getElementById('noteUploadStatus').className = 'upload-status';
    }, 3000);
}

console.log('✅ file-import.js loaded');
