(function() {
    'use strict';
    if (typeof window.yearAgendaLoaded !== 'undefined') return;
    window.yearAgendaLoaded = true;

    var yearAgendaState = {
        rangeStart: 2020, rangeEnd: 2031,
        currentYear: new Date().getFullYear(),
        selected: 'الكل', dataYears: new Set()
    };

    function getMaintenanceData() {
        return (typeof window.maintenanceData !== 'undefined') ? window.maintenanceData : [];
    }

    function computeDataYears() {
        yearAgendaState.dataYears = new Set();
        var data = getMaintenanceData();
        data.forEach(function(r) {
            if (r.date) {
                try {
                    var y = new Date(r.date).getFullYear();
                    if (y && y > 1900 && y < 2200) yearAgendaState.dataYears.add(y);
                } catch (e) {}
            }
        });
        yearAgendaState.dataYears.add(yearAgendaState.currentYear);
        return yearAgendaState.dataYears;
    }

    function renderYearAgendaGrid() {
        var grid = document.getElementById('yearAgendaGrid');
        var rangeEl = document.getElementById('yearAgendaRange');
        if (!grid) return;
        var start = yearAgendaState.rangeStart;
        var end = yearAgendaState.rangeEnd;
        if (rangeEl) rangeEl.textContent = start + ' - ' + end;
        var html = '';
        for (var y = start; y <= end; y++) {
            var classes = ['year-cell'];
            if (y === yearAgendaState.currentYear) classes.push('current');
            if (yearAgendaState.dataYears.has(y)) classes.push('has-data');
            if (String(yearAgendaState.selected) === String(y)) classes.push('selected');
            html += '<div class="' + classes.join(' ') + '" onclick="selectYearAgenda(' + y + ')">' + y + '</div>';
        }
        grid.innerHTML = html;
    }

    function openYearAgenda(event) {
        if (event) event.stopPropagation();
        var dropdown = document.getElementById('yearAgendaDropdown');
        var display = document.getElementById('yearFilterDisplay');
        if (!dropdown) return;
        computeDataYears();
        renderYearAgendaGrid();
        dropdown.classList.toggle('open');
        if (display) display.classList.toggle('active', dropdown.classList.contains('open'));
    }

    function closeYearAgenda() {
        var dropdown = document.getElementById('yearAgendaDropdown');
        var display = document.getElementById('yearFilterDisplay');
        if (dropdown) dropdown.classList.remove('open');
        if (display) display.classList.remove('active');
    }

    function navigateYearAgenda(delta) {
        yearAgendaState.rangeStart += delta;
        yearAgendaState.rangeEnd += delta;
        renderYearAgendaGrid();
    }

    function selectYearAgenda(year) {
        yearAgendaState.selected = String(year);
        var hidden = document.getElementById('yearFilter');
        var display = document.getElementById('yearFilterDisplay');
        if (hidden) hidden.value = String(year);
        if (display) display.value = String(year);
        closeYearAgenda();
        if (typeof window.renderTable === 'function') window.renderTable();
        if (typeof window.showToast === 'function') window.showToast('📅 السنة: ' + year, 'info');
    }

    function selectAllYears() {
        yearAgendaState.selected = 'الكل';
        var hidden = document.getElementById('yearFilter');
        var display = document.getElementById('yearFilterDisplay');
        if (hidden) hidden.value = 'الكل';
        if (display) display.value = '';
        closeYearAgenda();
        if (typeof window.renderTable === 'function') window.renderTable();
        if (typeof window.showToast === 'function') window.showToast('📅 عرض كل السنوات', 'info');
    }

    document.addEventListener('click', function(e) {
        var dropdown = document.getElementById('yearAgendaDropdown');
        var wrapper = document.querySelector('.year-agenda-wrapper');
        if (!dropdown || !dropdown.classList.contains('open')) return;
        if (wrapper && wrapper.contains(e.target)) return;
        closeYearAgenda();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeYearAgenda();
    });

    window.openYearAgenda = openYearAgenda;
    window.closeYearAgenda = closeYearAgenda;
    window.navigateYearAgenda = navigateYearAgenda;
    window.selectYearAgenda = selectYearAgenda;
    window.selectAllYears = selectAllYears;
    window.renderYearAgendaGrid = renderYearAgendaGrid;
    window.computeDataYears = computeDataYears;

    console.log('✅ Year Agenda v1.0 ready');
})();
