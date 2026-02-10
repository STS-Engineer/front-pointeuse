class AttendanceSystem {
    constructor() {
        this.baseUrl = 'http://localhost:3000/api';
        this.currentData = [];
        this.filteredData = [];
        this.employees = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.currentView = 'all'; // 'all', 'by-date', 'by-employee', 'today'
        this.currentDate = null;
        this.currentEmployeeId = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadData();
        this.startClock();
        this.startAutoRefresh();
    }

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
        this.toggleViewBtn = document.getElementById('toggle-view');
        
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
        
        const today = new Date().toISOString().split('T')[0];
        this.dateFilter.value = today;
        this.currentDate = today;
    }

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
        
        // Filtres
        this.viewModeSelect.addEventListener('change', (e) => {
            this.currentView = e.target.value;
            this.currentPage = 1;
            
            if (this.currentView === 'today') {
                this.dateFilter.value = new Date().toISOString().split('T')[0];
            }
            
            this.loadDataByView();
        });
        
        this.dateFilter.addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.currentPage = 1;
            if (this.currentView === 'by-date' || this.currentView === 'all') {
                this.loadDataByView();
            } else {
                this.filterAndSortData();
            }
        });
        
        this.employeeFilter.addEventListener('change', (e) => {
            this.currentEmployeeId = e.target.value;
            this.currentPage = 1;
            if (this.currentView === 'by-employee') {
                this.loadDataByView();
            } else {
                this.filterAndSortData();
            }
        });
        
        this.searchFilter.addEventListener('input', (e) => {
            this.currentPage = 1;
            this.filterAndSortData();
        });
        
        this.sortFilter.addEventListener('change', () => {
            this.filterAndSortData();
        });
        
        // Boutons
        this.refreshBtn.addEventListener('click', () => this.refreshData());
        this.exportBtn.addEventListener('click', () => this.exportData());
        this.debugBtn.addEventListener('click', () => this.showDebugInfo());
        this.helpBtn.addEventListener('click', () => this.showHelp());
        this.toggleStatsBtn.addEventListener('click', () => this.toggleStats());
        this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
        
        // Modal
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.closeModalBtn2.addEventListener('click', () => this.closeModal());
        this.exportDetailsBtn.addEventListener('click', () => this.exportDetails());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
            if (e.target === this.debugModal) this.debugModal.style.display = 'none';
            if (e.target === this.helpModal) this.helpModal.style.display = 'none';
        });
        
        // Close modals avec escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                if (this.debugModal) this.debugModal.style.display = 'none';
                if (this.helpModal) this.helpModal.style.display = 'none';
            }
        });
    }

    async loadData() {
        try {
            this.showLoading('Chargement des données...');
            
            // Test connexion backend
            const healthResponse = await fetch(`${this.baseUrl}/health`);
            if (healthResponse.ok) {
                this.backendStatus.textContent = '● En ligne';
                this.backendStatus.className = 'status-indicator online';
            } else {
                this.backendStatus.textContent = '● Hors ligne';
                this.backendStatus.className = 'status-indicator offline';
            }
            
            // Charger le résumé
            const summaryResponse = await fetch(`${this.baseUrl}/summary`);
            const summaryData = await summaryResponse.json();
            
            if (summaryData.success) {
                this.updateSummary(summaryData.summary);
                
                // Mettre à jour le statut de la pointeuse
                if (summaryData.summary.isConnected) {
                    this.deviceStatus.textContent = '● Connectée';
                    this.deviceStatus.className = 'status-indicator online';
                } else {
                    this.deviceStatus.textContent = '● Déconnectée';
                    this.deviceStatus.className = 'status-indicator offline';
                }
            }
            
            // Charger les employés pour le filtre
            const usersResponse = await fetch(`${this.baseUrl}/users`);
            const usersData = await usersResponse.json();
            
            if (usersData.success) {
                this.employees = usersData.users;
                this.populateEmployeeFilter();
            }
            
            // Charger les données selon la vue
            await this.loadDataByView();
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showError('Impossible de charger les données');
            this.connectionStatus.textContent = '● Déconnecté';
            this.connectionStatus.className = 'status-disconnected';
            this.backendStatus.textContent = '● Hors ligne';
            this.backendStatus.className = 'status-indicator offline';
            this.hideLoading();
        }
    }

    async loadDataByView() {
        try {
            this.showLoading('Chargement des données...');
            
            let response;
            let title = '';
            let endpoint = '';
            
            switch (this.currentView) {
                case 'by-date':
                    if (!this.currentDate) {
                        this.currentDate = new Date().toISOString().split('T')[0];
                        this.dateFilter.value = this.currentDate;
                    }
                    endpoint = `/by-date/${this.currentDate}`;
                    title = `Pointages du ${this.formatDate(this.currentDate)}`;
                    break;
                    
                case 'by-employee':
                    if (!this.currentEmployeeId && this.employees.length > 0) {
                        this.currentEmployeeId = this.employees[0].uid;
                        this.employeeFilter.value = this.currentEmployeeId;
                    }
                    if (this.currentEmployeeId) {
                        endpoint = `/by-employee/${this.currentEmployeeId}`;
                        const employee = this.employees.find(e => e.uid.toString() === this.currentEmployeeId.toString());
                        title = `Historique de ${employee ? employee.name : 'l\'employé'}`;
                    }
                    break;
                    
                case 'today':
                    endpoint = '/today';
                    title = 'Pointages du jour';
                    break;
                    
                default:
                    endpoint = '/attendance';
                    title = 'Tous les pointages';
            }
            
            if (!endpoint) {
                this.hideLoading();
                return;
            }
            
            response = await fetch(`${this.baseUrl}${endpoint}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentData = data.data || [];
                
                // Afficher les stats spécifiques
                if (data.stats) {
                    this.showStats(data.stats);
                } else if (this.currentView === 'by-date') {
                    this.showNotification(
                        `Présents: ${data.present || 0}, Retards: ${data.late || 0}, Absents: ${data.absent || 0}`,
                        'info'
                    );
                }
                
                this.filterAndSortData();
                this.updateTableTitle(title);
            } else {
                this.showNotification('Erreur lors du chargement des données', 'error');
            }
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des données');
            this.hideLoading();
        }
    }

    updateTableTitle(title) {
        let titleElement = document.getElementById('table-title');
        if (!titleElement) {
            titleElement = document.createElement('h2');
            titleElement.id = 'table-title';
            document.querySelector('.table-header').prepend(titleElement);
        }
        titleElement.textContent = title;
    }

    showStats(stats) {
        this.statsContent.innerHTML = '';
        
        if (this.currentView === 'by-employee') {
            const statsHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${stats.totalDays}</div>
                        <div class="stat-label">Jours total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.presentDays}</div>
                        <div class="stat-label">Présences</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.lateDays}</div>
                        <div class="stat-label">Retards</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.totalHours}h</div>
                        <div class="stat-label">Heures totales</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.averageHours}h</div>
                        <div class="stat-label">Moyenne/jour</div>
                    </div>
                </div>
            `;
            this.statsContent.innerHTML = statsHTML;
        } else if (this.currentView === 'today' || this.currentView === 'by-date') {
            const statsHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${stats.total || stats.totalEmployees || 0}</div>
                        <div class="stat-label">Employés total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.present || stats.presentToday || 0}</div>
                        <div class="stat-label">Présents</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.late || stats.lateToday || 0}</div>
                        <div class="stat-label">Retards</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.absent || stats.absentToday || 0}</div>
                        <div class="stat-label">Absents</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.inProgress || stats.inProgressToday || 0}</div>
                        <div class="stat-label">En cours</div>
                    </div>
                </div>
            `;
            this.statsContent.innerHTML = statsHTML;
        }
    }

    toggleStats() {
        if (this.statsSection.style.display === 'none') {
            this.statsSection.style.display = 'block';
            this.toggleStatsBtn.innerHTML = '<i class="fas fa-chart-bar"></i> Cacher Stats';
        } else {
            this.statsSection.style.display = 'none';
            this.toggleStatsBtn.innerHTML = '<i class="fas fa-chart-bar"></i> Stats';
        }
    }

    toggleViewMode() {
        const currentView = this.viewModeSelect.value;
        const views = ['all', 'by-date', 'by-employee', 'today'];
        const currentIndex = views.indexOf(currentView);
        const nextIndex = (currentIndex + 1) % views.length;
        
        this.viewModeSelect.value = views[nextIndex];
        this.viewModeSelect.dispatchEvent(new Event('change'));
    }

    populateEmployeeFilter() {
        this.employeeFilter.innerHTML = '<option value="">-- Tous les employés --</option>';
        
        this.employees
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.uid;
                option.textContent = `${emp.name} (${emp.userid || emp.matricule || 'N/A'})`;
                this.employeeFilter.appendChild(option);
            });
    }

    filterAndSortData() {
        this.filteredData = this.currentData.filter(record => {
            let matches = true;
            
            const searchTerm = this.searchFilter.value.toLowerCase();
            if (searchTerm) {
                const searchStr = `${record.name || ''} ${record.cardNo || ''} ${record.userId || ''} ${record.date || ''}`.toLowerCase();
                matches = matches && searchStr.includes(searchTerm);
            }
            
            if (this.currentView === 'all' && this.currentDate && this.dateFilter.value) {
                matches = matches && record.date === this.currentDate;
            }
            
            if (this.currentView === 'all' && this.currentEmployeeId && this.employeeFilter.value) {
                matches = matches && record.uid.toString() === this.currentEmployeeId;
            }
            
            return matches;
        });
        
        const sortValue = this.sortFilter.value;
        this.filteredData.sort((a, b) => {
            switch (sortValue) {
                case 'date-desc': return b.date.localeCompare(a.date);
                case 'date-asc': return a.date.localeCompare(b.date);
                case 'name-asc': return (a.name || '').localeCompare(b.name || '');
                case 'name-desc': return (b.name || '').localeCompare(a.name || '');
                case 'hours-desc': return parseFloat(b.hoursWorked || 0) - parseFloat(a.hoursWorked || 0);
                case 'hours-asc': return parseFloat(a.hoursWorked || 0) - parseFloat(b.hoursWorked || 0);
                case 'status':
                    const statusOrder = { 
                        'À l\'heure': 0, 
                        'Présent': 1, 
                        'En cours': 2, 
                        'Arrivée manquante': 3,
                        'En retard': 4, 
                        'Absent': 5,
                        'Présent (départ manquant)': 6
                    };
                    return (statusOrder[this.getAttendanceStatus(a)] || 7) - (statusOrder[this.getAttendanceStatus(b)] || 7);
                default: return 0;
            }
        });
        
        this.renderTable();
        this.updatePagination();
    }

    renderTable() {
        if (this.filteredData.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="no-data">
                        <div style="text-align: center; padding: 3rem;">
                            <i class="fas fa-inbox" style="font-size: 4rem; color: #9ca3af; margin-bottom: 1rem; opacity: 0.5;"></i>
                            <h3 style="color: #6b7280; margin-bottom: 0.5rem;">Aucune donnée disponible</h3>
                            <p style="color: #9ca3af;">Essayez de changer les filtres ou de rafraîchir les données</p>
                            <button onclick="attendanceSystem.refreshData()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-sync-alt"></i> Rafraîchir
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        let tableHTML = '';
        
        pageData.forEach(record => {
            const status = this.getAttendanceStatus(record);
            const statusClass = this.getStatusClass(status);
            const hoursColor = this.getHoursColor(record.hoursWorked);
            const isToday = this.isToday(record.date);
            
            // Formater les entrées pour l'affichage
            let entriesDisplay = '';
            if (record.entries && record.entries.length > 0) {
                entriesDisplay = record.entries.map(entry => {
                    const typeIcon = entry.type === 0 ? '⬇️' : '⬆️'; // 0=arrivée, 1=départ
                    const typeClass = entry.type === 0 ? 'arrival-entry' : 'departure-entry';
                    return `<span class="time-entry ${typeClass}">${typeIcon} ${entry.time}</span>`;
                }).join(' ');
            } else {
                entriesDisplay = '<span style="color: #9ca3af; font-style: italic;">Aucun pointage</span>';
            }
            
            tableHTML += `
                <tr onclick="attendanceSystem.showDetails('${record.uid}', '${record.date}')" style="cursor: pointer; transition: background-color 0.2s;">
                    <td style="border-left: 4px solid ${isToday ? '#3b82f6' : 'transparent'};">
                        <strong style="color: #1f2937;">${record.cardNo || 'N/A'}</strong>
                        <br>
                        <small style="color: #6b7280; font-size: 0.85rem;">Mat: ${record.userId || 'N/A'}</small>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #111827;">${record.name || 'Non renseigné'}</div>
                    </td>
                    <td>
                        <div style="font-weight: 500; color: #1f2937;">${this.formatDate(record.date)}</div>
                        <div style="color: #6b7280; font-size: 0.85rem;">${record.dayName || this.getDayName(record.date)}</div>
                        ${isToday ? '<span class="today-badge">Aujourd\'hui</span>' : ''}
                    </td>
                    <td>
                        ${record.arrivalTime ? 
                            `<div class="time-display arrival-time">${record.arrivalTime}</div>` : 
                            '<div class="time-displace empty-time">-</div>'
                        }
                    </td>
                    <td>
                        ${record.departureTime ? 
                            `<div class="time-display departure-time">${record.departureTime}</div>` : 
                            `<div class="time-display empty-time ${isToday ? 'pending-time' : ''}">${isToday ? 'En attente' : '-'}</div>`
                        }
                    </td>
                    <td>
                        <div class="hours-display" style="color: ${hoursColor}">
                            ${record.hoursWorked > 0 ? `${record.hoursWorked}h` : (isToday && record.arrivalTime ? 'En cours...' : '-')}
                        </div>
                    </td>
                    <td>
                        <div class="entries-container">
                            ${entriesDisplay}
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${status}</span>
                    </td>
                    <td>
                        <button onclick="event.stopPropagation(); attendanceSystem.showDetails('${record.uid}', '${record.date}')" class="btn-small action-btn">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        this.tableBody.innerHTML = tableHTML;
    }

    async showDetails(uid, date) {
        try {
            const response = await fetch(`${this.baseUrl}/by-employee/${uid}/date/${date}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error('Impossible de charger les détails');
            }
            
            const record = data.data || {};
            const employee = data.employee || {};
            const isToday = record.date === new Date().toISOString().split('T')[0];
            const status = this.getAttendanceStatus(record);
            const statusClass = this.getStatusClass(status);
            
            this.modalTitle.textContent = `Détails - ${employee.name || 'Employé'} - ${this.formatDate(date)}`;
            
            let modalHTML = `
                <div class="employee-info-section">
                    <h3><i class="fas fa-user"></i> Informations employé</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">Matricule</div>
                            <div class="info-value">${employee.cardNo || 'N/A'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">ID Employé</div>
                            <div class="info-value">${employee.userId || 'N/A'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Nom complet</div>
                            <div class="info-value">${employee.name || 'Non renseigné'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Jour</div>
                            <div class="info-value">${record.dayName || this.getDayName(date)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="attendance-section">
                    <h3><i class="fas fa-clock"></i> Présence ${isToday ? '<span class="today-indicator">Aujourd\'hui</span>' : ''}</h3>
                    <div class="attendance-grid">
                        <div class="attendance-card arrival-card">
                            <div class="card-icon">
                                <i class="fas fa-sign-in-alt"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-label">Arrivée</div>
                                <div class="card-value">${record.arrivalTime || '-'}</div>
                            </div>
                        </div>
                        <div class="attendance-card departure-card">
                            <div class="card-icon">
                                <i class="fas fa-sign-out-alt"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-label">Départ</div>
                                <div class="card-value">${record.departureTime || (isToday ? 'En attente' : '-')}</div>
                            </div>
                        </div>
                        <div class="attendance-card hours-card">
                            <div class="card-icon">
                                <i class="fas fa-business-time"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-label">Heures travaillées</div>
                                <div class="card-value">${record.hoursWorked > 0 ? `${record.hoursWorked}h` : (isToday && record.arrivalTime ? 'En cours...' : '-')}</div>
                            </div>
                        </div>
                        <div class="attendance-card status-card">
                            <div class="card-icon">
                                <i class="fas fa-info-circle"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-label">Statut</div>
                                <div class="card-value">
                                    <span class="status-badge ${statusClass}">${status}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            if (record.entries && record.entries.length > 0) {
                modalHTML += `
                    <div class="entries-section">
                        <h3><i class="fas fa-list"></i> Points enregistrés (${record.entries.length})</h3>
                        <div class="entries-grid">
                            ${record.entries.map(entry => `
                                <div class="entry-card ${entry.type === 0 ? 'entry-arrival' : 'entry-departure'}">
                                    <div class="entry-time">${entry.time}</div>
                                    <div class="entry-type">${entry.type === 0 ? 'Arrivée' : 'Départ'}</div>
                                    <div class="entry-timestamp">${new Date(entry.timestamp).toLocaleTimeString('fr-FR')}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                modalHTML += `
                    <div class="entries-section">
                        <h3><i class="fas fa-list"></i> Points enregistrés</h3>
                        <div class="no-entries">
                            <i class="fas fa-times-circle"></i>
                            <p>Aucun pointage enregistré pour ce jour</p>
                        </div>
                    </div>
                `;
            }
            
            // Ajouter des informations de débogage si nécessaire
            if (record.pointeuseUserId) {
                modalHTML += `
                    <div class="debug-section">
                        <h3><i class="fas fa-bug"></i> Informations techniques</h3>
                        <div class="debug-grid">
                            <div class="debug-item">
                                <span class="debug-label">UID:</span>
                                <span class="debug-value">${record.uid}</span>
                            </div>
                            <div class="debug-item">
                                <span class="debug-label">Pointeuse User ID:</span>
                                <span class="debug-value">${record.pointeuseUserId}</span>
                            </div>
                            <div class="debug-item">
                                <span class="debug-label">Date traitement:</span>
                                <span class="debug-value">${new Date().toLocaleString('fr-FR')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            this.modalBody.innerHTML = modalHTML;
            this.modal.style.display = 'flex';
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Impossible de charger les détails', 'error');
        }
    }

    exportDetails() {
        const modalContent = this.modalBody.innerHTML;
        const blob = new Blob([modalContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `details_${this.modalTitle.textContent.replace(/[^a-z0-9]/gi, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Détails exportés avec succès', 'success');
    }

    closeModal() {
        this.modal.style.display = 'none';
    }

    async refreshData() {
        try {
            this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rafraîchissement...';
            this.refreshBtn.disabled = true;
            
            const response = await fetch(`${this.baseUrl}/refresh`, { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                this.updateSummary(data.summary);
                await this.loadDataByView();
                this.showNotification('Données rafraîchies avec succès', 'success');
            } else {
                this.showNotification('Erreur lors du rafraîchissement', 'error');
            }
        } catch (error) {
            this.showNotification('Erreur lors du rafraîchissement', 'error');
        } finally {
            this.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Rafraîchir';
            this.refreshBtn.disabled = false;
        }
    }

    exportData() {
        if (this.filteredData.length === 0) {
            this.showNotification('Aucune donnée à exporter', 'warning');
            return;
        }
        
        const dataToExport = this.filteredData.map(record => ({
            Matricule: record.cardNo || '',
            Nom: record.name || '',
            'ID Employé': record.userId || '',
            Date: record.date || '',
            Jour: record.dayName || this.getDayName(record.date),
            'Heure arrivée': record.arrivalTime || '',
            'Heure départ': record.departureTime || '',
            'Heures travaillées': record.hoursWorked || '0.00',
            Statut: this.getAttendanceStatus(record),
            'Nombre de points': record.entries ? record.entries.length : 0
        }));
        
        const csv = this.convertToCSV(dataToExport);
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `presences_${new Date().toISOString().split('T')[0]}_${this.filteredData.length}_lignes.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification(`Données exportées (${this.filteredData.length} lignes)`, 'success');
    }

    convertToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const rows = data.map(row => 
            headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                // Échapper les guillemets et les virgules
                const stringValue = value.toString();
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',')
        );
        return [headers.join(','), ...rows].join('\n');
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        this.pageInfo.textContent = `Page ${this.currentPage} sur ${totalPages || 1}`;
        
        // Mettre à jour les boutons
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === totalPages || totalPages === 0;
        this.firstPageBtn.disabled = this.currentPage === 1;
        this.lastPageBtn.disabled = this.currentPage === totalPages || totalPages === 0;
        
        // Mettre à jour les numéros de page
        this.updatePageNumbers(totalPages);
    }

    updatePageNumbers(totalPages) {
        this.pageNumbers.innerHTML = '';
        
        if (totalPages <= 1) return;
        
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // Bouton précédent
        if (startPage > 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            this.pageNumbers.appendChild(ellipsis);
        }
        
        // Numéros de page
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-number ${i === this.currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => this.goToPage(i));
            this.pageNumbers.appendChild(pageBtn);
        }
        
        // Bouton suivant
        if (endPage < totalPages) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'page-ellipsis';
            ellipsis.textContent = '...';
            this.pageNumbers.appendChild(ellipsis);
        }
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderTable();
            this.updatePagination();
        }
    }

    goToLastPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        this.goToPage(totalPages);
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderTable();
            this.updatePagination();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderTable();
            this.updatePagination();
        }
    }

    updateSummary(summary) {
        this.totalUsers.textContent = summary.totalUsers || 0;
        this.totalDays.textContent = summary.totalDays || 0;
        this.totalLogs.textContent = summary.totalLogs || 0;
        this.totalRecords.textContent = summary.totalRecords || 0;
        this.lastUpdate.textContent = new Date(summary.lastUpdate).toLocaleString('fr-FR');
        
        if (summary.isRealData === false) {
            this.connectionStatus.textContent = '● Données fictives';
            this.connectionStatus.className = 'status-disconnected';
        } else {
            this.connectionStatus.textContent = '● Connecté';
            this.connectionStatus.className = 'status-connected';
        }
    }

    startClock() {
        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const dateString = now.toLocaleDateString('fr-FR', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            document.getElementById('current-time').innerHTML = `
                <div class="current-time">${timeString}</div>
                <div class="current-date">${dateString}</div>
            `;
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    startAutoRefresh() {
        // Rafraîchir toutes les 2 minutes
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.refreshData();
            }
        }, 2 * 60 * 1000);
    }

    showLoading(message = 'Chargement...') {
        this.loadingMessage.textContent = message;
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        this.tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem; color: #dc2626;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 style="margin-bottom: 1rem;">${message}</h3>
                    <p style="color: #6b7280; margin-bottom: 1.5rem;">Vérifiez la connexion au serveur backend</p>
                    <button onclick="attendanceSystem.loadData()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-redo"></i> Réessayer
                    </button>
                </td>
            </tr>
        `;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.getElementById('notification-container').appendChild(notification);
        
        // Supprimer automatiquement après 5 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    async showDebugInfo() {
        try {
            this.showLoading('Chargement des informations de débogage...');
            
            const response = await fetch(`${this.baseUrl}/debug/mapping`);
            const data = await response.json();
            
            if (data.success) {
                let debugHTML = `
                    <div class="debug-header">
                        <h3><i class="fas fa-cogs"></i> Informations système</h3>
                    </div>
                    
                    <div class="debug-stats">
                        <div class="debug-stat">
                            <span class="stat-label">Utilisateurs:</span>
                            <span class="stat-value">${data.stats.users || 0}</span>
                        </div>
                        <div class="debug-stat">
                            <span class="stat-label">Logs:</span>
                            <span class="stat-value">${data.stats.logs || 0}</span>
                        </div>
                        <div class="debug-stat">
                            <span class="stat-label">Enregistrements traités:</span>
                            <span class="stat-value">${data.stats.processed || 0}</span>
                        </div>
                        <div class="debug-stat">
                            <span class="stat-label">Taux de correspondance:</span>
                            <span class="stat-value">${data.stats.matchRate || '0%'}</span>
                        </div>
                    </div>
                    
                    <div class="debug-section">
                        <h4><i class="fas fa-users"></i> Correspondances employés</h4>
                        <div class="matches-list">
                `;
                
                data.sampleLogs?.forEach((item, index) => {
                    debugHTML += `
                        <div class="match-item ${item.matchedUser ? 'matched' : 'not-matched'}">
                            <div class="match-info">
                                <strong>Log ${index + 1}:</strong> UID=${item.log.uid}, Type=${item.log.type}
                            </div>
                            <div class="match-result">
                                ${item.matchedUser ? 
                                    `<span class="success"><i class="fas fa-check"></i> ${item.matchedUser.name}</span>` :
                                    `<span class="error"><i class="fas fa-times"></i> Aucune correspondance</span>`
                                }
                            </div>
                        </div>
                    `;
                });
                
                debugHTML += `
                        </div>
                    </div>
                    
                    <div class="debug-actions">
                        <button onclick="attendanceSystem.runDebugTests()" class="btn-secondary">
                            <i class="fas fa-vial"></i> Lancer les tests
                        </button>
                        <button onclick="attendanceSystem.forceRefresh()" class="btn-warning">
                            <i class="fas fa-redo"></i> Forcer rafraîchissement
                        </button>
                    </div>
                `;
                
                this.debugModal.querySelector('#debug-body').innerHTML = debugHTML;
                this.debugModal.style.display = 'flex';
            }
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Erreur debug:', error);
            this.showNotification('Erreur lors du débogage', 'error');
            this.hideLoading();
        }
    }

    async runDebugTests() {
        try {
            this.showLoading('Exécution des tests...');
            
            // Test de connexion
            const connectionTest = await fetch(`${this.baseUrl}/test-connection`);
            const connectionResult = await connectionTest.json();
            
            // Test des données brutes
            const rawTest = await fetch(`${this.baseUrl}/debug/raw-attendances`);
            const rawResult = await rawTest.json();
            
            let testHTML = `
                <div class="test-results">
                    <h4><i class="fas fa-vial"></i> Résultats des tests</h4>
                    
                    <div class="test-result ${connectionResult.success ? 'success' : 'error'}">
                        <div class="test-title">Test de connexion</div>
                        <div class="test-status">${connectionResult.success ? '✓ Réussi' : '✗ Échec'}</div>
                        <div class="test-message">${connectionResult.message || ''}</div>
                    </div>
                    
                    <div class="test-result ${rawResult.success ? 'success' : 'error'}">
                        <div class="test-title">Données brutes</div>
                        <div class="test-status">${rawResult.success ? '✓ Réussi' : '✗ Échec'}</div>
                        <div class="test-message">${rawResult.totalLogs || 0} logs trouvés</div>
                    </div>
                    
                    <div class="test-advice">
                        <h5><i class="fas fa-lightbulb"></i> Conseils</h5>
                        <ul>
                            <li>Vérifiez que la pointeuse est allumée et connectée au réseau</li>
                            <li>Vérifiez l'adresse IP de la pointeuse (10.10.205.10)</li>
                            <li>Redémarrez le service backend si nécessaire</li>
                            <li>Consultez les logs du serveur pour plus d'informations</li>
                        </ul>
                    </div>
                </div>
            `;
            
            this.debugModal.querySelector('#debug-body').innerHTML += testHTML;
            
        } catch (error) {
            console.error('Erreur tests:', error);
            this.showNotification('Erreur lors des tests', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async forceRefresh() {
        try {
            this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Forcer rafraîchissement...';
            this.refreshBtn.disabled = true;
            
            // Appeler plusieurs fois pour s'assurer de la récupération
            for (let i = 0; i < 2; i++) {
                const response = await fetch(`${this.baseUrl}/refresh`, { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    this.updateSummary(data.summary);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            await this.loadDataByView();
            this.showNotification('Rafraîchissement forcé terminé', 'success');
            
            // Fermer le modal de débogage
            if (this.debugModal) this.debugModal.style.display = 'none';
            
        } catch (error) {
            this.showNotification('Erreur lors du rafraîchissement forcé', 'error');
        } finally {
            this.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Rafraîchir';
            this.refreshBtn.disabled = false;
        }
    }

    showHelp() {
        const helpHTML = `
            <div class="help-content">
                <h3><i class="fas fa-question-circle"></i> Guide d'utilisation</h3>
                
                <div class="help-section">
                    <h4><i class="fas fa-eye"></i> Modes d'affichage</h4>
                    <ul>
                        <li><strong>Tous les pointages:</strong> Affiche tous les enregistrements</li>
                        <li><strong>Par jour:</strong> Filtre les pointages pour une date spécifique</li>
                        <li><strong>Par employé:</strong> Affiche l'historique d'un employé</li>
                        <li><strong>Aujourd'hui:</strong> Affiche les pointages du jour en cours</li>
                    </ul>
                </div>
                
                <div class="help-section">
                    <h4><i class="fas fa-filter"></i> Filtres disponibles</h4>
                    <ul>
                        <li><strong>Date:</strong> Filtre par date spécifique</li>
                        <li><strong>Employé:</strong> Filtre par employé spécifique</li>
                        <li><strong>Recherche:</strong> Recherche dans les noms et matricules</li>
                        <li><strong>Trier par:</strong> Trie les résultats selon différents critères</li>
                    </ul>
                </div>
                
                <div class="help-section">
                    <h4><i class="fas fa-chart-bar"></i> Statistiques</h4>
                    <p>Cliquez sur le bouton "Stats" pour afficher/masquer les statistiques.</p>
                </div>
                
                <div class="help-section">
                    <h4><i class="fas fa-download"></i> Exportation</h4>
                    <p>Utilisez le bouton "Exporter CSV" pour télécharger les données au format Excel.</p>
                </div>
                
                <div class="help-section">
                    <h4><i class="fas fa-bug"></i> Débogage</h4>
                    <p>Utilisez le bouton "Débogage" pour diagnostiquer les problèmes de connexion.</p>
                </div>
                
                <div class="help-tips">
                    <h4><i class="fas fa-lightbulb"></i> Conseils</h4>
                    <ul>
                        <li>Les données se rafraîchissent automatiquement toutes les 2 minutes</li>
                        <li>Cliquez sur une ligne pour voir les détails complets</li>
                        <li>Utilisez le rafraîchissement manuel si les données semblent obsolètes</li>
                        <li>Consultez les logs du serveur en cas de problème persistant</li>
                    </ul>
                </div>
            </div>
        `;
        
        this.helpModal.querySelector('#help-body').innerHTML = helpHTML;
        this.helpModal.style.display = 'flex';
    }

    getAttendanceStatus(record) {
        if (!record) return 'Inconnu';
        
        // Utiliser le statut déjà calculé si disponible
        if (record.status && record.status !== 'Absent') {
            return record.status;
        }
        
        // Déterminer le statut basé sur les heures
        if (!record.arrivalTime && !record.departureTime) {
            return 'Absent';
        }
        
        if (record.arrivalTime && !record.departureTime) {
            const today = new Date().toISOString().split('T')[0];
            return record.date === today ? 'En cours' : 'Présent (départ manquant)';
        }
        
        if (!record.arrivalTime && record.departureTime) {
            return 'Arrivée manquante';
        }
        
        // Calculer si en retard
        const arrivalParts = record.arrivalTime.split(':');
        const arrivalHour = parseInt(arrivalParts[0]);
        const arrivalMinute = parseInt(arrivalParts[1]);
        const arrivalTotalMinutes = arrivalHour * 60 + arrivalMinute;
        
        if (arrivalTotalMinutes < 8 * 60) { // Avant 8h
            return 'À l\'heure';
        } else if (arrivalTotalMinutes <= 9 * 60) { // Avant 9h
            return 'Présent';
        } else {
            return 'En retard';
        }
    }

    getStatusClass(status) {
        switch (status) {
            case 'À l\'heure': 
            case 'Présent': 
                return 'status-present';
            case 'En cours':
                return 'status-inprogress';
            case 'En retard': 
                return 'status-late';
            case 'Absent': 
                return 'status-absent';
            case 'Arrivée manquante':
            case 'Présent (départ manquant)':
                return 'status-warning';
            default: 
                return 'status-absent';
        }
    }

    getHoursColor(hours) {
        if (!hours || hours === '-' || hours === 'En cours...') return '#6b7280';
        const h = parseFloat(hours);
        if (h >= 8) return '#059669';
        if (h >= 6) return '#d97706';
        if (h > 0) return '#dc2626';
        return '#6b7280';
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    getDayName(dateString) {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const date = new Date(dateString);
        return days[date.getDay()];
    }

    isToday(dateString) {
        return dateString === new Date().toISOString().split('T')[0];
    }
}

// Initialiser l'application
let attendanceSystem;
document.addEventListener('DOMContentLoaded', () => {
    attendanceSystem = new AttendanceSystem();
});

// Styles CSS supplémentaires
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    /* Styles pour les badges */
    .today-badge {
        background: #dbeafe;
        color: #1e40af;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
        display: inline-block;
        margin-top: 4px;
    }
    
    .today-indicator {
        background: #3b82f6;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.85rem;
        margin-left: 8px;
    }
    
    /* Styles pour les heures */
    .time-display {
        font-weight: 600;
        font-size: 1.1rem;
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
    }
    
    .arrival-time {
        color: #059669;
        background: rgba(16, 185, 129, 0.1);
    }
    
    .departure-time {
        color: #dc2626;
        background: rgba(220, 38, 38, 0.1);
    }
    
    .empty-time {
        color: #9ca3af;
        font-style: italic;
    }
    
    .pending-time {
        color: #d97706;
    }
    
    .hours-display {
        font-weight: 700;
        font-size: 1.1rem;
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
    }
    
    /* Styles pour les entrées de temps */
    .entries-container {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-width: 200px;
    }
    
    .time-entry {
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 500;
        display: inline-block;
    }
    
    .arrival-entry {
        background: #d1fae5;
        color: #065f46;
    }
    
    .departure-entry {
        background: #fee2e2;
        color: #991b1b;
    }
    
    /* Bouton action */
    .action-btn {
        padding: 4px 8px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .action-btn:hover {
        background: #e5e7eb;
        border-color: #9ca3af;
    }
    
    /* Pagination améliorée */
    .page-number {
        min-width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 0.875rem;
        background: white;
    }
    
    .page-number:hover {
        background-color: #f3f4f6;
        border-color: #9ca3af;
    }
    
    .page-number.active {
        background-color: #3b82f6;
        color: white;
        border-color: #3b82f6;
        font-weight: 600;
    }
    
    .page-ellipsis {
        padding: 0 8px;
        color: #6b7280;
    }
    
    /* Section statistiques */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
    }
    
    .stat-item {
        background: #f8fafc;
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        border: 1px solid #e5e7eb;
    }
    
    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 0.25rem;
    }
    
    .stat-label {
        font-size: 0.875rem;
        color: #6b7280;
    }
    
    /* Modal amélioré */
    .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
    }
    
    .info-item {
        background: #f8fafc;
        padding: 0.75rem;
        border-radius: 6px;
    }
    
    .info-label {
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    .info-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: #1f2937;
    }
    
    .attendance-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1.5rem 0;
    }
    
    .attendance-card {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .card-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        color: white;
    }
    
    .arrival-card .card-icon {
        background: linear-gradient(135deg, #10b981, #059669);
    }
    
    .departure-card .card-icon {
        background: linear-gradient(135deg, #ef4444, #dc2626);
    }
    
    .hours-card .card-icon {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    }
    
    .status-card .card-icon {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    }
    
    .card-content {
        flex: 1;
    }
    
    .card-label {
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    .card-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    }
    
    .entries-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.75rem;
        margin: 1rem 0;
    }
    
    .entry-card {
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
    }
    
    .entry-arrival {
        background: #d1fae5;
        border: 1px solid #a7f3d0;
    }
    
    .entry-departure {
        background: #fee2e2;
        border: 1px solid #fecaca;
    }
    
    .entry-time {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }
    
    .entry-type {
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    .entry-timestamp {
        font-size: 0.7rem;
        color: #9ca3af;
    }
    
    .no-entries {
        text-align: center;
        padding: 2rem;
        color: #9ca3af;
    }
    
    .no-entries i {
        font-size: 3rem;
        margin-bottom: 1rem;
        opacity: 0.5;
    }
    
    /* Débogage */
    .debug-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
        padding: 1rem;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
    }
    
    .debug-stat {
        text-align: center;
    }
    
    .stat-label {
        display: block;
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.25rem;
    }
    
    .stat-value {
        display: block;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    }
    
    .matches-list {
        max-height: 300px;
        overflow-y: auto;
        margin: 1rem 0;
    }
    
    .match-item {
        padding: 0.75rem;
        margin-bottom: 0.5rem;
        border-radius: 6px;
        border-left: 4px solid;
    }
    
    .match-item.matched {
        background: #d1fae5;
        border-left-color: #10b981;
    }
    
    .match-item.not-matched {
        background: #fee2e2;
        border-left-color: #ef4444;
    }
    
    .match-info {
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
    }
    
    .match-result {
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .match-result .success {
        color: #059669;
    }
    
    .match-result .error {
        color: #dc2626;
    }
    
    .debug-actions {
        display: flex;
        gap: 1rem;
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }
    
    .test-results {
        margin: 1.5rem 0;
    }
    
    .test-result {
        padding: 1rem;
        margin-bottom: 0.75rem;
        border-radius: 6px;
        border: 1px solid;
    }
    
    .test-result.success {
        background: #d1fae5;
        border-color: #10b981;
    }
    
    .test-result.error {
        background: #fee2e2;
        border-color: #ef4444;
    }
    
    .test-title {
        font-weight: 600;
        margin-bottom: 0.25rem;
    }
    
    .test-status {
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
    }
    
    .test-message {
        font-size: 0.75rem;
        color: #6b7280;
    }
    
    .test-advice {
        padding: 1rem;
        background: #fef3c7;
        border-radius: 6px;
        border: 1px solid #f59e0b;
        margin-top: 1rem;
    }
    
    .test-advice h5 {
        margin-bottom: 0.5rem;
        color: #92400e;
    }
    
    .test-advice ul {
        padding-left: 1.5rem;
        font-size: 0.875rem;
        color: #92400e;
    }
    
    .test-advice li {
        margin-bottom: 0.25rem;
    }
    
    /* Status badges améliorés */
    .status-present {
        background: linear-gradient(135deg, #d1fae5, #a7f3d0);
        color: #065f46;
        border: 1px solid #10b981;
    }
    
    .status-late {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        color: #92400e;
        border: 1px solid #f59e0b;
    }
    
    .status-absent {
        background: linear-gradient(135deg, #fee2e2, #fecaca);
        color: #991b1b;
        border: 1px solid #ef4444;
    }
    
    .status-inprogress {
        background: linear-gradient(135deg, #dbeafe, #bfdbfe);
        color: #1e40af;
        border: 1px solid #3b82f6;
    }
    
    .status-warning {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        color: #92400e;
        border: 1px solid #f59e0b;
    }
    
    /* Notifications améliorées */
    .notification {
        animation: slideInRight 0.3s ease;
        margin-bottom: 0.5rem;
    }
    
    .notification-success {
        border-left-color: #10b981;
        background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    }
    
    .notification-error {
        border-left-color: #ef4444;
        background: linear-gradient(135deg, #fee2e2, #fecaca);
    }
    
    .notification-warning {
        border-left-color: #f59e0b;
        background: linear-gradient(135deg, #fef3c7, #fde68a);
    }
    
    .notification-info {
        border-left-color: #3b82f6;
        background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(additionalStyles);