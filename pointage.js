const API_BASE_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000/api'
    : 'https://pointeuse-back.azurewebsites.net/api';

const SESSION_KEY = 'pointage_session_token';

// ── DOM handles ──────────────────────────────────────────────────
const els = {
    subtitle: document.getElementById('subtitle'),
    loading: document.getElementById('loadingView'),
    login: document.getElementById('loginView'),
    requestPin: document.getElementById('requestPinView'),
    pointage: document.getElementById('pointageView'),

    loginMatricule: document.getElementById('loginMatricule'),
    loginPin: document.getElementById('loginPin'),
    showRequestPinBtn: document.getElementById('showRequestPinBtn'),

    requestMatricule: document.getElementById('requestMatricule'),
    backToLoginBtn: document.getElementById('backToLoginBtn'),

    logoutBtn: document.getElementById('logoutBtn'),
    arrivalBtn: document.getElementById('arrivalBtn'),
    departureBtn: document.getElementById('departureBtn'),
    employeeName: document.getElementById('employeeName'),
    employeeDate: document.getElementById('employeeDate'),
    arrivalValue: document.getElementById('arrivalValue'),
    departureValue: document.getElementById('departureValue'),
    message: document.getElementById('message'),
};

const VIEWS = ['loading', 'login', 'requestPin', 'pointage'];

function showView(view) {
    VIEWS.forEach(v => els[v].classList.toggle('hidden', v !== view));
}

function showMessage(text, type) {
    els.message.textContent = text;
    els.message.className = `message ${type}`;
}

function clearMessage() {
    els.message.textContent = '';
    els.message.className = 'message';
}

function getSessionToken() {
    return localStorage.getItem(SESSION_KEY);
}

function setSessionToken(token) {
    localStorage.setItem(SESSION_KEY, token);
}

function clearSessionToken() {
    localStorage.removeItem(SESSION_KEY);
}

async function callApi(path, options = {}) {
    const token = getSessionToken();
    const res = await fetch(`${API_BASE_URL}/self-pointage${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
}

// ── Rendering ────────────────────────────────────────────────────

function renderStatus(data) {
    els.employeeName.textContent = data.employee.fullName;
    els.employeeDate.textContent = data.date;
    els.arrivalValue.textContent = data.arrivalTime || '—';
    els.departureValue.textContent = data.departureTime || '—';
    els.arrivalBtn.disabled = !!data.arrivalTime;
    els.departureBtn.disabled = !!data.departureTime;
}

async function loadStatus() {
    showView('loading');
    const { ok, status, body } = await callApi('/me');

    if (!ok) {
        clearSessionToken();
        showView('login');
        if (status !== 401) {
            showMessage(body.error || 'Erreur de chargement du statut.', 'error');
        }
        return;
    }

    clearMessage();
    renderStatus(body);
    showView('pointage');
}

async function punch(type) {
    clearMessage();
    const btn = type === 'arrival' ? els.arrivalBtn : els.departureBtn;
    btn.disabled = true;

    const { ok, status, body } = await callApi('/punch', {
        method: 'POST',
        body: JSON.stringify({ type }),
    });

    if (!ok) {
        if (status === 409) {
            showMessage(`Déjà enregistré à ${body.existingTime}.`, 'error');
        } else {
            showMessage(body.error || 'Erreur lors du pointage.', 'error');
            btn.disabled = false;
        }
        return;
    }

    showMessage(`${type === 'arrival' ? 'Arrivée' : 'Départ'} enregistré(e) à ${body.recordedTime}.`, 'success');
    await loadStatus();
}

function lockMessage(body) {
    if (body.lockedUntil) {
        const until = new Date(body.lockedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `Trop de tentatives. Réessayez après ${until}.`;
    }
    return 'Compte temporairement verrouillé après trop de tentatives incorrectes.';
}

// ── Login ────────────────────────────────────────────────────────

els.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const matricule = els.loginMatricule.value.trim();
    const pin = els.loginPin.value.trim();

    const { ok, status, body } = await callApi('/login', {
        method: 'POST',
        body: JSON.stringify({ matricule, pin }),
    });

    if (!ok) {
        if (status === 423) {
            showMessage(lockMessage(body), 'error');
        } else if (status === 404 && body.error === 'pin_not_set') {
            showMessage("Aucun code défini pour ce matricule. Utilisez « Définir ou réinitialiser mon code ».", 'error');
        } else if (status === 404) {
            showMessage("Matricule inconnu ou compte inactif.", 'error');
        } else if (status === 401) {
            showMessage("Matricule ou code incorrect.", 'error');
        } else {
            showMessage("Erreur de configuration du serveur. Contactez l'administrateur.", 'error');
        }
        return;
    }

    setSessionToken(body.token);
    els.loginPin.value = '';
    await loadStatus();
});

els.showRequestPinBtn.addEventListener('click', () => {
    clearMessage();
    showView('requestPin');
});

els.backToLoginBtn.addEventListener('click', () => {
    clearMessage();
    showView('login');
});

// ── Request a new PIN by email ───────────────────────────────────

els.requestPin.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const matricule = els.requestMatricule.value.trim();
    const { ok, body } = await callApi('/pin/request', {
        method: 'POST',
        body: JSON.stringify({ matricule }),
    });

    if (!ok) {
        showMessage(body.error || 'Erreur lors de la demande.', 'error');
        return;
    }

    showMessage(body.message || 'Si ce matricule existe, un code a été envoyé par email.', 'success');
});

// ── Logout / punch buttons ───────────────────────────────────────

els.logoutBtn.addEventListener('click', () => {
    clearSessionToken();
    clearMessage();
    showView('login');
});

els.arrivalBtn.addEventListener('click', () => punch('arrival'));
els.departureBtn.addEventListener('click', () => punch('departure'));

// ── Init ─────────────────────────────────────────────────────────

(async function init() {
    showView('loading');

    if (getSessionToken()) {
        await loadStatus();
    } else {
        showView('login');
    }
})();
