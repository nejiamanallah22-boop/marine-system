// ============================================================
// 📂 استيراد البيانات من ملفات (Excel, CSV, PDF)
// ============================================================

// متغير لتخزين البيانات المستوردة
let importedData = [];
let importedFileName = '';

/**
 * رفع ملف وتحليل محتوياته
 */
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
    
    // التحقق من نوع الملف
    const allowedExtensions = ['xlsx', 'xls', 'csv', 'pdf'];
    if (!allowedExtensions.includes(fileExtension)) {
        showUploadStatus('❌ نوع الملف غير مدعوم. المدعوم: Excel, CSV, PDF', 'error');
        return;
    }
    
    // تعطيل الزر أثناء المعالجة
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ جاري التحليل...';
    showUploadStatus('⏳ جاري قراءة الملف...', 'info');
    
    // قراءة الملف
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
        // استخدام FileReader لقراءة الملف كـ ArrayBuffer
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                // استخدام SheetJS (XLSX) لتحليل الملف
                if (typeof XLSX === 'undefined') {
                    showUploadStatus('❌ مكتبة Excel غير محملة. يرجى تثبيت مكتبة SheetJS', 'error');
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
                // استخدام PDF.js لتحليل الملف
                if (typeof pdfjsLib === 'undefined') {
                    showUploadStatus('❌ مكتبة PDF غير محملة. يرجى تثبيت PDF.js', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = '📤 رفع واستيراد';
                    return;
                }
                // تحليل PDF (سيتم تنفيذه في دالة parsePDF)
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

/**
 * تحليل ملف CSV
 */
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

/**
 * تحليل ملف PDF
 */
function parsePDF(text, fileName) {
    // استخدام PDF.js لاستخراج النص
    // هذه دالة مبسطة، يمكن تحسينها حسب الحاجة
    const lines = text.split('\n');
    const data = [];
    
    // محاولة استخراج بيانات المراكب من النص
    let currentVessel = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // البحث عن أنماط البيانات (مثال: اسم المركب، رقمه، الخ)
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

/**
 * معالجة البيانات المستوردة وعرضها للمستخدم
 */
function handleImportedData(data, fileName) {
    if (!data || data.length === 0) {
        showUploadStatus('⚠️ لم يتم العثور على بيانات في الملف', 'error');
        return;
    }
    
    importedData = data;
    importedFileName = fileName;
    
    // عرض البيانات في الجدول
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
    
    // إضافة رسالة في الشات
    addMessage('ai', `📂 تم استيراد <strong>${data.length}</strong> سجل من ملف <strong>${fileName}</strong><br><br>🔍 البيانات جاهزة للتسجيل. اضغط "تأكيد وتسجيل" لإضافتها إلى قاعدة البيانات.`);
}

/**
 * عرض حالة الرفع
 */
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

/**
 * تأكيد استيراد البيانات
 */
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
    
    // عرض رسالة تحميل
    showAlert(`⏳ جاري تسجيل ${importedData.length} مركب...`, 'info');
    
    let successCount = 0;
    let errorCount = 0;
    let processed = 0;
    
    // تسجيل كل مركب في قاعدة البيانات
    importedData.forEach(async (row, index) => {
        try {
            // تحويل البيانات إلى صيغة المركب
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
            
            // التحقق من وجود اسم
            if (!vesselData.name) {
                errorCount++;
                processed++;
                checkImportComplete(processed, successCount, errorCount);
                return;
            }
            
            // إرسال إلى الخادم
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
    
    // إذا لم تكن هناك بيانات
    if (importedData.length === 0) {
        showAlert('⚠️ لا توجد بيانات للاستيراد', 'warning');
    }
}

/**
 * التحقق من اكتمال الاستيراد
 */
function checkImportComplete(processed, successCount, errorCount) {
    if (processed === importedData.length) {
        const total = importedData.length;
        const message = `✅ تم تسجيل ${successCount} من ${total} مركب بنجاح${errorCount > 0 ? `، ${errorCount} فشل` : ''}`;
        showAlert(message, errorCount > 0 ? 'warning' : 'success');
        
        // تحديث قائمة المراكب
        loadVessels();
        
        // إضافة رسالة في الشات
        addMessage('ai', `📊 <strong>نتيجة الاستيراد:</strong><br><br>
        ✅ تم تسجيل ${successCount} مركب بنجاح<br>
        ${errorCount > 0 ? `❌ فشل تسجيل ${errorCount} مركب` : '🎉 جميع المراكب تم تسجيلها بنجاح!'}`);
        
        // إخفاء البيانات المستوردة
        document.getElementById('importedData').classList.remove('show');
        importedData = [];
    }
}

/**
 * إلغاء الاستيراد
 */
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
