// ============================================================
// ACCESS CONTROL
// ============================================================
(function enforceRefererPolicy() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const expected = btoa('hr-access-' + new Date().toDateString());
    const isAllowed = token === expected;
    if (isAllowed) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (!isAllowed) {
        document.documentElement.innerHTML = `
            <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
            <style>
                body { font-family:'Segoe UI',sans-serif; background:#f1f5f9; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
                .container { background:white; border-radius:16px; padding:3rem 4rem; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,.1); max-width:480px; }
                h1 { color:#dc2626; } p { color:#6b7280; line-height:1.6; }
                a { display:inline-block; background:#2563eb; color:white; padding:.75rem 2rem; border-radius:8px; text-decoration:none; font-weight:600; }
            </style></head>
            <body><div class="container">
                <div style="font-size:4rem">🔒</div>
                <h1>Accès refusé</h1>
                <p>Cette page est accessible uniquement via l'application <strong>AVOCarbon HR Management</strong>.</p>
                <a href="https://avo-hr-managment.azurewebsites.net/dashboard">Aller vers HR Management</a>
            </div></body></html>`;
        throw new Error('Access denied');
    }
})();

// ============================================================
// ATTENDANCE SYSTEM
// ============================================================

class AttendanceSystem {
    constructor() {
        this.baseUrl = 'https://pointeuse-back.azurewebsites.net/api';

        // ── Master data (loaded once from DB) ──────────────────
        this.allData = [];        // ALL attendance records from DB
        this.allEmployees = [];   // ALL employees from DB

        // ── Current filtered/displayed data ────────────────────
        this.filteredData = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;

        // ── Current filter state ────────────────────────────────
        this.filters = {
            date: new Date().toISOString().split('T')[0], // default = today
            employeeUid: '',
            search: '',
            sort: 'date-desc',
            view: 'by-date', // 'all' | 'by-date' | 'by-employee' | 'today'
        };

        // ── Auto-refresh ────────────────────────────────────────
        this.autoRefreshInterval = null;
        this.AUTO_REFRESH_MS = 2 * 60 * 1000; // 2 minutes

        this.initializeElements();
        this.setupEventListeners();
        this.loadAllData();      // fetch everything once
        this.startClock();
        this.startAutoRefresh();
    }

