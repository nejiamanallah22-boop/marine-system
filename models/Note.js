<!-- public/pages/notes.html -->
<div id="page-notes">
    <style>
        body { background: #0a0e1a; }

        /* ============================================================
           📝 NOTES PAGE + 📄 NOTE VERBALE — v10.0
           تبويبان: الملاحظات النصية + الوثائق
           ============================================================ */

        #page-notes {
            width: 100%;
            max-width: 100%;
            padding: 20px;
            margin: 0;
            font-family: 'Cairo', 'Segoe UI', system-ui, sans-serif;
            background: transparent;
            color: #e8edf5;
            min-height: 100vh;
            position: relative;
            z-index: 2;
        }

        #page-notes *,
        #page-notes *::before,
        #page-notes *::after {
            box-sizing: border-box;
        }

        #page-notes::before {
            content: '';
            position: fixed;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background:
                radial-gradient(ellipse at 20% 50%, rgba(230,179,30,0.04) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 50%, rgba(167,139,250,0.03) 0%, transparent 60%);
            z-index: -1;
            pointer-events: none;
            animation: bgPulse 15s ease-in-out infinite;
        }

        @keyframes bgPulse {
            0%, 100% { transform: scale(1) rotate(0deg); }
            50% { transform: scale(1.05) rotate(2deg); }
        }

        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: #e6b31e; border-radius: 10px; }

        /* ===== HEADER ===== */
        .notes-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            flex-wrap: wrap;
            gap: 12px;
            background: rgba(255,255,255,0.04);
            backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            margin-bottom: 20px;
        }

        .notes-header-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .notes-header-left .header-icon {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: linear-gradient(135deg, #e6b31e, #f5d76e);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: #0a1628;
            box-shadow: 0 0 40px rgba(230,179,30,0.15);
            overflow: hidden;
        }

        .notes-header-left .header-icon img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
            display: none;
        }
        .notes-header-left .header-icon.has-logo img { display: block; }
        .notes-header-left .header-icon.has-logo {
            background: transparent;
            box-shadow: 0 0 20px rgba(230,179,30,0.3);
        }
        .notes-header-left .header-icon.has-logo i { display: none; }

        .notes-header-left h2 {
            font-size: 22px;
            font-weight: 800;
            background: linear-gradient(135deg, #f5d76e, #fff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
        }

        .notes-header-left p {
            font-size: 12px;
            color: rgba(255,255,255,0.3);
            margin: 0;
        }

        /* ===== TABS NAVIGATION ===== */
        .notes-tabs {
            display: flex;
            gap: 8px;
            padding: 6px;
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(12px);
            border-radius: 14px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.05);
        }

        .notes-tab {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 12px 20px;
            border: none;
            border-radius: 10px;
            background: transparent;
            color: rgba(255,255,255,0.5);
            font-size: 14px;
            font-weight: 700;
            font-family: 'Cairo', sans-serif;
            cursor: pointer;
            transition: all 0.3s;
            position: relative;
        }

        .notes-tab:hover {
            background: rgba(255,255,255,0.04);
            color: rgba(255,255,255,0.8);
        }

        .notes-tab.active {
            background: linear-gradient(135deg, #e6b31e, #f5d76e);
            color: #0a1628;
            box-shadow: 0 4px 20px rgba(230,179,30,0.3);
        }

        .notes-tab i { font-size: 15px; }

        .notes-tab .tab-badge {
            background: rgba(0,0,0,0.2);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 800;
        }

        .notes-tab.active .tab-badge {
            background: rgba(10,22,40,0.15);
        }

        /* ===== TAB PANELS ===== */
        .notes-panel {
            display: none;
            animation: fadeIn 0.3s ease-out;
        }

        .notes-panel.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ===== BUTTONS ===== */
        .btn-action {
            padding: 8px 18px;
            border: none;
            border-radius: 30px;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-family: 'Cairo', sans-serif;
        }

        .btn-action.primary {
            background: linear-gradient(135deg, #e6b31e, #f5d76e);
            color: #0a1628;
            box-shadow: 0 4px 30px rgba(230,179,30,0.15);
        }

        .btn-action.primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(230,179,30,0.3);
        }

        .btn-action.success {
            background: linear-gradient(135deg, #22c55e, #4ade80);
            color: #0a1628;
        }

        .btn-action.success:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(34,197,94,0.3);
        }

        .btn-action.secondary {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.5);
        }

        .btn-action.secondary:hover {
            background: rgba(255,255,255,0.06);
            color: #fff;
        }

        /* ===== ADD NOTE FORM (قديم) ===== */
        .add-note-card {
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            padding: 20px;
            margin-bottom: 20px;
            position: relative;
            overflow: hidden;
        }

        .add-note-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #e6b31e, #f5d76e);
        }

        .add-note-card h3 {
            font-size: 16px;
            font-weight: 700;
            color: #f5d76e;
            margin: 0 0 16px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            margin-bottom: 14px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-group.full { grid-column: 1 / -1; }

        .form-group label {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255,255,255,0.4);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .form-group label .required { color: #ef4444; }

        .form-group input,
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.06);
            background: rgba(255,255,255,0.03);
            color: #e8edf5;
            font-size: 14px;
            font-family: 'Cairo', sans-serif;
            transition: all 0.3s;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            outline: none;
            border-color: #e6b31e;
            background: rgba(230,179,30,0.04);
            box-shadow: 0 0 0 4px rgba(230,179,30,0.06);
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
            color: rgba(255,255,255,0.2);
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        .form-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            flex-wrap: wrap;
        }

        /* ===== NOTES LIST (قديم) ===== */
        .notes-list {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .note-card {
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            padding: 18px 20px;
            transition: all 0.3s;
            position: relative;
            overflow: hidden;
        }

        .note-card::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(180deg, #e6b31e, #f5d76e);
        }

        .note-card:hover {
            transform: translateY(-2px);
            border-color: rgba(230,179,30,0.15);
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }

        .note-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .note-card-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            margin: 0;
            flex: 1;
            min-width: 200px;
        }

        .note-card-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .note-card-date {
            font-size: 11px;
            color: rgba(255,255,255,0.3);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(255,255,255,0.03);
            padding: 3px 10px;
            border-radius: 20px;
        }

        .note-card-date i { color: #e6b31e; }

        .note-card-content {
            font-size: 14px;
            line-height: 1.7;
            color: rgba(255,255,255,0.6);
            white-space: pre-wrap;
            word-break: break-word;
            margin-bottom: 12px;
        }

        .note-card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.04);
            flex-wrap: wrap;
            gap: 8px;
        }

        .note-card-author {
            font-size: 12px;
            color: rgba(255,255,255,0.3);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .note-card-author i { color: #a78bfa; }

        .note-card-actions {
            display: flex;
            gap: 6px;
        }

        .btn-sm {
            padding: 5px 12px;
            border: none;
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            font-family: 'Cairo', sans-serif;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .btn-sm.edit {
            background: rgba(96,165,250,0.12);
            color: #60a5fa;
        }
        .btn-sm.edit:hover {
            background: rgba(96,165,250,0.25);
            transform: scale(1.05);
        }

        .btn-sm.delete {
            background: rgba(248,113,113,0.12);
            color: #f87171;
        }
        .btn-sm.delete:hover {
            background: rgba(248,113,113,0.25);
            transform: scale(1.05);
        }

        /* ============================================================
           📄 NOTE VERBALE — الأنماط الجديدة
           ============================================================ */

        /* ===== CURRENT DOCUMENT CARD (بطاقة الوثيقة الحالية) ===== */
        .nv-current-card {
            background: linear-gradient(135deg, rgba(230,179,30,0.08), rgba(245,215,110,0.04));
            backdrop-filter: blur(16px);
            border: 2px solid rgba(230,179,30,0.25);
            border-radius: 16px;
            padding: 24px 28px;
            margin-bottom: 20px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 8px 40px rgba(230,179,30,0.08);
        }

        .nv-current-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, transparent, #e6b31e, #f5d76e, #e6b31e, transparent);
            background-size: 200% 100%;
            animation: shimmerGold 3s ease-in-out infinite;
        }

        @keyframes shimmerGold {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        .nv-current-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .nv-current-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: linear-gradient(135deg, #22c55e, #4ade80);
            color: #0a1628;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 16px rgba(34,197,94,0.3);
        }

        .nv-current-badge i { font-size: 12px; }

        .nv-current-meta {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            font-size: 12px;
            color: rgba(255,255,255,0.5);
        }

        .nv-current-meta span {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .nv-current-meta i { color: #f5d76e; }

        .nv-current-title {
            font-size: 22px;
            font-weight: 800;
            color: #fff;
            margin: 0 0 10px 0;
            line-height: 1.3;
        }

        .nv-current-description {
            font-size: 13px;
            color: rgba(255,255,255,0.5);
            margin-bottom: 18px;
            line-height: 1.6;
        }

        .nv-current-file-info {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 18px;
            background: rgba(10,16,32,0.5);
            border: 1px solid rgba(230,179,30,0.15);
            border-radius: 12px;
            margin-bottom: 18px;
            flex-wrap: wrap;
        }

        .nv-file-icon {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            flex-shrink: 0;
            background: linear-gradient(135deg, #e6b31e, #f5d76e);
            color: #0a1628;
        }

        .nv-file-details {
            flex: 1;
            min-width: 0;
        }

        .nv-file-name {
            font-size: 14px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 4px;
            word-break: break-word;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .nv-file-size {
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            font-weight: 600;
        }

        .nv-current-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        /* ===== EMPTY CURRENT (لا توجد وثيقة حالية) ===== */
        .nv-empty-current {
            background: linear-gradient(135deg, rgba(230,179,30,0.05), rgba(245,215,110,0.02));
            border: 2px dashed rgba(230,179,30,0.3);
            border-radius: 16px;
            padding: 50px 24px;
            text-align: center;
            margin-bottom: 20px;
        }

        .nv-empty-current i {
            font-size: 56px;
            color: rgba(230,179,30,0.3);
            margin-bottom: 16px;
            display: block;
        }

        .nv-empty-current h3 {
            font-size: 18px;
            font-weight: 700;
            color: rgba(255,255,255,0.6);
            margin: 0 0 8px 0;
        }

        .nv-empty-current p {
            font-size: 13px;
            color: rgba(255,255,255,0.3);
            margin: 0 0 20px 0;
        }

        /* ===== UPLOAD SECTION (قسم الرفع) ===== */
        .nv-upload-card {
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            padding: 20px;
            margin-bottom: 20px;
            position: relative;
            overflow: hidden;
        }

        .nv-upload-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #22c55e, #4ade80);
        }

        .nv-upload-card h3 {
            font-size: 16px;
            font-weight: 700;
            color: #4ade80;
            margin: 0 0 16px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .nv-dropzone {
            border: 2px dashed rgba(255,255,255,0.15);
            border-radius: 12px;
            padding: 32px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: rgba(10,16,32,0.4);
            margin-bottom: 16px;
        }

        .nv-dropzone:hover {
            border-color: #22c55e;
            background: rgba(34,197,94,0.05);
        }

        .nv-dropzone.dragover {
            border-color: #4ade80;
            background: rgba(34,197,94,0.1);
            transform: scale(1.01);
        }

        .nv-dropzone i {
            font-size: 42px;
            color: rgba(34,197,94,0.6);
            margin-bottom: 12px;
            display: block;
        }

        .nv-dropzone h4 {
            font-size: 15px;
            font-weight: 700;
            color: #fff;
            margin: 0 0 6px 0;
        }

        .nv-dropzone p {
            font-size: 12px;
            color: rgba(255,255,255,0.4);
            margin: 0;
        }

        .nv-file-preview {
            display: none;
            padding: 14px 18px;
            background: rgba(34,197,94,0.08);
            border: 1px solid rgba(34,197,94,0.25);
            border-radius: 10px;
            margin-bottom: 16px;
            align-items: center;
            gap: 14px;
        }

        .nv-file-preview.show { display: flex; }

        .nv-file-preview .file-icon {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: linear-gradient(135deg, #22c55e, #4ade80);
            color: #0a1628;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
        }

        .nv-file-preview .file-info {
            flex: 1;
            min-width: 0;
        }

        .nv-file-preview .file-name {
            font-size: 13px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 3px;
            word-break: break-word;
        }

        .nv-file-preview .file-size {
            font-size: 11px;
            color: rgba(255,255,255,0.5);
        }

        .nv-file-preview .file-remove {
            background: rgba(239,68,68,0.15);
            border: none;
            color: #f87171;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        .nv-file-preview .file-remove:hover {
            background: rgba(239,68,68,0.3);
            transform: scale(1.05);
        }

        .nv-upload-progress {
            display: none;
            padding: 12px 16px;
            background: rgba(230,179,30,0.08);
            border-radius: 10px;
            margin-bottom: 16px;
        }

        .nv-upload-progress.show { display: block; }

        .nv-progress-bar {
            height: 6px;
            background: rgba(255,255,255,0.05);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .nv-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #e6b31e, #f5d76e);
            border-radius: 3px;
            width: 0%;
            transition: width 0.3s;
        }

        .nv-progress-text {
            font-size: 11px;
            color: #f5d76e;
            font-weight: 600;
            text-align: center;
        }

        /* ===== ARCHIVE SECTION (قسم الأرشيف) ===== */
        .nv-archive-section {
            margin-top: 30px;
        }

        .nv-archive-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 14px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .nv-archive-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .nv-archive-title i { color: #e6b31e; }

        .nv-archive-title .count {
            background: rgba(230,179,30,0.15);
            color: #f5d76e;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
        }

        .nv-archive-filters {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 16px;
            padding: 14px 18px;
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.04);
        }

        .nv-filter {
            flex: 1;
            min-width: 140px;
            padding: 8px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(10,16,32,0.6);
            color: #e8edf5;
            font-size: 12px;
            font-family: 'Cairo', sans-serif;
            font-weight: 600;
        }

        .nv-filter:focus {
            outline: none;
            border-color: #e6b31e;
        }

        .nv-archive-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .nv-archive-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            transition: all 0.3s;
            flex-wrap: wrap;
        }

        .nv-archive-item:hover {
            background: rgba(255,255,255,0.05);
            border-color: rgba(230,179,30,0.2);
            transform: translateY(-2px);
        }

        .nv-archive-icon {
            width: 46px;
            height: 46px;
            border-radius: 12px;
            background: linear-gradient(135deg, #475569, #1e293b);
            color: #f5d76e;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
        }

        .nv-archive-info {
            flex: 1;
            min-width: 200px;
        }

        .nv-archive-info .title {
            font-size: 14px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 4px;
            word-break: break-word;
        }

        .nv-archive-info .meta {
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .nv-archive-info .meta span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .nv-archive-info .meta i {
            color: #e6b31e;
            font-size: 10px;
        }

        .nv-archive-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .nv-action-btn {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            transition: all 0.2s;
        }

        .nv-action-btn.view {
            background: rgba(96,165,250,0.12);
            color: #60a5fa;
        }
        .nv-action-btn.view:hover {
            background: rgba(96,165,250,0.25);
            transform: scale(1.05);
        }

        .nv-action-btn.download {
            background: rgba(34,197,94,0.12);
            color: #4ade80;
        }
        .nv-action-btn.download:hover {
            background: rgba(34,197,94,0.25);
            transform: scale(1.05);
        }

        .nv-action-btn.promote {
            background: rgba(230,179,30,0.12);
            color: #f5d76e;
        }
        .nv-action-btn.promote:hover {
            background: rgba(230,179,30,0.25);
            transform: scale(1.05);
        }

        .nv-action-btn.delete {
            background: rgba(248,113,113,0.12);
            color: #f87171;
        }
        .nv-action-btn.delete:hover {
            background: rgba(248,113,113,0.25);
            transform: scale(1.05);
        }

        /* ===== EMPTY STATE ===== */
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255,255,255,0.2);
        }

        .empty-state .empty-icon {
            font-size: 3.5rem;
            color: rgba(255,255,255,0.04);
            display: block;
            margin-bottom: 12px;
        }

        .empty-state .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid rgba(255,255,255,0.04);
            border-top-color: #e6b31e;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 12px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .empty-state h3 {
            font-size: 1rem;
            font-weight: 600;
            color: rgba(255,255,255,0.15);
            margin-bottom: 4px;
        }

        .empty-state p {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.08);
        }

        /* ===== TOAST ===== */
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 12px 20px;
            border-radius: 12px;
            color: #fff;
            font-family: 'Cairo', sans-serif;
            font-size: 14px;
            z-index: 99999;
            animation: slideUp 0.4s ease-out;
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            max-width: 400px;
            direction: rtl;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .toast.success {
            background: rgba(34,197,94,0.15);
            border: 1px solid rgba(34,197,94,0.3);
        }

        .toast.error {
            background: rgba(239,68,68,0.15);
            border: 1px solid rgba(239,68,68,0.3);
        }

        .toast.warning {
            background: rgba(245,158,11,0.15);
            border: 1px solid rgba(245,158,11,0.3);
        }

        .toast.info {
            background: rgba(96,165,250,0.15);
            border: 1px solid rgba(96,165,250,0.3);
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
            #page-notes { padding: 12px; }
            .notes-header { flex-direction: column; align-items: flex-start; padding: 12px 16px; }
            .notes-header-left { width: 100%; }
            .notes-header-left h2 { font-size: 16px; }
            .notes-tabs { flex-direction: row; }
            .notes-tab { padding: 10px 14px; font-size: 12px; }
            .add-note-card { padding: 14px; }
            .form-grid { grid-template-columns: 1fr; }
            .form-actions { justify-content: stretch; }
            .form-actions .btn-action { flex: 1; justify-content: center; }
            .note-card { padding: 14px 16px; }
            .note-card-title { font-size: 14px; }
            .note-card-content { font-size: 13px; }
            .nv-current-card { padding: 18px 20px; }
            .nv-current-title { font-size: 18px; }
            .nv-current-actions .btn-action { flex: 1; justify-content: center; }
            .nv-archive-item { padding: 14px; }
            .nv-archive-actions { width: 100%; justify-content: flex-end; }
        }

        @media (max-width: 480px) {
            .nv-current-actions { flex-direction: column; }
            .nv-current-actions .btn-action { width: 100%; }
        }
    </style>

    <!-- ===== HEADER ===== -->
    <div class="notes-header">
        <div class="notes-header-left">
            <div class="header-icon" id="notesHeaderIcon">
                <i class="fas fa-sticky-note"></i>
                <img id="globalLogo" src="" alt="شعار" style="display:none;">
            </div>
            <div>
                <h2>Note Verbale</h2>
                <p>ملاحظات ومذكرات رسمية + وثائق أسبوعية</p>
            </div>
        </div>
    </div>

    <!-- ===== TABS NAVIGATION ===== -->
    <div class="notes-tabs">
        <button class="notes-tab active" data-tab="notes">
            <i class="fas fa-sticky-note"></i>
            <span>الملاحظات</span>
            <span class="tab-badge" id="tabNotesCount">0</span>
        </button>
        <button class="notes-tab" data-tab="verbale">
            <i class="fas fa-file-alt"></i>
            <span>Note Verbale</span>
            <span class="tab-badge" id="tabVerbaleCount">0</span>
        </button>
    </div>

    <!-- ===== PANEL 1: NOTES (القديم) ===== -->
    <div class="notes-panel active" id="panel-notes">
        <!-- Add Note Form -->
        <div class="add-note-card" id="addNoteCard">
            <h3 id="formTitle">
                <i class="fas fa-pen"></i> إضافة ملاحظة جديدة
            </h3>

            <div class="form-grid">
                <div class="form-group full">
                    <label>
                        <i class="fas fa-heading"></i> العنوان <span class="required">*</span>
                    </label>
                    <input type="text" id="noteTitle" placeholder="عنوان الملاحظة..." maxlength="200">
                </div>

                <div class="form-group full">
                    <label>
                        <i class="fas fa-align-right"></i> المحتوى <span class="required">*</span>
                    </label>
                    <textarea id="noteContent" rows="4" placeholder="نص الملاحظة..." maxlength="5000"></textarea>
                </div>

                <div class="form-group">
                    <label>
                        <i class="fas fa-calendar"></i> التاريخ
                    </label>
                    <input type="date" id="noteDate">
                </div>

                <div class="form-group">
                    <label>
                        <i class="fas fa-flag"></i> الأولوية
                    </label>
                    <select id="notePriority">
                        <option value="عادي">📌 عادي</option>
                        <option value="مهم">⚠️ مهم</option>
                        <option value="عاجل">🚨 عاجل</option>
                    </select>
                </div>
            </div>

            <div class="form-actions">
                <button class="btn-action secondary" id="cancelEditBtn" style="display:none;">
                    <i class="fas fa-times"></i> إلغاء
                </button>
                <button class="btn-action success" id="saveNoteBtn">
                    <i class="fas fa-save"></i> حفظ
                </button>
            </div>
        </div>

        <!-- Notes List -->
        <div class="notes-list" id="notesList">
            <div class="empty-state">
                <div class="spinner"></div>
                <h3>جاري تحميل الملاحظات...</h3>
            </div>
        </div>
    </div>

    <!-- ===== PANEL 2: NOTE VERBALE (جديد) ===== -->
    <div class="notes-panel" id="panel-verbale">

        <!-- ===== Current Document Section ===== -->
        <div id="nvCurrentSection">
            <div class="empty-state">
                <div class="spinner"></div>
                <h3>جاري تحميل الوثيقة الحالية...</h3>
            </div>
        </div>

        <!-- ===== Upload Section ===== -->
        <div class="nv-upload-card" id="nvUploadCard">
            <h3><i class="fas fa-cloud-upload-alt"></i> رفع وثيقة جديدة</h3>

            <div class="nv-dropzone" id="nvDropzone">
                <i class="fas fa-cloud-upload-alt"></i>
                <h4>اسحب الملف هنا أو انقر للاختيار</h4>
                <p>PDF, Word, Excel, صور — حتى 25 MB</p>
            </div>

            <input type="file" id="nvFileInput" accept="*/*" style="display:none;">

            <div class="nv-file-preview" id="nvFilePreview">
                <div class="file-icon"><i class="fas fa-file"></i></div>
                <div class="file-info">
                    <div class="file-name" id="nvFileName">—</div>
                    <div class="file-size" id="nvFileSize">—</div>
                </div>
                <button type="button" class="file-remove" id="nvFileRemove">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="form-grid" id="nvUploadForm" style="display:none;">
                <div class="form-group full">
                    <label><i class="fas fa-heading"></i> عنوان الوثيقة <span class="required">*</span></label>
                    <input type="text" id="nvTitle" placeholder="مثال: Note Verbale - الأسبوع 42" maxlength="200">
                </div>
                <div class="form-group full">
                    <label><i class="fas fa-align-right"></i> وصف مختصر</label>
                    <textarea id="nvDescription" rows="2" placeholder="وصف اختياري..." maxlength="1000"></textarea>
                </div>
            </div>

            <div class="nv-upload-progress" id="nvProgress">
                <div class="nv-progress-bar">
                    <div class="nv-progress-fill" id="nvProgressFill"></div>
                </div>
                <div class="nv-progress-text" id="nvProgressText">0%</div>
            </div>

            <div class="form-actions" id="nvUploadActions" style="display:none;">
                <button class="btn-action secondary" id="nvCancelUpload">
                    <i class="fas fa-times"></i> إلغاء
                </button>
                <button class="btn-action success" id="nvSubmitUpload">
                    <i class="fas fa-upload"></i> رفع الوثيقة
                </button>
            </div>
        </div>

        <!-- ===== Archive Section ===== -->
        <div class="nv-archive-section">
            <div class="nv-archive-header">
                <h3 class="nv-archive-title">
                    <i class="fas fa-archive"></i>
                    الأرشيف
                    <span class="count" id="nvArchiveCount">0</span>
                </h3>
                <button class="btn-action secondary" id="nvRefreshArchive">
                    <i class="fas fa-sync-alt"></i> تحديث
                </button>
            </div>

            <div class="nv-archive-filters">
                <input type="text" class="nv-filter" id="nvSearch" placeholder="🔍 بحث بالاسم أو الوصف...">
                <select class="nv-filter" id="nvFilterYear">
                    <option value="all">كل السنوات</option>
                </select>
                <select class="nv-filter" id="nvFilterUploader">
                    <option value="all">كل الرافعين</option>
                </select>
            </div>

            <div class="nv-archive-list" id="nvArchiveList">
                <div class="empty-state">
                    <div class="spinner"></div>
                    <h3>جاري تحميل الأرشيف...</h3>
                </div>
            </div>
        </div>

    </div>

</div>
<script>
    // ============================================================
    // 📝 NOTES PAGE v10.0 — JavaScript
    // Notes (نصية) + Note Verbale (وثائق)
    // ============================================================
    (function() {
        'use strict';

        console.log('📝 Notes Page v10.0 - loading...');

        // ============================================================
        // ✅ CLEANUP STATE
        // ============================================================
        var _isDestroyed = false;
        var _pageTimeouts = [];
        var _eventListeners = [];

        function _notesCleanup() {
            if (_isDestroyed) return;
            _isDestroyed = true;

            _pageTimeouts.forEach(function(id) {
                try { clearTimeout(id); } catch (e) {}
            });
            _pageTimeouts = [];

            _eventListeners.forEach(function(item) {
                try {
                    if (item.el && item.fn) item.el.removeEventListener(item.type, item.fn);
                } catch (e) {}
            });
            _eventListeners = [];

            // ✅ إزالة <style> الخاص بالصفحة
            try {
                document.querySelectorAll('style').forEach(function(styleEl) {
                    if (styleEl.textContent && (
                        styleEl.textContent.indexOf('#page-notes') !== -1 ||
                        styleEl.textContent.indexOf('.notes-header') !== -1 ||
                        styleEl.textContent.indexOf('.nv-current-card') !== -1
                    )) {
                        styleEl.remove();
                    }
                });

                // ✅ إزالة عنصر #page-notes
                var oldPage = document.getElementById('page-notes');
                if (oldPage && oldPage.parentNode) {
                    oldPage.parentNode.removeChild(oldPage);
                }
            } catch (e) {
                console.debug('Cleanup error:', e.message);
            }

            try {
                delete window.saveNote;
                delete window.loadNotes;
                delete window.editNote;
                delete window.deleteNote;
                delete window.switchNotesTab;
                delete window.loadNoteVerbaleCurrent;
                delete window.loadNoteVerbaleArchive;
            } catch (e) {}

            console.log('🧹 Notes v10.0 cleanup done');
        }

        window._pageCleanup = window._pageCleanup || [];
        window._pageCleanup.push(_notesCleanup);
        window.addEventListener('beforeunload', _notesCleanup);
        window.addEventListener('pagehide', _notesCleanup);

        // ============================================================
        // 🎨 LOGO APPLY
        // ============================================================
        function applyLogo() {
            try {
                var cachedLogo = localStorage.getItem('marine_logo');
                if (!cachedLogo) return;
                var iconDiv = document.getElementById('notesHeaderIcon');
                var img = document.getElementById('globalLogo');
                if (img) {
                    img.src = cachedLogo;
                    img.style.display = 'block';
                }
                if (iconDiv) iconDiv.classList.add('has-logo');
            } catch (e) {}
        }

        function syncLogoFromServer() {
            var token = localStorage.getItem('marine_token') ||
                        localStorage.getItem('token') ||
                        localStorage.getItem('authToken') || null;
            var headers = { 'Accept': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;

            fetch('/api/logo', { headers: headers, credentials: 'include' })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    if (data && data.success && data.logo && data.logo.dataUrl) {
                        try { localStorage.setItem('marine_logo', data.logo.dataUrl); } catch (e) {}
                        applyLogo();
                    }
                }).catch(function() {});
        }

        applyLogo();
        syncLogoFromServer();

        window.addEventListener('storage', function(e) {
            if (e.key === 'marine_logo' && e.newValue) {
                applyLogo();
            }
        });

        // ============================================================
        // 🔐 RBAC
        // ============================================================
        var LEGACY_ROLE_MAP = {
            'super_admin': 'admin',
            'مسؤول': 'admin',
            'مدير': 'manager',
            'محرر': 'editor',
            'مشغل': 'maintenance_unit',
            'operator': 'maintenance_unit',
            'user': 'viewer',
            'مشاهد': 'viewer'
        };

        var ALLOWED_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit', 'viewer'];

        function normalizeRole(role) {
            if (!role) return 'viewer';
            var r = String(role).trim();
            if (ALLOWED_ROLES.indexOf(r) !== -1) return r;
            return LEGACY_ROLE_MAP[r] || 'viewer';
        }

        function canEdit() {
            var u = window.currentUser;
            if (!u) return false;
            var r = normalizeRole(u.role);
            return r !== 'viewer';
        }

        function canDelete() {
            var u = window.currentUser;
            if (!u) return false;
            var r = normalizeRole(u.role);
            return ['admin', 'manager'].indexOf(r) !== -1;
        }

        function canUploadVerbale() {
            var u = window.currentUser;
            if (!u) return false;
            var r = normalizeRole(u.role);
            return ['admin', 'manager', 'editor', 'maintenance_unit'].indexOf(r) !== -1;
        }

        function canDeleteVerbale() {
            var u = window.currentUser;
            if (!u) return false;
            var r = normalizeRole(u.role);
            return ['admin', 'manager'].indexOf(r) !== -1;
        }

        // ============================================================
        // 🔧 HELPERS
        // ============================================================
        function $(id) { return document.getElementById(id); }

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            var div = document.createElement('div');
            div.textContent = String(str);
            return div.innerHTML;
        }

        function getToken() {
            return localStorage.getItem('marine_token') ||
                   localStorage.getItem('token') ||
                   localStorage.getItem('authToken') ||
                   null;
        }

        function getCsrfToken() {
            try {
                var m = document.cookie.match(/marine_csrf=([^;]+)/);
                return m ? decodeURIComponent(m[1]) : '';
            } catch (e) { return ''; }
        }

        function addSafeListener(el, type, fn) {
            if (!el) return;
            el.addEventListener(type, fn);
            _eventListeners.push({ el: el, type: type, fn: fn });
        }

        function fetcher(url, options) {
            if (typeof window.apiFetch === 'function') {
                return window.apiFetch(url, options || {});
            }
            var token = getToken();
            var headers = Object.assign({
                'Accept': 'application/json'
            }, (options && options.headers) || {});
            if (token) headers['Authorization'] = 'Bearer ' + token;
            if (options && options.method && options.method !== 'GET') {
                var csrf = getCsrfToken();
                if (csrf) headers['X-CSRF-Token'] = csrf;
            }
            return fetch(url, Object.assign({}, options || {}, {
                headers: headers,
                credentials: 'include'
            }));
        }

        function showToast(msg, type) {
            if (_isDestroyed) return;
            var old = document.querySelector('.toast');
            if (old) old.remove();

            var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
            var n = document.createElement('div');
            n.className = 'toast ' + (type || 'info');
            n.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + escapeHtml(msg) + '</span>';
            document.body.appendChild(n);

            var tid = setTimeout(function() {
                n.style.opacity = '0';
                n.style.transform = 'translateY(20px)';
                n.style.transition = 'all 0.4s';
                var tid2 = setTimeout(function() { n.remove(); }, 400);
                _pageTimeouts.push(tid2);
            }, 3000);
            _pageTimeouts.push(tid);
        }

        function formatDate(d) {
            if (!d) return '—';
            try {
                var dt = new Date(d);
                if (isNaN(dt.getTime())) return String(d);
                return dt.toLocaleDateString('ar-TN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } catch (_) { return String(d); }
        }

        function formatFileSize(bytes) {
            if (!bytes || bytes < 0) return '0 B';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }

        function getFileIcon(mimetype, filename) {
            var mt = (mimetype || '').toLowerCase();
            var fn = (filename || '').toLowerCase();
            if (mt.indexOf('pdf') !== -1 || fn.endsWith('.pdf')) return 'fa-file-pdf';
            if (mt.indexOf('word') !== -1 || fn.endsWith('.doc') || fn.endsWith('.docx')) return 'fa-file-word';
            if (mt.indexOf('excel') !== -1 || mt.indexOf('spreadsheet') !== -1 || fn.endsWith('.xls') || fn.endsWith('.xlsx')) return 'fa-file-excel';
            if (mt.indexOf('powerpoint') !== -1 || fn.endsWith('.ppt') || fn.endsWith('.pptx')) return 'fa-file-powerpoint';
            if (mt.indexOf('image') !== -1 || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fn)) return 'fa-file-image';
            if (mt.indexOf('zip') !== -1 || mt.indexOf('rar') !== -1 || fn.endsWith('.zip') || fn.endsWith('.rar')) return 'fa-file-archive';
            if (mt.indexOf('text') !== -1 || fn.endsWith('.txt') || fn.endsWith('.csv')) return 'fa-file-alt';
            return 'fa-file';
        }

        // ============================================================
        // 🎯 TABS SWITCHING
        // ============================================================
        var currentTab = 'notes';
        var notesCount = 0;
        var verbaleCount = 0;

        function switchNotesTab(tabName) {
            if (tabName !== 'notes' && tabName !== 'verbale') return;
            currentTab = tabName;

            // Update tab buttons
            document.querySelectorAll('.notes-tab').forEach(function(btn) {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });

            // Update panels
            var panelNotes = $('panel-notes');
            var panelVerbale = $('panel-verbale');
            if (panelNotes) panelNotes.classList.toggle('active', tabName === 'notes');
            if (panelVerbale) panelVerbale.classList.toggle('active', tabName === 'verbale');

            // Load data if needed
            if (tabName === 'notes') {
                if (!notesLoaded) loadNotes();
            } else if (tabName === 'verbale') {
                if (!verbaleCurrentLoaded) loadNoteVerbaleCurrent();
                if (!verbaleArchiveLoaded) loadNoteVerbaleArchive();
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 📝 NOTES (النصية) — الجزء القديم
        // ═══════════════════════════════════════════════════════════

        var notesData = [];
        var editingId = null;
        var notesLoaded = false;

        async function loadNotes() {
            if (_isDestroyed) return;

            var container = $('notesList');
            if (!container) return;

            notesLoaded = true;
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="spinner"></div>' +
                    '<h3>جاري تحميل الملاحظات...</h3>' +
                '</div>';

            try {
                var response = await fetcher('/api/notes', { method: 'GET' });

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('انتهت الجلسة — يرجى تسجيل الدخول');
                    }
                    if (response.status === 404) {
                        notesData = [];
                        renderNotes();
                        return;
                    }
                    throw new Error('فشل التحميل: ' + response.status);
                }

                var data = await response.json();

                if (Array.isArray(data)) {
                    notesData = data;
                } else if (data && Array.isArray(data.notes)) {
                    notesData = data.notes;
                } else if (data && Array.isArray(data.data)) {
                    notesData = data.data;
                } else {
                    notesData = [];
                }

                notesCount = notesData.length;
                var tabCount = $('tabNotesCount');
                if (tabCount) tabCount.textContent = notesCount;

                renderNotes();

            } catch (error) {
                console.error('❌ Load notes error:', error);
                if (_isDestroyed) return;

                container.innerHTML =
                    '<div class="empty-state">' +
                        '<span class="empty-icon"><i class="fas fa-exclamation-triangle" style="color:#f87171;"></i></span>' +
                        '<h3 style="color:#f87171;">تعذّر تحميل الملاحظات</h3>' +
                        '<p>' + escapeHtml(error.message) + '</p>' +
                    '</div>';
            }
        }

        function renderNotes() {
            if (_isDestroyed) return;

            var container = $('notesList');
            if (!container) return;

            if (notesData.length === 0) {
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<span class="empty-icon"><i class="fas fa-sticky-note"></i></span>' +
                        '<h3>لا توجد ملاحظات بعد</h3>' +
                        '<p>ابدأ بإضافة ملاحظة جديدة من الأعلى</p>' +
                    '</div>';
                return;
            }

            var canEditNotes = canEdit();
            var canDel = canDelete();

            var html = '';
            notesData.forEach(function(note) {
                var id = note._id || note.id || '';
                var title = note.title || 'بدون عنوان';
                var content = note.content || note.description || '';
                var date = note.date || note.createdAt;
                var priority = note.priority || 'عادي';
                var author = note.createdByName || note.author || (note.createdBy ? 'مستخدم' : '—');

                var priorityBadge = '';
                if (priority === 'عاجل') {
                    priorityBadge = '<span style="background:rgba(239,68,68,0.15);color:#f87171;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:600;">🚨 عاجل</span>';
                } else if (priority === 'مهم') {
                    priorityBadge = '<span style="background:rgba(245,158,11,0.15);color:#fbbf24;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:600;">⚠️ مهم</span>';
                }

                var editBtn = canEditNotes ?
                    '<button class="btn-sm edit" onclick="editNote(\'' + escapeHtml(id) + '\')">' +
                        '<i class="fas fa-edit"></i> تعديل' +
                    '</button>' : '';

                var delBtn = canDel ?
                    '<button class="btn-sm delete" onclick="deleteNote(\'' + escapeHtml(id) + '\')">' +
                        '<i class="fas fa-trash"></i> حذف' +
                    '</button>' : '';

                html +=
                    '<div class="note-card">' +
                        '<div class="note-card-header">' +
                            '<h4 class="note-card-title">' + escapeHtml(title) + '</h4>' +
                            '<div class="note-card-meta">' +
                                priorityBadge +
                                '<span class="note-card-date">' +
                                    '<i class="fas fa-calendar"></i> ' + escapeHtml(formatDate(date)) +
                                '</span>' +
                            '</div>' +
                        '</div>' +
                        (content ? '<div class="note-card-content">' + escapeHtml(content) + '</div>' : '') +
                        '<div class="note-card-footer">' +
                            '<span class="note-card-author">' +
                                '<i class="fas fa-user"></i> ' + escapeHtml(author) +
                            '</span>' +
                            '<div class="note-card-actions">' +
                                editBtn +
                                delBtn +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });

            container.innerHTML = html;
        }

        async function saveNote() {
            if (_isDestroyed) return;

            if (!canEdit()) {
                showToast('⚠️ ليس لديك صلاحية لإضافة أو تعديل الملاحظات', 'error');
                return;
            }

            var titleEl = $('noteTitle');
            var contentEl = $('noteContent');
            var dateEl = $('noteDate');
            var priorityEl = $('notePriority');

            var title = titleEl ? titleEl.value.trim() : '';
            var content = contentEl ? contentEl.value.trim() : '';
            var date = dateEl ? dateEl.value : '';
            var priority = priorityEl ? priorityEl.value : 'عادي';

            if (!title) {
                showToast('⚠️ يرجى إدخال العنوان', 'error');
                if (titleEl) titleEl.focus();
                return;
            }

            if (!content) {
                showToast('⚠️ يرجى إدخال المحتوى', 'error');
                if (contentEl) contentEl.focus();
                return;
            }

            var payload = {
                title: title,
                content: content,
                date: date || new Date().toISOString(),
                priority: priority
            };

            var btn = $('saveNoteBtn');
            var origText = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
            }

            try {
                var url = editingId
                    ? '/api/notes/' + editingId
                    : '/api/notes';
                var method = editingId ? 'PUT' : 'POST';

                var response = await fetcher(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    var errData = null;
                    try { errData = await response.json(); } catch (_) {}
                    throw new Error(
                        (errData && (errData.error || errData.message)) ||
                        'فشل الحفظ (Status ' + response.status + ')'
                    );
                }

                showToast(editingId ? '✅ تم تحديث الملاحظة' : '✅ تم إضافة الملاحظة', 'success');

                clearNoteForm();
                notesLoaded = false;
                await loadNotes();

            } catch (error) {
                console.error('❌ Save note error:', error);
                showToast('❌ ' + error.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origText;
                }
            }
        }

        function editNote(id) {
            if (_isDestroyed) return;
            if (!canEdit()) {
                showToast('⚠️ ليس لديك صلاحية للتعديل', 'error');
                return;
            }

            var note = notesData.find(function(n) {
                return String(n._id || n.id) === String(id);
            });

            if (!note) {
                showToast('⚠️ الملاحظة غير موجودة', 'warning');
                return;
            }

            editingId = note._id || note.id;

            var titleEl = $('noteTitle');
            var contentEl = $('noteContent');
            var dateEl = $('noteDate');
            var priorityEl = $('notePriority');

            if (titleEl) titleEl.value = note.title || '';
            if (contentEl) contentEl.value = note.content || note.description || '';
            if (dateEl) {
                var d = note.date || note.createdAt;
                if (d) {
                    try {
                        dateEl.value = new Date(d).toISOString().split('T')[0];
                    } catch (_) {}
                }
            }
            if (priorityEl) priorityEl.value = note.priority || 'عادي';

            var formTitle = $('formTitle');
            if (formTitle) {
                formTitle.innerHTML = '<i class="fas fa-edit"></i> تعديل الملاحظة';
            }

            var cancelBtn = $('cancelEditBtn');
            if (cancelBtn) cancelBtn.style.display = 'inline-flex';

            var saveBtn = $('saveNoteBtn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> تحديث';
            }

            var addCard = $('addNoteCard');
            if (addCard) addCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (titleEl) setTimeout(function() { titleEl.focus(); }, 300);
        }

        async function deleteNote(id) {
            if (_isDestroyed) return;
            if (!canDelete()) {
                showToast('⚠️ ليس لديك صلاحية الحذف', 'error');
                return;
            }

            if (!confirm('⚠️ هل أنت متأكد من حذف هذه الملاحظة؟')) return;

            try {
                var response = await fetcher('/api/notes/' + id, { method: 'DELETE' });

                if (!response.ok) {
                    var errData = null;
                    try { errData = await response.json(); } catch (_) {}
                    throw new Error(
                        (errData && (errData.error || errData.message)) ||
                        'فشل الحذف'
                    );
                }

                showToast('✅ تم حذف الملاحظة', 'success');
                notesLoaded = false;
                await loadNotes();

            } catch (error) {
                console.error('❌ Delete note error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        function clearNoteForm() {
            editingId = null;

            var titleEl = $('noteTitle');
            var contentEl = $('noteContent');
            var dateEl = $('noteDate');
            var priorityEl = $('notePriority');

            if (titleEl) titleEl.value = '';
            if (contentEl) contentEl.value = '';
            if (dateEl) dateEl.value = '';
            if (priorityEl) priorityEl.value = 'عادي';

            var formTitle = $('formTitle');
            if (formTitle) {
                formTitle.innerHTML = '<i class="fas fa-pen"></i> إضافة ملاحظة جديدة';
            }

            var cancelBtn = $('cancelEditBtn');
            if (cancelBtn) cancelBtn.style.display = 'none';

            var saveBtn = $('saveNoteBtn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ';
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 📄 NOTE VERBALE — الجزء الجديد
        // ═══════════════════════════════════════════════════════════

        var verbaleCurrentLoaded = false;
        var verbaleArchiveLoaded = false;
        var nvSelectedFile = null;
        var nvCurrentData = null;
        var nvArchiveData = [];

        // ===== Load Current Document =====
        async function loadNoteVerbaleCurrent() {
            if (_isDestroyed) return;

            var container = $('nvCurrentSection');
            if (!container) return;

            verbaleCurrentLoaded = true;
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="spinner"></div>' +
                    '<h3>جاري تحميل الوثيقة الحالية...</h3>' +
                '</div>';

            try {
                var response = await fetcher('/api/notes/current', { method: 'GET' });

                if (!response.ok) {
                    throw new Error('فشل التحميل: ' + response.status);
                }

                var data = await response.json();

                if (data && data.success && data.hasCurrent && data.note) {
                    nvCurrentData = data.note;
                    renderCurrentDocument(data.note);
                } else {
                    nvCurrentData = null;
                    renderEmptyCurrent();
                }

            } catch (error) {
                console.error('❌ Load current verbale error:', error);
                if (_isDestroyed) return;
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<span class="empty-icon"><i class="fas fa-exclamation-triangle" style="color:#f87171;"></i></span>' +
                        '<h3 style="color:#f87171;">تعذّر تحميل الوثيقة الحالية</h3>' +
                        '<p>' + escapeHtml(error.message) + '</p>' +
                    '</div>';
            }
        }

        function renderCurrentDocument(note) {
            var container = $('nvCurrentSection');
            if (!container) return;

            var fileIcon = getFileIcon(note.file && note.file.mimetype, note.file && note.file.originalName);
            var fileName = (note.file && note.file.originalName) || 'ملف غير مسمى';
            var fileSize = (note.file && note.file.sizeFormatted) || '0 B';
            var uploader = note.uploadedBy && note.uploadedBy.name ? note.uploadedBy.name : (note.createdByName || 'مستخدم');
            var uploadDate = note.createdAt || note.publishedAt;
            var weekLabel = note.weekNumber ? ('الأسبوع ' + note.weekNumber) : '';
            var yearLabel = note.year || '';

            var html =
                '<div class="nv-current-card">' +
                    '<div class="nv-current-header">' +
                        '<span class="nv-current-badge">' +
                            '<i class="fas fa-circle" style="font-size:8px;"></i> الوثيقة الحالية' +
                        '</span>' +
                        '<div class="nv-current-meta">' +
                            (weekLabel ? '<span><i class="fas fa-calendar-week"></i> ' + escapeHtml(weekLabel) + '</span>' : '') +
                            (yearLabel ? '<span><i class="fas fa-calendar-alt"></i> ' + escapeHtml(yearLabel) + '</span>' : '') +
                        '</div>' +
                    '</div>' +
                    '<h3 class="nv-current-title">' + escapeHtml(note.title || 'بدون عنوان') + '</h3>' +
                    (note.description ? '<p class="nv-current-description">' + escapeHtml(note.description) + '</p>' : '') +
                    '<div class="nv-current-file-info">' +
                        '<div class="nv-file-icon"><i class="fas ' + fileIcon + '"></i></div>' +
                        '<div class="nv-file-details">' +
                            '<div class="nv-file-name">' + escapeHtml(fileName) + '</div>' +
                            '<div class="nv-file-size">' + escapeHtml(fileSize) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="nv-current-actions">' +
                        '<a class="btn-action primary" href="/api/notes/verbale/' + escapeHtml(note.id || note._id) + '/download" target="_blank" download>' +
                            '<i class="fas fa-download"></i> تحميل' +
                        '</a>' +
                        '<a class="btn-action secondary" href="' + escapeHtml(note.file ? note.file.url : '#') + '" target="_blank">' +
                            '<i class="fas fa-eye"></i> عرض' +
                        '</a>' +
                    '</div>' +
                '</div>';

            container.innerHTML = html;
        }

        function renderEmptyCurrent() {
            var container = $('nvCurrentSection');
            if (!container) return;

            container.innerHTML =
                '<div class="nv-empty-current">' +
                    '<i class="fas fa-file-circle-question"></i>' +
                    '<h3>لا توجد وثيقة حالية</h3>' +
                    '<p>ابدأ برفع أول Note Verbale</p>' +
                '</div>';
        }

        // ===== Load Archive =====
        async function loadNoteVerbaleArchive() {
            if (_isDestroyed) return;

            var container = $('nvArchiveList');
            if (!container) return;

            verbaleArchiveLoaded = true;
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="spinner"></div>' +
                    '<h3>جاري تحميل الأرشيف...</h3>' +
                '</div>';

            try {
                var search = ($('nvSearch') && $('nvSearch').value.trim()) || '';
                var year = ($('nvFilterYear') && $('nvFilterYear').value) || 'all';
                var uploader = ($('nvFilterUploader') && $('nvFilterUploader').value) || 'all';

                var params = new URLSearchParams();
                params.append('limit', '200');
                if (year !== 'all') params.append('year', year);
                if (uploader !== 'all') params.append('uploadedBy', uploader);

                var response = await fetcher('/api/notes/archive?' + params.toString(), { method: 'GET' });

                if (!response.ok) {
                    throw new Error('فشل التحميل: ' + response.status);
                }

                var data = await response.json();

                nvArchiveData = (data && data.notes) || [];

                // Update counts
                verbaleCount = nvArchiveData.length;
                var tabCount = $('tabVerbaleCount');
                if (tabCount) tabCount.textContent = verbaleCount;

                var archiveCount = $('nvArchiveCount');
                if (archiveCount) archiveCount.textContent = nvArchiveData.length;

                // Populate filters
                if (data && data.years && data.years.length > 0) {
                    populateYearFilter(data.years);
                }
                if (data && data.uploaders && data.uploaders.length > 0) {
                    populateUploaderFilter(data.uploaders);
                }

                // Client-side search
                if (search) {
                    var lowerSearch = search.toLowerCase();
                    nvArchiveData = nvArchiveData.filter(function(n) {
                        var text = ((n.title || '') + ' ' + (n.description || '')).toLowerCase();
                        return text.indexOf(lowerSearch) !== -1;
                    });
                }

                renderArchive();

            } catch (error) {
                console.error('❌ Load archive error:', error);
                if (_isDestroyed) return;
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<span class="empty-icon"><i class="fas fa-exclamation-triangle" style="color:#f87171;"></i></span>' +
                        '<h3 style="color:#f87171;">تعذّر تحميل الأرشيف</h3>' +
                        '<p>' + escapeHtml(error.message) + '</p>' +
                    '</div>';
            }
        }

        function populateYearFilter(years) {
            var el = $('nvFilterYear');
            if (!el) return;
            var current = el.value;
            var html = '<option value="all">كل السنوات</option>';
            years.forEach(function(y) {
                html += '<option value="' + y + '">' + y + '</option>';
            });
            el.innerHTML = html;
            el.value = current;
        }

        function populateUploaderFilter(uploaders) {
            var el = $('nvFilterUploader');
            if (!el) return;
            var current = el.value;
            var html = '<option value="all">كل الرافعين</option>';
            uploaders.forEach(function(u) {
                if (!u._id) return;
                var name = u.name || u.username || u._id;
                html += '<option value="' + escapeHtml(u._id) + '">' + escapeHtml(name) + ' (' + u.count + ')</option>';
            });
            el.innerHTML = html;
            el.value = current;
        }

        function renderArchive() {
            var container = $('nvArchiveList');
            if (!container) return;

            if (nvArchiveData.length === 0) {
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<span class="empty-icon"><i class="fas fa-archive"></i></span>' +
                        '<h3>لا توجد وثائق في الأرشيف</h3>' +
                        '<p>الوثائق القديمة ستظهر هنا</p>' +
                    '</div>';
                return;
            }

            var canPromote = canDeleteVerbale();
            var canDel = canDeleteVerbale();

            var html = '';
            nvArchiveData.forEach(function(note) {
                var id = note.id || note._id;
                var fileIcon = getFileIcon(note.file && note.file.mimetype, note.file && note.file.originalName);
                var fileName = (note.file && note.file.originalName) || 'ملف';
                var fileSize = (note.file && note.file.sizeFormatted) || '0 B';
                var uploader = note.uploadedBy && note.uploadedBy.name ? note.uploadedBy.name : (note.createdByName || 'مستخدم');
                var uploadDate = note.createdAt || note.archivedAt;
                var weekLabel = note.weekNumber ? ('أسبوع ' + note.weekNumber) : '';

                var actions = '';
                actions += '<button class="nv-action-btn download" data-action="download" data-id="' + escapeHtml(id) + '" title="تحميل"><i class="fas fa-download"></i></button>';
                if (note.file && note.file.url) {
                    actions += '<a class="nv-action-btn view" href="' + escapeHtml(note.file.url) + '" target="_blank" title="عرض"><i class="fas fa-eye"></i></a>';
                }
                if (canPromote) {
                    actions += '<button class="nv-action-btn promote" data-action="promote" data-id="' + escapeHtml(id) + '" title="تعيين كحالية"><i class="fas fa-star"></i></button>';
                }
                if (canDel) {
                    actions += '<button class="nv-action-btn delete" data-action="delete" data-id="' + escapeHtml(id) + '" title="حذف"><i class="fas fa-trash"></i></button>';
                }

                html +=
                    '<div class="nv-archive-item">' +
                        '<div class="nv-archive-icon"><i class="fas ' + fileIcon + '"></i></div>' +
                        '<div class="nv-archive-info">' +
                            '<div class="title">' + escapeHtml(note.title || fileName) + '</div>' +
                            (note.description ? '<div class="description" style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:4px;">' + escapeHtml(note.description) + '</div>' : '') +
                            '<div class="meta">' +
                                '<span><i class="fas fa-user"></i> ' + escapeHtml(uploader) + '</span>' +
                                '<span><i class="fas fa-calendar"></i> ' + escapeHtml(formatDate(uploadDate)) + '</span>' +
                                (weekLabel ? '<span><i class="fas fa-calendar-week"></i> ' + escapeHtml(weekLabel) + '</span>' : '') +
                                '<span><i class="fas fa-weight-hanging"></i> ' + escapeHtml(fileSize) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="nv-archive-actions">' + actions + '</div>' +
                    '</div>';
            });

            container.innerHTML = html;
        }

        // ===== Upload Handlers =====
        function handleFileSelected(file) {
            if (!file) return;

            var maxSize = 25 * 1024 * 1024;
            if (file.size > maxSize) {
                showToast('❌ حجم الملف كبير جداً (الحد الأقصى 25 MB)', 'error');
                return;
            }

            nvSelectedFile = file;

            var preview = $('nvFilePreview');
            var nameEl = $('nvFileName');
            var sizeEl = $('nvFileSize');

            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
            if (preview) preview.classList.add('show');

            var form = $('nvUploadForm');
            var actions = $('nvUploadActions');
            if (form) form.style.display = 'grid';
            if (actions) actions.style.display = 'flex';

            // Auto-fill title
            var titleEl = $('nvTitle');
            if (titleEl && !titleEl.value) {
                var baseName = file.name.replace(/\.[^.]+$/, '');
                titleEl.value = baseName;
            }
        }

        function clearUploadForm() {
            nvSelectedFile = null;

            var preview = $('nvFilePreview');
            if (preview) preview.classList.remove('show');

            var form = $('nvUploadForm');
            var actions = $('nvUploadActions');
            var progress = $('nvProgress');
            if (form) form.style.display = 'none';
            if (actions) actions.style.display = 'none';
            if (progress) progress.classList.remove('show');

            var titleEl = $('nvTitle');
            var descEl = $('nvDescription');
            var fileInput = $('nvFileInput');
            if (titleEl) titleEl.value = '';
            if (descEl) descEl.value = '';
            if (fileInput) fileInput.value = '';

            var progressFill = $('nvProgressFill');
            var progressText = $('nvProgressText');
            if (progressFill) progressFill.style.width = '0%';
            if (progressText) progressText.textContent = '0%';
        }

        async function submitUpload() {
            if (!nvSelectedFile) {
                showToast('⚠️ يرجى اختيار ملف أولاً', 'error');
                return;
            }

            var titleEl = $('nvTitle');
            var descEl = $('nvDescription');
            var title = titleEl ? titleEl.value.trim() : '';
            var description = descEl ? descEl.value.trim() : '';

            if (!title) {
                showToast('⚠️ يرجى إدخال عنوان الوثيقة', 'error');
                if (titleEl) titleEl.focus();
                return;
            }

            var formData = new FormData();
            formData.append('files', nvSelectedFile);
            formData.append('title', title);
            formData.append('description', description);

            var progress = $('nvProgress');
            var progressFill = $('nvProgressFill');
            var progressText = $('nvProgressText');
            var submitBtn = $('nvSubmitUpload');

            if (progress) progress.classList.add('show');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
            }

            try {
                var token = getToken();
                var csrf = getCsrfToken();

                // Use XMLHttpRequest for progress
                await new Promise(function(resolve, reject) {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/notes/upload');

                    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.withCredentials = true;

                    xhr.upload.addEventListener('progress', function(e) {
                        if (e.lengthComputable) {
                            var percent = Math.round((e.loaded / e.total) * 100);
                            if (progressFill) progressFill.style.width = percent + '%';
                            if (progressText) progressText.textContent = percent + '%';
                        }
                    });

                    xhr.addEventListener('load', function() {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(JSON.parse(xhr.responseText || '{}'));
                        } else {
                            var msg = 'فشل الرفع';
                            try {
                                var err = JSON.parse(xhr.responseText);
                                msg = err.error || err.message || msg;
                            } catch (e) {}
                            reject(new Error(msg));
                        }
                    });

                    xhr.addEventListener('error', function() {
                        reject(new Error('خطأ في الاتصال'));
                    });

                    xhr.send(formData);
                });

                showToast('✅ تم رفع الوثيقة بنجاح', 'success');

                clearUploadForm();

                // Reload current + archive
                verbaleCurrentLoaded = false;
                verbaleArchiveLoaded = false;
                await loadNoteVerbaleCurrent();
                await loadNoteVerbaleArchive();

            } catch (error) {
                console.error('❌ Upload error:', error);
                showToast('❌ ' + error.message, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-upload"></i> رفع الوثيقة';
                }
                if (progress) {
                    var tid = setTimeout(function() {
                        progress.classList.remove('show');
                    }, 1500);
                    _pageTimeouts.push(tid);
                }
            }
        }

        async function downloadArchiveItem(id) {
            if (!id) return;
            window.open('/api/notes/verbale/' + encodeURIComponent(id) + '/download', '_blank');
        }

        async function promoteArchiveItem(id) {
            if (!canDeleteVerbale()) {
                showToast('⚠️ ليس لديك صلاحية', 'error');
                return;
            }

            if (!confirm('⭐ هل تريد تعيين هذه الوثيقة كوثيقة حالية؟\n\nالوثيقة الحالية ستنقل للأرشيف.')) return;

            try {
                var response = await fetcher('/api/notes/verbale/' + encodeURIComponent(id) + '/set-current', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    var err = null;
                    try { err = await response.json(); } catch (_) {}
                    throw new Error(err && err.error || 'فشل التعيين');
                }

                showToast('✅ تم تعيين الوثيقة كحالية', 'success');

                verbaleCurrentLoaded = false;
                verbaleArchiveLoaded = false;
                await loadNoteVerbaleCurrent();
                await loadNoteVerbaleArchive();

            } catch (error) {
                console.error('❌ Promote error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        async function deleteArchiveItem(id) {
            if (!canDeleteVerbale()) {
                showToast('⚠️ ليس لديك صلاحية', 'error');
                return;
            }

            if (!confirm('🗑️ هل أنت متأكد من حذف هذه الوثيقة نهائياً؟')) return;

            try {
                var response = await fetcher('/api/notes/verbale/' + encodeURIComponent(id), {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    var err = null;
                    try { err = await response.json(); } catch (_) {}
                    throw new Error(err && err.error || 'فشل الحذف');
                }

                showToast('✅ تم حذف الوثيقة', 'success');

                verbaleCurrentLoaded = false;
                verbaleArchiveLoaded = false;
                await loadNoteVerbaleCurrent();
                await loadNoteVerbaleArchive();

            } catch (error) {
                console.error('❌ Delete verbale error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        // ============================================================
        // 🚀 INITIALIZATION
        // ============================================================
        function init() {
            if (_isDestroyed) return;

            console.log('🚀 Notes v10.0 initializing...');

            // Tabs
            document.querySelectorAll('.notes-tab').forEach(function(btn) {
                addSafeListener(btn, 'click', function() {
                    switchNotesTab(this.dataset.tab);
                });
            });

            // ===== Notes handlers =====
            addSafeListener($('saveNoteBtn'), 'click', saveNote);
            addSafeListener($('cancelEditBtn'), 'click', function() {
                clearNoteForm();
                showToast('تم إلغاء التعديل', 'info');
            });

            var dateEl = $('noteDate');
            if (dateEl) {
                try {
                    dateEl.value = new Date().toISOString().split('T')[0];
                } catch (_) {}
            }

            if (!canEdit()) {
                var saveBtn = $('saveNoteBtn');
                if (saveBtn) saveBtn.style.display = 'none';
                var titleEl = $('noteTitle');
                var contentEl = $('noteContent');
                var priorityEl = $('notePriority');
                [titleEl, contentEl, priorityEl].forEach(function(el) {
                    if (el) el.disabled = true;
                });
            }

            // ===== Note Verbale handlers =====
            var uploadCard = $('nvUploadCard');
            if (uploadCard && !canUploadVerbale()) {
                uploadCard.style.display = 'none';
            }

            var dropzone = $('nvDropzone');
            var fileInput = $('nvFileInput');
            if (dropzone && fileInput) {
                addSafeListener(dropzone, 'click', function() { fileInput.click(); });
                addSafeListener(dropzone, 'dragover', function(e) {
                    e.preventDefault();
                    dropzone.classList.add('dragover');
                });
                addSafeListener(dropzone, 'dragleave', function(e) {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                });
                addSafeListener(dropzone, 'drop', function(e) {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileSelected(e.dataTransfer.files[0]);
                    }
                });
            }

            if (fileInput) {
                addSafeListener(fileInput, 'change', function(e) {
                    if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                    }
                });
            }

            addSafeListener($('nvFileRemove'), 'click', function() {
                clearUploadForm();
            });

            addSafeListener($('nvSubmitUpload'), 'click', submitUpload);

            addSafeListener($('nvCancelUpload'), 'click', function() {
                clearUploadForm();
            });

            addSafeListener($('nvRefreshArchive'), 'click', function() {
                verbaleArchiveLoaded = false;
                loadNoteVerbaleArchive();
            });

            addSafeListener($('nvSearch'), 'input', function() {
                clearTimeout(window._nvSearchTimer);
                window._nvSearchTimer = setTimeout(function() {
                    verbaleArchiveLoaded = false;
                    loadNoteVerbaleArchive();
                }, 400);
            });

            addSafeListener($('nvFilterYear'), 'change', function() {
                verbaleArchiveLoaded = false;
                loadNoteVerbaleArchive();
            });

            addSafeListener($('nvFilterUploader'), 'change', function() {
                verbaleArchiveLoaded = false;
                loadNoteVerbaleArchive();
            });

            // Delegated click for archive actions
            var archiveList = $('nvArchiveList');
            if (archiveList) {
                addSafeListener(archiveList, 'click', function(e) {
                    var btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    if (action === 'download') downloadArchiveItem(id);
                    else if (action === 'promote') promoteArchiveItem(id);
                    else if (action === 'delete') deleteArchiveItem(id);
                });
            }

            // Initial load
            loadNotes();

            console.log('✅ Notes v10.0 ready');
        }

        // ============================================================
        // 🌐 GLOBAL EXPORTS
        // ============================================================
        window.saveNote = saveNote;
        window.loadNotes = loadNotes;
        window.editNote = editNote;
        window.deleteNote = deleteNote;
        window.switchNotesTab = switchNotesTab;
        window.loadNoteVerbaleCurrent = loadNoteVerbaleCurrent;
        window.loadNoteVerbaleArchive = loadNoteVerbaleArchive;

        // ============================================================
        // START
        // ============================================================
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }

    })();
</script>
</div>
