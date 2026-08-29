/**
 * 🧩 مكونات الواجهة القابلة لإعادة الاستخدام
 * @module components
 */

// ============================================================
// 📊 DATA TABLE - جدول بيانات تفاعلي
// ============================================================

class DataTable {
    constructor(options = {}) {
        this.options = {
            columns: options.columns || [],
            data: options.data || [],
            perPage: options.perPage || 10,
            searchable: options.searchable !== undefined ? options.searchable : true,
            sortable: options.sortable !== undefined ? options.sortable : true,
            pagination: options.pagination !== undefined ? options.pagination : true,
            onRowClick: options.onRowClick || null,
            onAction: options.onAction || null,
            ...options
        };
        
        this.currentPage = 1;
        this.searchQuery = '';
        this.sortField = null;
        this.sortOrder = 'asc';
        this.filteredData = [...this.options.data];
        this.element = null;
    }
    
    render(container) {
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        
        if (!container) {
            console.error('❌ [DataTable] Container not found');
            return;
        }
        
        this.element = container;
        this.renderTable();
        this.setupEvents();
    }
    
    renderTable() {
        const data = this.getPageData();
        const totalPages = this.getTotalPages();
        
        let html = `
            <div class="table-container">
                ${this.renderSearch()}
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                ${this.renderHeaders()}
                                ${this.options.onAction ? '<th style="width:80px;">الإجراءات</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.length > 0 ? this.renderRows(data) : this.renderEmpty()}
                        </tbody>
                    </table>
                </div>
                ${this.options.pagination ? this.renderPagination(totalPages) : ''}
            </div>
        `;
        
        this.element.innerHTML = html;
    }
    
    renderSearch() {
        if (!this.options.searchable) return '';
        return `
            <div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;">
                <div style="flex:1;min-width:200px;">
                    <div class="input-wrapper" style="max-width:300px;">
                        <i class="fas fa-search input-icon"></i>
                        <input type="text" id="tableSearch" placeholder="بحث..." value="${this.searchQuery}">
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-sm btn-secondary" onclick="this.closest('.table-container').querySelector('#tableSearch').value='';this.closest('.table-container').querySelector('#tableSearch').dispatchEvent(new Event('input'));">
                        <i class="fas fa-times"></i> مسح
                    </button>
                    <span style="color:var(--text-dim);font-size:13px;display:flex;align-items:center;">
                        <i class="fas fa-database"></i> ${this.filteredData.length} سجل
                    </span>
                </div>
            </div>
        `;
    }
    
    renderHeaders() {
        return this.options.columns.map(col => `
            <th ${col.sortable !== false ? `data-sort="${col.key}" style="cursor:pointer;"` : ''}>
                ${col.label}
                ${col.sortable !== false ? `
                    <i class="fas fa-sort" style="font-size:10px;margin-right:4px;color:var(--text-dim);"></i>
                ` : ''}
            </th>
        `).join('');
    }
    
    renderRows(data) {
        return data.map(row => `
            <tr ${this.options.onRowClick ? `style="cursor:pointer;"` : ''}>
                ${this.options.columns.map(col => `
                    <td>${this.renderCell(row, col)}</td>
                `).join('')}
                ${this.options.onAction ? `
                    <td>
                        ${this.options.onAction(row)}
                    </td>
                ` : ''}
            </tr>
        `).join('');
    }
    
    renderCell(row, col) {
        let value = row[col.key];
        
        if (col.render) {
            return col.render(value, row);
        }
        
        if (col.type === 'badge') {
            const statusMap = {
                active: '<span class="status-badge active">✅ نشط</span>',
                inactive: '<span class="status-badge inactive">❌ غير نشط</span>',
                maintenance: '<span class="status-badge maintenance">🔧 صيانة</span>',
                reserve: '<span class="status-badge reserve">📋 احتياطي</span>'
            };
            return statusMap[value] || value;
        }
        
        if (col.type === 'date') {
            return new Date(value).toLocaleDateString('ar-TN');
        }
        
        if (col.type === 'currency') {
            return value + ' د.ت';
        }
        
        return value || '-';
    }
    
    renderEmpty() {
        return `
            <tr>
                <td colspan="${this.options.columns.length + (this.options.onAction ? 1 : 0)}" style="padding:40px;text-align:center;color:var(--text-dim);">
                    <i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    لا توجد بيانات
                </td>
            </tr>
        `;
    }
    
    renderPagination(totalPages) {
        if (totalPages <= 1) return '';
        
        let pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - this.currentPage) <= 1) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        
        return `
            <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div style="color:var(--text-dim);font-size:13px;">
                    عرض ${(this.currentPage - 1) * this.options.perPage + 1} - ${Math.min(this.currentPage * this.options.perPage, this.filteredData.length)} من ${this.filteredData.length}
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-secondary" data-page="prev" ${this.currentPage <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    ${pages.map(p => `
                        <button class="btn btn-sm ${p === this.currentPage ? 'btn-primary' : 'btn-secondary'}" 
                                data-page="${p}" ${p === '...' ? 'disabled' : ''}>
                            ${p}
                        </button>
                    `).join('')}
                    <button class="btn btn-sm btn-secondary" data-page="next" ${this.currentPage >= totalPages ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    setupEvents() {
        // البحث
        const searchInput = this.element.querySelector('#tableSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.filterData();
                this.currentPage = 1;
                this.renderTable();
            });
        }
        
        // الفرز
        if (this.options.sortable) {
            this.element.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => {
                    const field = th.dataset.sort;
                    if (this.sortField === field) {
                        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortField = field;
                        this.sortOrder = 'asc';
                    }
                    this.sortData();
                    this.renderTable();
                });
            });
        }
        
        // الصفحات
        this.element.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page === 'prev') {
                    this.currentPage = Math.max(1, this.currentPage - 1);
                } else if (page === 'next') {
                    this.currentPage = Math.min(this.getTotalPages(), this.currentPage + 1);
                } else {
                    this.currentPage = parseInt(page);
                }
                this.renderTable();
            });
        });
        
        // صفوف
        if (this.options.onRowClick) {
            this.element.querySelectorAll('tbody tr').forEach(row => {
                row.addEventListener('click', () => {
                    const index = Array.from(row.parentElement.children).indexOf(row);
                    const data = this.getPageData()[index];
                    if (data) this.options.onRowClick(data);
                });
            });
        }
    }
    
    filterData() {
        if (!this.searchQuery) {
            this.filteredData = [...this.options.data];
            return;
        }
        
        const query = this.searchQuery.toLowerCase();
        this.filteredData = this.options.data.filter(row => {
            return this.options.columns.some(col => {
                const value = String(row[col.key] || '').toLowerCase();
                return value.includes(query);
            });
        });
    }
    
    sortData() {
        if (!this.sortField) return;
        
        this.filteredData.sort((a, b) => {
            let valA = a[this.sortField] || '';
            let valB = b[this.sortField] || '';
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    getPageData() {
        const start = (this.currentPage - 1) * this.options.perPage;
        const end = start + this.options.perPage;
        return this.filteredData.slice(start, end);
    }
    
    getTotalPages() {
        return Math.ceil(this.filteredData.length / this.options.perPage);
    }
    
    updateData(data) {
        this.options.data = data;
        this.filteredData = [...data];
        this.currentPage = 1;
        this.renderTable();
    }
}

// ============================================================
// 🎯 EXPORT
// ============================================================

export { DataTable };