    // ── DOM elements ───────────────────────────────────────────
    initializeElements() {
        this.tableBody = document.getElementById('table-body');
        this.pageInfo = document.getElementById('page-info');
        this.prevPageBtn = document.getElementById('prev-page');
        this.nextPageBtn = document.getElementById('next-page');
        this.firstPageBtn = document.getElementById('first-page');
        this.lastPageBtn = document.getElementById('last-page');
        this.pageNumbers = document.getElementById('page-numbers');
        this.pageSizeSelect = document.getElementById('page-size');

        this.dateFilter = document.getElementById('date-filter');
        this.searchFilter = document.getElementById('search-filter');
        this.sortFilter = document.getElementById('sort-filter');
        this.employeeFilter = document.getElementById('employee-filter');
        this.viewModeSelect = document.getElementById('view-mode');

        this.refreshBtn = document.getElementById('refresh-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.debugBtn = document.getElementById('debug-btn');
        this.helpBtn = document.getElementById('help-btn');
        this.toggleStatsBtn = document.getElementById('toggle-stats');

        this.totalUsers = document.getElementById('total-users');
        this.totalDays = document.getElementById('total-days');
        this.totalLogs = document.getElementById('total-logs');
        this.totalRecords = document.getElementById('total-records');
        this.lastUpdate = document.getElementById('last-update');
        this.connectionStatus = document.getElementById('connection-status');
        this.backendStatus = document.getElementById('backend-status');
        this.deviceStatus = document.getElementById('device-status');

        this.modal = document.getElementById('details-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalBody = document.getElementById('modal-body');
        this.closeModalBtn = document.querySelector('.close-modal');
        this.closeModalBtn2 = document.getElementById('close-modal-btn');
        this.exportDetailsBtn = document.getElementById('export-details-btn');

        this.debugModal = document.getElementById('debug-modal');
        this.helpModal = document.getElementById('help-modal');
        this.statsSection = document.getElementById('stats-section');
        this.statsContent = document.getElementById('stats-content');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingMessage = document.getElementById('loading-message');

        // Set default date filter to today
        this.dateFilter.value = this.filters.date;
    }

    // ── Event listeners ────────────────────────────────────────
    setupEventListeners() {
        // Pagination
        this.prevPageBtn.addEventListener('click', () => this.prevPage());
        this.nextPageBtn.addEventListener('click', () => this.nextPage());
        this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
        this.lastPageBtn.addEventListener('click', () => this.goToLastPage());
        this.pageSizeSelect.addEventListener('change', () => {
            this.itemsPerPage = parseInt(this.pageSizeSelect.value);
            this.currentPage = 1;
            this.renderTable();
            this.updatePagination();
        });

        // View mode → just re-filter locally, no API call
        this.viewModeSelect.addEventListener('change', (e) => {
            this.filters.view = e.target.value;
            this.currentPage = 1;
            if (this.filters.view === 'today') {
                this.filters.date = new Date().toISOString().split('T')[0];
                this.dateFilter.value = this.filters.date;
            }
            this.applyFilters(); // local filter only
        });

        // Date filter → re-filter locally
        this.dateFilter.addEventListener('change', (e) => {
            this.filters.date = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
        });

        // Employee filter → re-filter locally
        this.employeeFilter.addEventListener('change', (e) => {
            this.filters.employeeUid = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
        });

        // Search → re-filter locally
        this.searchFilter.addEventListener('input', () => {
            this.currentPage = 1;
            this.applyFilters();
        });

        // Sort → re-filter locally
        this.sortFilter.addEventListener('change', () => {
            this.applyFilters();
        });

        // Buttons
        this.refreshBtn.addEventListener('click', () => this.manualRefresh());
        this.exportBtn.addEventListener('click', () => this.exportData());
        this.debugBtn.addEventListener('click', () => this.showDebugInfo());
        this.helpBtn.addEventListener('click', () => this.showHelp());
        this.toggleStatsBtn.addEventListener('click', () => this.toggleStats());

        // Modal
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.closeModalBtn2.addEventListener('click', () => this.closeModal());
        this.exportDetailsBtn.addEventListener('click', () => this.exportDetails());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
            if (e.target === this.debugModal) this.debugModal.style.display = 'none';
            if (e.target === this.helpModal) this.helpModal.style.display = 'none';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                if (this.debugModal) this.debugModal.style.display = 'none';
                if (this.helpModal) this.helpModal.style.display = 'none';
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    // LOAD ALL DATA — called once on startup and after sync
    // Fetches ALL attendance history from DB
    // Then applies local filters
    // ══════════════════════════════════════════════════════════
    async loadAllData() {
        try {
            this.showLoading('Chargement des données...');

            // Check backend health
            try {
                const healthRes = await fetch(`${this.baseUrl}/health`);
                if (healthRes.ok) {
                    this.backendStatus.textContent = '● En ligne';
                    this.backendStatus.className = 'status-indicator online';
                } else {
                    this.backendStatus.textContent = '● Hors ligne';
                    this.backendStatus.className = 'status-indicator offline';
                }
            } catch (e) {
                this.backendStatus.textContent = '● Hors ligne';
                this.backendStatus.className = 'status-indicator offline';
            }

            // Fetch ALL attendance data and employees in parallel
            const [attendanceRes, employeesRes, summaryRes] = await Promise.all([
                fetch(`${this.baseUrl}/attendance`),
                fetch(`${this.baseUrl}/employees`),
                fetch(`${this.baseUrl}/summary`),
            ]);

            const [attendanceData, employeesData, summaryData] = await Promise.all([
                attendanceRes.json(),
                employeesRes.json(),
                summaryRes.json(),
            ]);

            // Store ALL data locally
            if (attendanceData.success) {
                this.allData = attendanceData.data || [];
                console.log(`✅ Loaded ${this.allData.length} attendance records`);
            }

            if (employeesData.success) {
                this.allEmployees = employeesData.employees || [];
                this.populateEmployeeFilter();
            }

            if (summaryData.success) {
                this.updateSummary(summaryData.summary);
                // Update device status based on last sync
                const lastSync = summaryData.summary.lastSync;
                if (lastSync && lastSync.success) {
                    this.deviceStatus.textContent = '● Sync OK';
                    this.deviceStatus.className = 'status-indicator online';
                } else {
                    this.deviceStatus.textContent = '● Sync en attente';
                    this.deviceStatus.className = 'status-indicator offline';
                }
            }

            this.lastUpdate.textContent = new Date().toLocaleString('fr-FR');
            this.connectionStatus.textContent = '● Connecté';
            this.connectionStatus.className = 'status-connected';

            // Apply filters locally — no more API calls for filtering
            this.applyFilters();
            this.hideLoading();

        } catch (error) {
            console.error('❌ Failed to load data:', error);
            this.showError('Impossible de charger les données');
            this.connectionStatus.textContent = '● Déconnecté';
            this.connectionStatus.className = 'status-disconnected';
            this.backendStatus.textContent = '● Hors ligne';
            this.backendStatus.className = 'status-indicator offline';
            this.hideLoading();
        }
    }

    // ══════════════════════════════════════════════════════════
    // APPLY FILTERS — purely local, no API call
    // Filters this.allData based on current filter state
    // ══════════════════════════════════════════════════════════
    applyFilters() {
        let data = [...this.allData];
        const today = new Date().toISOString().split('T')[0];

        // ── View mode filter ──────────────────────────────────
        switch (this.filters.view) {
            case 'today':
                data = data.filter(r => r.date === today);
                break;
            case 'by-date':
                if (this.filters.date) {
                    data = data.filter(r => r.date === this.filters.date);
                }
                break;
            case 'by-employee':
                if (this.filters.employeeUid) {
                    data = data.filter(r => r.uid.toString() === this.filters.employeeUid.toString());
                }
                break;
            case 'all':
            default:
                // No view filter — apply date + employee if set
                if (this.filters.date && this.dateFilter.value) {
                    data = data.filter(r => r.date === this.filters.date);
                }
                if (this.filters.employeeUid && this.employeeFilter.value) {
                    data = data.filter(r => r.uid.toString() === this.filters.employeeUid.toString());
                }
                break;
        }

        // ── Search filter ─────────────────────────────────────
        const searchTerm = this.searchFilter.value.toLowerCase().trim();
        if (searchTerm) {
            data = data.filter(r => {
                const searchStr = `${r.name || ''} ${r.cardNo || ''} ${r.userId || ''} ${r.date || ''}`.toLowerCase();
                return searchStr.includes(searchTerm);
            });
        }

        // ── Sort ──────────────────────────────────────────────
        const sortValue = this.sortFilter.value;
        data.sort((a, b) => {
            switch (sortValue) {
                case 'date-desc': return b.date.localeCompare(a.date);
                case 'date-asc':  return a.date.localeCompare(b.date);
                case 'name-asc':  return (a.name || '').localeCompare(b.name || '');
                case 'name-desc': return (b.name || '').localeCompare(a.name || '');
                case 'arrival-asc':   return (a.arrivalTime || '99:99').localeCompare(b.arrivalTime || '99:99');
                case 'arrival-desc':  return (b.arrivalTime || '00:00').localeCompare(a.arrivalTime || '00:00');
                case 'departure-asc': return (a.departureTime || '99:99').localeCompare(b.departureTime || '99:99');
                case 'departure-desc':return (b.departureTime || '00:00').localeCompare(a.departureTime || '00:00');
                case 'status': {
                    const order = { "À l'heure": 0, 'Présent': 1, 'En cours': 2, 'En retard': 3, 'Absent': 4 };
                    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
                }
                default: return 0;
            }
        });

        this.filteredData = data;
        this.updateStats();
        this.renderTable();
        this.updatePagination();
        this.updateTableTitle();
    }

    // ── Update stats based on filtered data ───────────────────
    updateStats() {
        if (!this.statsContent) return;
        const data = this.filteredData;
        const present = data.filter(r => r.status === 'Présent' || r.status === "À l'heure").length;
        const late = data.filter(r => r.status === 'En retard').length;
        const absent = data.filter(r => r.status === 'Absent').length;
        const inProgress = data.filter(r => r.status === 'En cours').length;
        const withHours = data.filter(r => parseFloat(r.hoursWorked) > 0);
        const avgHours = withHours.length > 0
            ? (withHours.reduce((s, r) => s + parseFloat(r.hoursWorked), 0) / withHours.length).toFixed(2)
            : 0;

        this.statsContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item"><div class="stat-value">${data.length}</div><div class="stat-label">Enregistrements</div></div>
                <div class="stat-item"><div class="stat-value">${present}</div><div class="stat-label">Présents</div></div>
                <div class="stat-item"><div class="stat-value">${late}</div><div class="stat-label">Retards</div></div>
                <div class="stat-item"><div class="stat-value">${inProgress}</div><div class="stat-label">En cours</div></div>
                <div class="stat-item"><div class="stat-value">${absent}</div><div class="stat-label">Absents</div></div>
                <div class="stat-item"><div class="stat-value">${avgHours}h</div><div class="stat-label">Moy. heures</div></div>
            </div>`;
    }

    // ── Update table title ─────────────────────────────────────
    updateTableTitle() {
        let titleElement = document.getElementById('table-title');
        if (!titleElement) {
            titleElement = document.createElement('h2');
            titleElement.id = 'table-title';
            const header = document.querySelector('.table-header');
            if (header) header.prepend(titleElement);
        }
        const titles = {
            'all': 'Tous les pointages',
            'today': `Pointages du jour — ${this.formatDate(new Date().toISOString().split('T')[0])}`,
            'by-date': `Pointages du ${this.formatDate(this.filters.date)}`,
            'by-employee': (() => {
                const emp = this.allEmployees.find(e => e.uid.toString() === this.filters.employeeUid?.toString());
                return emp ? `Historique — ${emp.name}` : 'Historique employé';
            })(),
        };
        titleElement.textContent = `${titles[this.filters.view] || 'Pointages'} (${this.filteredData.length} résultats)`;
    }

    // ── Populate employee dropdown ────────────────────────────
    populateEmployeeFilter() {
        this.employeeFilter.innerHTML = '<option value="">-- Tous les employés --</option>';
        this.allEmployees
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.uid;
                option.textContent = `${emp.name} (${emp.matricule || 'N/A'})`;
                this.employeeFilter.appendChild(option);
            });
    }

    // ── Render table ──────────────────────────────────────────
    renderTable() {
        if (this.filteredData.length === 0) {
            this.tableBody.innerHTML = `
                <tr><td colspan="9" class="no-data">
                    <div style="text-align:center; padding:3rem;">
                        <i class="fas fa-inbox" style="font-size:4rem; color:#9ca3af; margin-bottom:1rem; opacity:0.5;"></i>
                        <h3 style="color:#6b7280; margin-bottom:.5rem;">Aucune donnée disponible</h3>
                        <p style="color:#9ca3af;">Essayez de changer les filtres ou de rafraîchir les données</p>
                        <button onclick="attendanceSystem.manualRefresh()" style="margin-top:1rem; padding:.75rem 1.5rem; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">
                            <i class="fas fa-sync-alt"></i> Rafraîchir
                        </button>
                    </div>
                </td></tr>`;
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const pageData = this.filteredData.slice(startIndex, startIndex + this.itemsPerPage);
        const today = new Date().toISOString().split('T')[0];

        let tableHTML = '';
        pageData.forEach(record => {
            const status = this.getAttendanceStatus(record);
            const statusClass = this.getStatusClass(status);
            const hoursColor = this.getHoursColor(record.hoursWorked);
            const isToday = record.date === today;

            const entriesDisplay = record.entries && record.entries.length > 0
                ? record.entries.map(e => {
                    const icon = e.type === 0 ? '⬇️' : e.type === 1 ? '⬆️' : '↔️';
                    const cls = e.type === 0 ? 'arrival-entry' : 'departure-entry';
                    return `<span class="time-entry ${cls}">${icon} ${e.time}</span>`;
                }).join(' ')
                : '<span style="color:#9ca3af; font-style:italic;">Aucun pointage</span>';

            tableHTML += `
                <tr onclick="attendanceSystem.showDetails('${record.uid}', '${record.date}')" style="cursor:pointer;">
                    <td style="border-left:4px solid ${isToday ? '#3b82f6' : 'transparent'};">
                        <strong style="color:#1f2937;">${record.cardNo || 'N/A'}</strong><br>
                        <small style="color:#6b7280;">Mat: ${record.userId || 'N/A'}</small>
                    </td>
                    <td><div style="font-weight:600; color:#111827;">${record.name || '—'}</div></td>
                    <td>
                        <div style="font-weight:500;">${this.formatDate(record.date)}</div>
                        <div style="color:#6b7280; font-size:.85rem;">${record.dayName || ''}</div>
                        ${isToday ? '<span class="today-badge">Aujourd\'hui</span>' : ''}
                    </td>
                    <td>${record.arrivalTime
                        ? `<div class="time-display arrival-time">${record.arrivalTime}</div>`
                        : '<div class="time-display empty-time">-</div>'}</td>
                    <td>${record.departureTime
                        ? `<div class="time-display departure-time">${record.departureTime}</div>`
                        : `<div class="time-display empty-time ${isToday ? 'pending-time' : ''}">${isToday ? 'En attente' : '-'}</div>`}</td>
                    <td><div class="hours-display" style="color:${hoursColor}">${parseFloat(record.hoursWorked) > 0
                        ? `${record.hoursWorked}h`
                        : (isToday && record.arrivalTime ? 'En cours...' : '-')}</div></td>
                    <td><div class="entries-container">${entriesDisplay}</div></td>
                    <td><span class="status-badge ${statusClass}">${status}</span></td>
                    <td><button onclick="event.stopPropagation(); attendanceSystem.showDetails('${record.uid}', '${record.date}')" class="btn-small action-btn"><i class="fas fa-eye"></i></button></td>
                </tr>`;
        });

        this.tableBody.innerHTML = tableHTML;
    }

    // ── Show record details ────────────────────────────────────
    showDetails(uid, date) {
        // Find record in local data — no API call needed
        const record = this.allData.find(r =>
            r.uid.toString() === uid.toString() && r.date === date
        );

        if (!record) {
            this.showNotification('Enregistrement introuvable', 'error');
            return;
        }

        const employee = this.allEmployees.find(e => e.uid.toString() === uid.toString());
        const isToday = record.date === new Date().toISOString().split('T')[0];
        const status = this.getAttendanceStatus(record);
        const statusClass = this.getStatusClass(status);

        this.modalTitle.textContent = `Détails — ${record.name || 'Employé'} — ${this.formatDate(date)}`;

        let modalHTML = `
            <div class="employee-info-section">
                <h3><i class="fas fa-user"></i> Informations employé</h3>
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">Matricule</div><div class="info-value">${record.cardNo || 'N/A'}</div></div>
                    <div class="info-item"><div class="info-label">ID</div><div class="info-value">${record.userId || 'N/A'}</div></div>
                    <div class="info-item"><div class="info-label">Nom</div><div class="info-value">${record.name || '—'}</div></div>
                    <div class="info-item"><div class="info-label">Jour</div><div class="info-value">${record.dayName || ''}</div></div>
                </div>
            </div>
            <div class="attendance-section">
                <h3><i class="fas fa-clock"></i> Présence ${isToday ? '<span class="today-indicator">Aujourd\'hui</span>' : ''}</h3>
                <div class="attendance-grid">
                    <div class="attendance-card arrival-card">
                        <div class="card-icon"><i class="fas fa-sign-in-alt"></i></div>
                        <div class="card-content"><div class="card-label">Arrivée</div><div class="card-value">${record.arrivalTime || '-'}</div></div>
                    </div>
                    <div class="attendance-card departure-card">
                        <div class="card-icon"><i class="fas fa-sign-out-alt"></i></div>
                        <div class="card-content"><div class="card-label">Départ</div><div class="card-value">${record.departureTime || (isToday ? 'En attente' : '-')}</div></div>
                    </div>
                    <div class="attendance-card hours-card">
                        <div class="card-icon"><i class="fas fa-business-time"></i></div>
                        <div class="card-content"><div class="card-label">Heures</div><div class="card-value">${parseFloat(record.hoursWorked) > 0 ? `${record.hoursWorked}h` : '-'}</div></div>
                    </div>
                    <div class="attendance-card status-card">
                        <div class="card-icon"><i class="fas fa-info-circle"></i></div>
                        <div class="card-content"><div class="card-label">Statut</div><div class="card-value"><span class="status-badge ${statusClass}">${status}</span></div></div>
                    </div>
                </div>
            </div>`;

        if (record.entries && record.entries.length > 0) {
            modalHTML += `
                <div class="entries-section">
                    <h3><i class="fas fa-list"></i> Pointages (${record.entries.length})</h3>
                    <div class="entries-grid">
                        ${record.entries.map(e => `
                            <div class="entry-card ${e.type === 0 ? 'entry-arrival' : 'entry-departure'}">
                                <div class="entry-time">${e.time}</div>
                                <div class="entry-type">${e.type === 0 ? 'Arrivée' : e.type === 1 ? 'Départ' : 'Passage'}</div>
                            </div>`).join('')}
                    </div>
                </div>`;
        }

        this.modalBody.innerHTML = modalHTML;
        this.modal.style.display = 'flex';
    }

    closeModal() { this.modal.style.display = 'none'; }

    exportDetails() {
        const blob = new Blob([this.modalBody.innerHTML], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `details_${this.modalTitle.textContent.replace(/[^a-z0-9]/gi, '_')}.html`;
        a.click();
        this.showNotification('Détails exportés', 'success');
    }

    // ══════════════════════════════════════════════════════════
    // MANUAL REFRESH
    // 1. Trigger device sync (POST /api/sync)
    // 2. Reload ALL data from DB (GET /api/attendance)
    // 3. Re-apply current filters locally
    // ══════════════════════════════════════════════════════════
    async manualRefresh() {
        try {
            this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synchronisation...';
            this.refreshBtn.disabled = true;

            // Step 1: trigger device sync
            let syncSuccess = false;
            try {
                const syncRes = await fetch(`${this.baseUrl}/sync`, { method: 'POST' });
                const syncData = await syncRes.json();
                syncSuccess = syncData.success;
                if (syncSuccess) {
                    this.showNotification('Synchronisation avec la pointeuse réussie', 'success');
                } else {
                    this.showNotification(`Pointeuse hors ligne — données depuis la dernière sync`, 'warning');
                }
            } catch (syncError) {
                this.showNotification('Pointeuse hors ligne — affichage des dernières données connues', 'warning');
            }

            // Step 2: reload ALL fresh data from DB
            await this.loadAllData();

        } catch (error) {
            console.error('Refresh error:', error);
            this.showNotification('Erreur lors du rafraîchissement', 'error');
        } finally {
            this.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Rafraîchir';
            this.refreshBtn.disabled = false;
        }
    }

    // ══════════════════════════════════════════════════════════
    // AUTO REFRESH
    // Every 2 minutes: reload ALL data from DB silently
    // Does NOT trigger device sync (that's handled by background job)
    // ══════════════════════════════════════════════════════════
    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(async () => {
            if (document.visibilityState !== 'visible') return;
            console.log('🔄 Auto-refresh: reloading data from DB...');
            try {
                const [attendanceRes, summaryRes] = await Promise.all([
                    fetch(`${this.baseUrl}/attendance`),
                    fetch(`${this.baseUrl}/summary`),
                ]);
                const [attendanceData, summaryData] = await Promise.all([
                    attendanceRes.json(),
                    summaryRes.json(),
                ]);
                if (attendanceData.success) {
                    this.allData = attendanceData.data || [];
                    this.applyFilters(); // re-filter with new data
                    console.log(`✅ Auto-refresh: ${this.allData.length} records`);
                }
                if (summaryData.success) {
                    this.updateSummary(summaryData.summary);
                }
                this.lastUpdate.textContent = new Date().toLocaleString('fr-FR');
            } catch (e) {
                console.warn('Auto-refresh failed:', e.message);
            }
        }, this.AUTO_REFRESH_MS);
    }

    // ── Export to CSV ──────────────────────────────────────────
    exportData() {
        if (this.filteredData.length === 0) {
            this.showNotification('Aucune donnée à exporter', 'warning');
            return;
        }
        const rows = this.filteredData.map(r => ({
            Matricule: r.cardNo || '',
            Nom: r.name || '',
            'ID Employé': r.userId || '',
            Date: r.date || '',
            Jour: r.dayName || '',
            'Heure arrivée': r.arrivalTime || '',
            'Heure départ': r.departureTime || '',
            'Heures travaillées': r.hoursWorked || '0.00',
            Statut: this.getAttendanceStatus(r),
            'Nb pointages': r.entries ? r.entries.length : 0,
        }));
        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map(row => headers.map(h => {
                const v = String(row[h] ?? '');
                return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
            }).join(','))
        ].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `presences_${new Date().toISOString().split('T')[0]}_${this.filteredData.length}lignes.csv`;
        a.click();
        this.showNotification(`${this.filteredData.length} lignes exportées`, 'success');
    }

    // ── Summary update ─────────────────────────────────────────
    updateSummary(summary) {
        if (this.totalUsers) this.totalUsers.textContent = summary.totalEmployees || 0;
        if (this.totalRecords) this.totalRecords.textContent = summary.totalRecords || 0;
        if (this.totalDays) this.totalDays.textContent = summary.today?.date || '—';
        if (this.totalLogs) this.totalLogs.textContent =
            `${summary.today?.present || 0} présents / ${summary.today?.absent || 0} absents`;
        if (this.lastUpdate) this.lastUpdate.textContent = new Date().toLocaleString('fr-FR');
    }

    // ── Debug info ─────────────────────────────────────────────
    async showDebugInfo() {
        try {
            this.showLoading('Chargement debug...');
            const [syncHistoryRes, syncStatusRes] = await Promise.all([
                fetch(`${this.baseUrl}/sync/history`),
                fetch(`${this.baseUrl}/sync/status`),
            ]);
            const [historyData, statusData] = await Promise.all([
                syncHistoryRes.json(),
                syncStatusRes.json(),
            ]);

            let html = `
                <div class="debug-stats">
                    <div class="debug-stat"><span class="stat-label">Records en mémoire:</span><span class="stat-value">${this.allData.length}</span></div>
                    <div class="debug-stat"><span class="stat-label">Employés:</span><span class="stat-value">${this.allEmployees.length}</span></div>
                    <div class="debug-stat"><span class="stat-label">Syncing:</span><span class="stat-value">${statusData.status?.isSyncing ? 'Oui' : 'Non'}</span></div>
                    <div class="debug-stat"><span class="stat-label">Dernière sync:</span><span class="stat-value">${statusData.status?.lastSyncAt ? new Date(statusData.status.lastSyncAt).toLocaleString('fr-FR') : 'Jamais'}</span></div>
                </div>
                <h4 style="margin-top:1.5rem;">Historique des synchronisations</h4>
                <div style="max-height:300px; overflow-y:auto;">
                    ${(historyData.history || []).map(s => `
                        <div style="padding:.75rem; margin-bottom:.5rem; border-radius:6px; background:${s.success ? '#d1fae5' : '#fee2e2'}; border-left:4px solid ${s.success ? '#10b981' : '#ef4444'}">
                            <strong>${new Date(s.started_at).toLocaleString('fr-FR')}</strong>
                            <span style="margin-left:1rem;">${s.success ? '✅' : '❌'} ${s.message}</span>
                        </div>`).join('')}
                </div>`;

            this.debugModal.querySelector('#debug-body').innerHTML = html;
            this.debugModal.style.display = 'flex';
            this.hideLoading();
        } catch (e) {
            this.showNotification('Erreur debug', 'error');
            this.hideLoading();
        }
    }

    showHelp() {
        this.helpModal.querySelector('#help-body').innerHTML = `
            <div class="help-content">
                <h3>Guide d'utilisation</h3>
                <div class="help-section"><h4>Modes d'affichage</h4><ul>
                    <li><strong>Tous:</strong> Tous les enregistrements (filtré par date par défaut)</li>
                    <li><strong>Par jour:</strong> Une date spécifique</li>
                    <li><strong>Par employé:</strong> Historique d'un employé</li>
                    <li><strong>Aujourd'hui:</strong> Pointages du jour</li>
                </ul></div>
                <div class="help-section"><h4>Rafraîchissement</h4>
                    <p>Les données se rafraîchissent automatiquement toutes les 2 minutes depuis la base de données.</p>
                    <p>Le bouton "Rafraîchir" déclenche une synchronisation avec la pointeuse puis recharge les données.</p>
                    <p>Si la pointeuse est hors ligne, les dernières données connues sont affichées.</p>
                </div>
                <div class="help-section"><h4>Exportation</h4>
                    <p>Cliquez sur "Exporter CSV" pour télécharger les données filtrées.</p>
                </div>
            </div>`;
        this.helpModal.style.display = 'flex';
    }

    toggleStats() {
        const hidden = this.statsSection.style.display === 'none';
        this.statsSection.style.display = hidden ? 'block' : 'none';
        this.toggleStatsBtn.innerHTML = `<i class="fas fa-chart-bar"></i> ${hidden ? 'Cacher Stats' : 'Stats'}`;
    }

    // ── Pagination ────────────────────────────────────────────
    updatePagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage) || 1;
        this.pageInfo.textContent = `Page ${this.currentPage} sur ${totalPages}`;
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === totalPages;
        this.firstPageBtn.disabled = this.currentPage === 1;
        this.lastPageBtn.disabled = this.currentPage === totalPages;
        this.updatePageNumbers(totalPages);
    }

    updatePageNumbers(totalPages) {
        this.pageNumbers.innerHTML = '';
        const max = 5;
        let start = Math.max(1, this.currentPage - Math.floor(max / 2));
        let end = Math.min(totalPages, start + max - 1);
        if (end - start + 1 < max) start = Math.max(1, end - max + 1);
        for (let i = start; i <= end; i++) {
            const btn = document.createElement('button');
            btn.className = `page-number ${i === this.currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.addEventListener('click', () => this.goToPage(i));
            this.pageNumbers.appendChild(btn);
        }
    }

    goToPage(page) {
        const total = Math.ceil(this.filteredData.length / this.itemsPerPage);
        if (page >= 1 && page <= total) {
            this.currentPage = page;
            this.renderTable();
            this.updatePagination();
        }
    }

    goToLastPage() { this.goToPage(Math.ceil(this.filteredData.length / this.itemsPerPage)); }
    prevPage() { if (this.currentPage > 1) { this.currentPage--; this.renderTable(); this.updatePagination(); } }
    nextPage() { const t = Math.ceil(this.filteredData.length / this.itemsPerPage); if (this.currentPage < t) { this.currentPage++; this.renderTable(); this.updatePagination(); } }

    // ── Status helpers ─────────────────────────────────────────
    getAttendanceStatus(record) {
        if (!record) return 'Inconnu';
        if (record.status && record.status !== 'Absent') return record.status;
        if (!record.arrivalTime && !record.departureTime) return 'Absent';
        if (record.arrivalTime && !record.departureTime) {
            return record.date === new Date().toISOString().split('T')[0] ? 'En cours' : 'Présent (départ manquant)';
        }
        if (!record.arrivalTime && record.departureTime) return 'Arrivée manquante';
        const [h, m] = record.arrivalTime.split(':').map(Number);
        const mins = h * 60 + m;
        if (mins < 8 * 60) return "À l'heure";
        if (mins <= 9 * 60) return 'Présent';
        return 'En retard';
    }

    getStatusClass(status) {
        switch (status) {
            case "À l'heure": case 'Présent': return 'status-present';
            case 'En cours': return 'status-inprogress';
            case 'En retard': return 'status-late';
            case 'Absent': return 'status-absent';
            default: return 'status-warning';
        }
    }

    getHoursColor(hours) {
        const h = parseFloat(hours);
        if (!h) return '#6b7280';
        if (h >= 8) return '#059669';
        if (h >= 6) return '#d97706';
        return '#dc2626';
    }

    // ── Utilities ──────────────────────────────────────────────
    formatDate(dateString) {
        if (!dateString) return '';
        const [y, m, d] = dateString.split('-');
        return `${d}/${m}/${y}`;
    }

    startClock() {
        const update = () => {
            const now = new Date();
            const el = document.getElementById('current-time');
            if (el) el.innerHTML = `
                <div class="current-time">${now.toLocaleTimeString('fr-FR')}</div>
                <div class="current-date">${now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>`;
        };
        update();
        setInterval(update, 1000);
    }

    showLoading(msg = 'Chargement...') {
        if (this.loadingMessage) this.loadingMessage.textContent = msg;
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        this.tableBody.innerHTML = `
            <tr><td colspan="9" style="text-align:center; padding:3rem; color:#dc2626;">
                <div style="font-size:4rem; margin-bottom:1rem;"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>${message}</h3>
                <button onclick="attendanceSystem.loadAllData()" style="margin-top:1rem; padding:.75rem 1.5rem; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                    <i class="fas fa-redo"></i> Réessayer
                </button>
            </td></tr>`;
    }

    showNotification(message, type = 'info') {
        const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const n = document.createElement('div');
        n.className = `notification notification-${type}`;
        n.innerHTML = `
            <div class="notification-icon"><i class="fas fa-${icons[type] || 'info-circle'}"></i></div>
            <div class="notification-content"><div class="notification-message">${message}</div></div>
            <button class="notification-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
        const container = document.getElementById('notification-container');
        if (container) container.appendChild(n);
        setTimeout(() => { if (n.parentElement) n.remove(); }, 5000);
    }
}

// ── Initialize ─────────────────────────────────────────────────
let attendanceSystem;
document.addEventListener('DOMContentLoaded', () => {
    attendanceSystem = new AttendanceSystem();
});

// ── Additional styles ──────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
    .today-badge{background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-size:.75rem;display:inline-block;margin-top:4px}
    .today-indicator{background:#3b82f6;color:white;padding:4px 8px;border-radius:4px;font-size:.85rem;margin-left:8px}
    .time-display{font-weight:600;font-size:1.1rem;padding:4px 8px;border-radius:6px;display:inline-block}
    .arrival-time{color:#059669;background:rgba(16,185,129,.1)}
    .departure-time{color:#dc2626;background:rgba(220,38,38,.1)}
    .empty-time{color:#9ca3af;font-style:italic}
    .pending-time{color:#d97706}
    .hours-display{font-weight:700;font-size:1.1rem;padding:4px 8px;border-radius:6px;display:inline-block}
    .entries-container{display:flex;flex-wrap:wrap;gap:4px;max-width:200px}
    .time-entry{padding:3px 6px;border-radius:4px;font-size:.85rem;font-weight:500}
    .arrival-entry{background:#d1fae5;color:#065f46}
    .departure-entry{background:#fee2e2;color:#991b1b}
    .action-btn{padding:4px 8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer}
    .action-btn:hover{background:#e5e7eb}
    .page-number{min-width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-color,#e5e7eb);border-radius:6px;cursor:pointer;font-size:.875rem;background:white}
    .page-number:hover{background:#f3f4f6}
    .page-number.active{background:#3b82f6;color:white;border-color:#3b82f6;font-weight:600}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-top:1rem}
    .stat-item{background:#f8fafc;padding:1rem;border-radius:8px;text-align:center;border:1px solid #e5e7eb}
    .stat-value{font-size:1.5rem;font-weight:700;color:#1f2937;margin-bottom:.25rem}
    .stat-label{font-size:.875rem;color:#6b7280}
    .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1rem 0}
    .info-item{background:#f8fafc;padding:.75rem;border-radius:6px}
    .info-label{font-size:.75rem;color:#6b7280;margin-bottom:.25rem}
    .info-value{font-size:.875rem;font-weight:600;color:#1f2937}
    .attendance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1.5rem 0}
    .attendance-card{background:white;padding:1rem;border-radius:8px;border:1px solid #e5e7eb;display:flex;align-items:center;gap:1rem}
    .card-icon{width:48px;height:48px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.25rem;color:white}
    .arrival-card .card-icon{background:linear-gradient(135deg,#10b981,#059669)}
    .departure-card .card-icon{background:linear-gradient(135deg,#ef4444,#dc2626)}
    .hours-card .card-icon{background:linear-gradient(135deg,#3b82f6,#1d4ed8)}
    .status-card .card-icon{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}
    .card-label{font-size:.75rem;color:#6b7280;margin-bottom:.25rem}
    .card-value{font-size:1.25rem;font-weight:600;color:#1f2937}
    .entries-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.75rem;margin:1rem 0}
    .entry-card{padding:.75rem;border-radius:6px;text-align:center}
    .entry-arrival{background:#d1fae5;border:1px solid #a7f3d0}
    .entry-departure{background:#fee2e2;border:1px solid #fecaca}
    .entry-time{font-size:1.1rem;font-weight:600;margin-bottom:.25rem}
    .entry-type{font-size:.75rem;color:#6b7280}
    .status-present{background:linear-gradient(135deg,#d1fae5,#a7f3d0);color:#065f46;border:1px solid #10b981}
    .status-late{background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;border:1px solid #f59e0b}
    .status-absent{background:linear-gradient(135deg,#fee2e2,#fecaca);color:#991b1b;border:1px solid #ef4444}
    .status-inprogress{background:linear-gradient(135deg,#dbeafe,#bfdbfe);color:#1e40af;border:1px solid #3b82f6}
    .status-warning{background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;border:1px solid #f59e0b}
    .debug-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1rem 0;padding:1rem;background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb}
    .notification{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-radius:8px;margin-bottom:.5rem;animation:slideInRight .3s ease}
    .notification-success{background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-left:4px solid #10b981}
    .notification-error{background:linear-gradient(135deg,#fee2e2,#fecaca);border-left:4px solid #ef4444}
    .notification-warning{background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #f59e0b}
    .notification-info{background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-left:4px solid #3b82f6}
    .notification-close{background:none;border:none;cursor:pointer;color:#6b7280;margin-left:auto}
    @keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
`;
document.head.appendChild(style);
