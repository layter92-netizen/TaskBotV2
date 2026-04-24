const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const htmlEl = document.documentElement;
if (tg.colorScheme === 'dark') htmlEl.setAttribute('data-theme', 'dark');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyIFjqRtTZCcuCQQGcm_-McfK30wq2k6Z3UrPSGIU6AysmN-vbb_fGTkvxTBj-BW-HHzQ/exec';

let inventoryData = [];
let refData = { personnel: [], machinery: [], implements: [], gardens: [], workTypes: [], pesticides: [] };
let userAccess = null;
let currentTaskType = null;
let currentWizStep = 1;
let selectedWorkers = [];
let taskPesticides = [];
let taskOperators = []; // Список доданих операторів
let enteredPin = '';
let isPinVerified = false;

// ── TELEGRAM ID ──
let currentUserTgId = '123456';
try {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        currentUserTgId = String(tg.initDataUnsafe.user.id);
    }
} catch(e) {}

function updateIdOnScreen() {
    const el = document.getElementById('my-tg-id');
    if (el) el.textContent = currentUserTgId;
}

function copyMyId() {
    navigator.clipboard.writeText(currentUserTgId)
        .then(() => tg.showAlert('ID скопійовано: ' + currentUserTgId))
        .catch(() => tg.showAlert('Ваш ID: ' + currentUserTgId));
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    // Ховаємо екран блокування одразу
    const deniedEl = document.getElementById('access-denied');
    if (deniedEl) deniedEl.style.display = 'none';

    updateIdOnScreen();

    // Встановлюємо сьогоднішню дату у всі поля
    const today = new Date().toISOString().split('T')[0];
    ['arr-date', 'iss-date', 'rep-end-date', 'wiz-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });
    const now = new Date();
    const firstDay = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
    const repStart = document.getElementById('rep-start-date');
    if (repStart) repStart.value = firstDay;

    // Вкладки складу
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (!target) return;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.add('active');
            btn.classList.add('active');
        });
    });

    // Фільтри категорій складу
    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderInventory(chip.getAttribute('data-cat'));
        });
    });

    // Форма приходу
    const formArrival = document.getElementById('form-arrival');
    if (formArrival) {
        formArrival.addEventListener('submit', e => {
            e.preventDefault();
            submitInvTransaction('arrival');
        });
    }

    // Форма видачі
    const formIssuance = document.getElementById('form-issuance');
    if (formIssuance) {
        formIssuance.addEventListener('submit', e => {
            e.preventDefault();
            submitInvTransaction('issuance');
        });
    }

    // Форма нового матеріалу
    const formAdd = document.getElementById('form-add-material');
    if (formAdd) {
        formAdd.addEventListener('submit', e => {
            e.preventDefault();
            submitNewMaterial();
        });
    }

    // Кнопка відкриття модалки
    const btnAddMat = document.getElementById('btn-add-material');
    if (btnAddMat) btnAddMat.addEventListener('click', () => openAddMaterialModal());

    // Закриття модалки
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });

    // Тема
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = htmlEl.getAttribute('data-theme') === 'dark';
            htmlEl.setAttribute('data-theme', isDark ? 'light' : 'dark');
            themeBtn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
        });
    }

    // Ініціалізація категорій звітів
    updateReportCategories();

    loadAllData();
});

// ── PIN ──
function addPinDigit(digit) {
    if (enteredPin.length < 4) {
        enteredPin += digit;
        const disp = document.getElementById('pin-display');
        if (disp) disp.textContent = '*'.repeat(enteredPin.length) + '_'.repeat(4 - enteredPin.length);
        if (enteredPin.length === 4) setTimeout(verifyPin, 300);
    }
}
function clearPin() {
    enteredPin = '';
    const disp = document.getElementById('pin-display');
    if (disp) disp.textContent = '____';
}
function verifyPin() {
    if (!userAccess || !userAccess.pin) return;
    if (enteredPin === userAccess.pin) {
        isPinVerified = true;
        const modal = document.getElementById('pin-modal');
        if (modal) modal.style.display = 'none';
        tg.showAlert('Ласкаво просимо, ' + (userAccess.name || 'Користувач'));
    } else {
        tg.showAlert('Неправильний PIN-код!');
        clearPin();
    }
}

// ── LOADING ──
async function loadAllData() {
    updateIdOnScreen();
    tg.MainButton.showProgress();
    try {
        const response = await fetch(GAS_URL + '?action=getAllData&telegramId=' + currentUserTgId);
        const res = await response.json();

        if (res.status === 'success') {
            inventoryData = res.data.inventory || [];
            refData = res.data.references || refData;
            userAccess = res.data.access;

            // PIN перевірка
            const pinModal = document.getElementById('pin-modal');
            if (pinModal) {
                pinModal.style.display = (userAccess && userAccess.pin && !isPinVerified) ? 'flex' : 'none';
            }

            applyPermissions();
            renderInventory();
            populateSelects();
        } else {
            showAccessDenied();
        }
    } catch (err) {
        showAccessDenied();
    } finally {
        tg.MainButton.hideProgress();
    }
}

function showAccessDenied() {
    updateIdOnScreen();
    const el = document.getElementById('access-denied');
    if (el) el.style.display = 'flex';
}

function applyPermissions() {
    const denied = document.getElementById('access-denied');
    if (!userAccess) { showAccessDenied(); return; }
    if (denied) denied.style.display = 'none';

    const role = userAccess.role;
    const navInv    = document.getElementById('nav-inventory');
    const navTasks  = document.getElementById('nav-tasks');
    const navReports = document.getElementById('nav-reports');

    [navInv, navTasks, navReports].forEach(n => { if (n) n.style.display = 'flex'; });

    if (role === 'worker') {
        if (navInv) navInv.style.display = 'none';
        switchGlobalTab('tab-tasks', navTasks);
    } else if (role === 'brigadier') {
        if (navInv) navInv.style.display = 'none';
    }
}

// ── NAVIGATION ──
function switchGlobalTab(tabId, btnEl) {
    document.querySelectorAll('.global-tab').forEach(t => t.style.display = 'none');
    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';
    document.querySelectorAll('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    const titles = { 'tab-inventory': 'Склад', 'tab-tasks': 'Роботи', 'tab-reports': 'Звіти' };
    const titleEl = document.getElementById('app-title');
    if (titleEl) titleEl.textContent = titles[tabId] || 'TaskBot';
}

// ── INVENTORY ──
function renderInventory(catFilter) {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';
    const map = { 'fuel': 'ПММ', 'pesticides': 'Пестициди', 'fertilizers': 'Добрива', 'parts': 'Запчастини', 'irrigation_mat': 'Зрошення мат.', 'other_mat': 'Інші мат.' };
    let data = inventoryData;
    if (catFilter && catFilter !== 'all') {
        const mapped = map[catFilter] || catFilter;
        data = inventoryData.filter(i => i.category === mapped);
    }
    if (data.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Немає записів</p></div>';
        return;
    }
    data.forEach(item => {
        const el = document.createElement('div');
        el.className = 'inventory-item';
        el.innerHTML = '<div class="item-info"><h4>' + item.name + '</h4><span class="item-cat">' + item.category + '</span></div><div class="item-qty">' + item.quantity + ' ' + item.unit + '</div>';
        list.appendChild(el);
    });
}

function renderItemSelect(prefix) {
    const catEl = document.getElementById(prefix + '-category');
    const itemGroup = document.getElementById(prefix + '-item-group');
    const itemSel = document.getElementById(prefix + '-item');
    if (!catEl || !itemSel) return;

    const selectedCat = catEl.value;
    if (!selectedCat) { if (itemGroup) itemGroup.style.display = 'none'; return; }
    if (itemGroup) itemGroup.style.display = 'block';

    const filtered = inventoryData.filter(i => i.category === selectedCat);
    itemSel.innerHTML = '<option value="">— оберіть матеріали —</option>';
    filtered.forEach(item => {
        const o = document.createElement('option');
        o.value = item.name;
        o.textContent = item.name + ' (залишок: ' + item.quantity + ' ' + item.unit + ')';
        itemSel.appendChild(o);
    });

    if (prefix === 'iss') updateBalanceBadge();
}

function updateBalanceBadge() {
    const itemEl = document.getElementById('iss-item');
    const badge = document.getElementById('iss-balance-badge');
    const val = document.getElementById('iss-balance-val');
    if (!itemEl || !badge) return;
    const item = inventoryData.find(i => i.name === itemEl.value);
    if (item) {
        badge.style.display = 'block';
        if (val) val.textContent = item.quantity + ' ' + item.unit;
    } else {
        badge.style.display = 'none';
    }
}

async function submitInvTransaction(type) {
    const prefix = type === 'arrival' ? 'arr' : 'iss';
    const catEl = document.getElementById(prefix + '-category');
    const itemEl = document.getElementById(prefix + '-item');
    const qtyEl = document.getElementById(prefix + '-qty');
    const dateEl = document.getElementById(prefix + '-date');

    if (!catEl.value || !itemEl.value || !qtyEl.value) {
        tg.showAlert('Заповніть всі поля!');
        return;
    }

    const payload = {
        action: 'transaction',
        type: type === 'arrival' ? 'Прихід' : 'Видача',
        category: catEl.value,
        name: itemEl.value,
        quantity: qtyEl.value,
        recipient: type === 'issuance' ? (document.getElementById('iss-recipient') ? document.getElementById('iss-recipient').value : '') : '',
        operationDate: dateEl ? dateEl.value : '',
        telegramId: currentUserTgId,
        userSource: userAccess ? userAccess.name : 'Unknown'
    };

    tg.MainButton.showProgress();
    try {
        await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        tg.showAlert('✅ ' + (type === 'arrival' ? 'Прихід' : 'Видачу') + ' записано!');
        // Скидаємо форму
        document.getElementById('form-' + (type === 'arrival' ? 'arrival' : 'issuance')).reset();
        if (document.getElementById(prefix + '-item-group')) document.getElementById(prefix + '-item-group').style.display = 'none';
        const today = new Date().toISOString().split('T')[0];
        if (dateEl) dateEl.value = today;
        loadAllData();
    } catch (e) {
        tg.showAlert('Помилка збереження. Спробуйте ще раз.');
    } finally {
        tg.MainButton.hideProgress();
    }
}

function openAddMaterialModal(prefix) {
    const modal = document.getElementById('modal-add');
    if (modal) modal.style.display = 'flex';
}

async function submitNewMaterial() {
    const cat = document.getElementById('input-category');
    const name = document.getElementById('input-name');
    const unit = document.getElementById('input-unit');
    if (!cat || !name || !unit || !name.value || !unit.value) {
        tg.showAlert('Заповніть всі поля!');
        return;
    }
    const payload = { 
        action: 'addMaterial', 
        category: cat.value, 
        name: name.value, 
        unit: unit.value, 
        telegramId: currentUserTgId,
        userSource: userAccess ? userAccess.name : 'Unknown'
    };
    tg.MainButton.showProgress();
    try {
        await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        tg.showAlert('✅ Матеріал додано до бази!');
        document.getElementById('modal-add').style.display = 'none';
        document.getElementById('form-add-material').reset();
        loadAllData();
    } catch (e) { tg.showAlert('Помилка'); } finally { tg.MainButton.hideProgress(); }
}

// ── WIZARD ──
function populateSelects() {
    // Сади
    const gardenSel = document.getElementById('wiz-garden');
    if (gardenSel) {
        gardenSel.innerHTML = '<option value="">- оберіть -</option>';
        (refData.gardens || []).forEach(g => {
            const o = document.createElement('option'); o.value = g; o.textContent = g; gardenSel.appendChild(o);
        });
    }
    // Техніка
    const tractorSel = document.getElementById('wiz-tractor');
    if (tractorSel) {
        tractorSel.innerHTML = '<option value="">- оберіть -</option>';
        (refData.machinery || []).forEach(m => {
            const o = document.createElement('option'); o.value = m; o.textContent = m; tractorSel.appendChild(o);
        });
    }
    // Агрегати
    const implSel = document.getElementById('wiz-implement');
    if (implSel) {
        implSel.innerHTML = '<option value="">- оберіть -</option>';
        (refData.implements || []).forEach(i => {
            const o = document.createElement('option'); o.value = i; o.textContent = i; implSel.appendChild(o);
        });
    }
    // Пестициди
    const pestSel = document.getElementById('wiz-pest-select');
    if (pestSel) {
        pestSel.innerHTML = '<option value="">- оберіть -</option>';
        (refData.pesticides || []).forEach(p => {
            const o = document.createElement('option'); o.value = p; o.textContent = p; pestSel.appendChild(o);
        });
    }
    // Бригади для фільтру
    const brigSel = document.getElementById('wiz-brigade');
    if (brigSel) {
        const brigades = [...new Set((refData.personnel || []).map(p => p.category).filter(Boolean))];
        brigSel.innerHTML = '<option value="">всі працівники</option>';
        brigades.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; brigSel.appendChild(o); });
    }
    // Працівники для звіту
    const repWorker = document.getElementById('rep-worker');
    if (repWorker) {
        repWorker.innerHTML = '<option value="">— Всі працівники —</option>';
        (refData.personnel || []).forEach(p => {
            const o = document.createElement('option');
            o.value = p.name;
            o.textContent = p.name + (p.category ? ' (' + p.category + ')' : '');
            repWorker.appendChild(o);
        });
    }

    // Додаємо отримувачів для видачі на складі
    const issRecipient = document.getElementById('iss-recipient');
    if (issRecipient) {
        issRecipient.innerHTML = '<option value="">— оберіть отримувача —</option>';
        (refData.personnel || []).forEach(p => {
            const o = document.createElement('option');
            o.value = p.name;
            o.textContent = p.name;
            issRecipient.appendChild(o);
        });
    }
}

function startWizard(type) {
    currentTaskType = type;
    currentWizStep = 1;
    selectedWorkers = [];
    taskPesticides = [];

    const dash = document.getElementById('tasks-dashboard');
    const wiz = document.getElementById('task-wizard');
    if (dash) dash.style.display = 'none';
    if (wiz) wiz.style.display = 'block';

    const isMech = type.includes('mechanized');
    const manSec = document.getElementById('wiz-manual-section');
    const mechSec = document.getElementById('wiz-mech-section');
    const opWrap = document.getElementById('wiz-operator-wrap');
    if (manSec) manSec.style.display = isMech ? 'none' : 'block';
    if (mechSec) mechSec.style.display = isMech ? 'block' : 'none';
    if (opWrap) opWrap.style.display = type.includes('operator') ? 'block' : 'none';

    // Встановлюємо сьогоднішню дату
    const wizDate = document.getElementById('wiz-date');
    if (wizDate && !wizDate.value) wizDate.value = new Date().toISOString().split('T')[0];

    // Заповнюємо список робіт
    const wt = refData.workTypes || [];
    const filteredWt = wt.filter(w => isMech ? w.category !== 'Ручна' : w.category === 'Ручна');
    const wSel = document.getElementById('wiz-workType');
    if (wSel) {
        wSel.innerHTML = '<option value="">- оберіть роботу -</option>';
        filteredWt.forEach(w => { const o = document.createElement('option'); o.value = w.name; o.textContent = w.name; wSel.appendChild(o); });
    }

    // Заповнюємо водіїв/операторів
    const personnel = refData.personnel || [];
    ['wiz-driver', 'wiz-operator'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        sel.innerHTML = '<option value="">- оберіть -</option>';
        personnel.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o); });
    });

    renderWorkerChips();
    taskOperators = [];
    renderOperatorList();
    
    // Заповнюємо види робіт для оператора (тільки ручні/додаткові)
    const opWorkSel = document.getElementById('wiz-op-work');
    if (opWorkSel) {
        opWorkSel.innerHTML = '<option value="">- оберіть роботу -</option>';
        (refData.workTypes || []).filter(w => w.category === 'Ручна').forEach(w => {
            const o = document.createElement('option'); o.value = w.name; o.textContent = w.name; opWorkSel.appendChild(o);
        });
    }

    updateWizView();
}

function addWizOperator() {
    const sel = document.getElementById('wiz-operator');
    const qty = document.getElementById('wiz-op-qty');
    const hrs = document.getElementById('wiz-op-hrs');
    const work = document.getElementById('wiz-op-work');
    
    if (!sel || !sel.value) { tg.showAlert('Оберіть оператора!'); return; }
    
    taskOperators.push({
        name: sel.value,
        qty: qty ? qty.value : '',
        hrs: hrs ? hrs.value : '',
        work: work ? work.value : ''
    });
    
    // Очищуємо поля
    if (sel) sel.value = '';
    if (qty) qty.value = '';
    if (hrs) hrs.value = '';
    if (work) work.value = '';
    
    renderOperatorList();
}

function removeWizOperator(index) {
    taskOperators.splice(index, 1);
    renderOperatorList();
}

function renderOperatorList() {
    const listEl = document.getElementById('wiz-op-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    taskOperators.forEach((op, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px; background:var(--bg-input); border-radius:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border);';
        
        let details = [];
        if (op.qty) details.push(op.qty + ' од.');
        if (op.hrs) details.push(op.hrs + ' год. (' + op.work + ')');
        
        item.innerHTML = `
            <div>
                <div style="font-weight:600; font-size:14px;">${op.name}</div>
                <div style="font-size:12px; color:var(--text-muted);">${details.join(' | ') || 'Основний обсяг'}</div>
            </div>
            <button onclick="removeWizOperator(${idx})" style="background:none; border:none; color:#ef4444; padding:5px; cursor:pointer;">
                <i class="fas fa-times-circle"></i>
            </button>
        `;
        listEl.appendChild(item);
    });
}

function closeWizard() {
    const dash = document.getElementById('tasks-dashboard');
    const wiz = document.getElementById('task-wizard');
    if (wiz) wiz.style.display = 'none';
    if (dash) dash.style.display = 'block';
}

function showPesticideChoice() {
    const dash = document.getElementById('tasks-dashboard');
    const pestDash = document.getElementById('pesticides-dashboard');
    if (dash) dash.style.display = 'none';
    if (pestDash) pestDash.style.display = 'block';
}

function hidePesticideChoice() {
    const dash = document.getElementById('tasks-dashboard');
    const pestDash = document.getElementById('pesticides-dashboard');
    if (pestDash) pestDash.style.display = 'none';
    if (dash) dash.style.display = 'block';
}

function renderWorkerChips() {
    const wrap = document.getElementById('wiz-workers-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    const brigade = document.getElementById('wiz-brigade') ? document.getElementById('wiz-brigade').value : '';
    const list = brigade ? (refData.personnel || []).filter(p => p.category === brigade) : (refData.personnel || []);
    list.forEach(w => {
        const c = document.createElement('div');
        c.className = 'w-chip' + (selectedWorkers.includes(w.name) ? ' selected' : '');
        c.textContent = w.name;
        c.onclick = () => {
            const idx = selectedWorkers.indexOf(w.name);
            if (idx > -1) selectedWorkers.splice(idx, 1); else selectedWorkers.push(w.name);
            renderWorkerChips();
        };
        wrap.appendChild(c);
    });
}

function filterWorkersByBrigade() { renderWorkerChips(); }

function selectAllBrigade() {
    const brigade = document.getElementById('wiz-brigade') ? document.getElementById('wiz-brigade').value : '';
    const list = brigade ? (refData.personnel || []).filter(p => p.category === brigade) : (refData.personnel || []);
    selectedWorkers = list.map(p => p.name);
    renderWorkerChips();
}

function wizStep(dir) {
    const isPest = currentTaskType && currentTaskType.includes('pesticide');
    const max = isPest ? 4 : 3;
    if (dir > 0 && currentWizStep >= max) { submitTask(); return; }
    currentWizStep += dir;
    if (currentWizStep < 1) { closeWizard(); return; }
    updateWizView();
}

function updateWizView() {
    document.querySelectorAll('.w-view').forEach(v => v.style.display = 'none');
    const isPest = currentTaskType && currentTaskType.includes('pesticide');
    const map = { 1: 'wv-1', 2: 'wv-2', 3: isPest ? 'wv-3' : 'wv-4', 4: 'wv-4' };
    const viewEl = document.getElementById(map[currentWizStep]);
    if (viewEl) viewEl.style.display = 'block';
    const btn = document.getElementById('wiz-next');
    const isLast = currentWizStep >= (isPest ? 4 : 3);
    if (btn) btn.innerHTML = isLast ? 'Записати <i class="fas fa-check"></i>' : 'Далі <i class="fas fa-arrow-right"></i>';
    if (isLast) buildSummary();
}

function buildSummary() {
    const dateEl = document.getElementById('wiz-date');
    const gardenEl = document.getElementById('wiz-garden');
    const workEl = document.getElementById('wiz-workType');
    const qtyEl = document.getElementById('wiz-qty');
    const summaryEl = document.getElementById('wiz-summary-content');
    if (!summaryEl) return;
    summaryEl.innerHTML =
        '<b>📅 Дата:</b> ' + (dateEl ? dateEl.value : '') + '<br>' +
        '<b>📍 Сад:</b> ' + (gardenEl ? gardenEl.value : '') + '<br>' +
        '<b>🛠 Робота:</b> ' + (workEl ? workEl.value : '') + '<br>' +
        '<b>📏 Обсяг:</b> ' + (qtyEl ? qtyEl.value : '') + '<br>' +
        (selectedWorkers.length > 0 ? '<b>👷 Працівники:</b> ' + selectedWorkers.join(', ') + '<br>' : '') +
        (taskOperators.length > 0 ? '<b>🚜 Оператори:</b> ' + taskOperators.map(o => o.name).join(', ') + '<br>' : '') +
        (taskPesticides.length > 0 ? '<b>🧪 Препарати:</b> ' + taskPesticides.map(p => p.name).join(', ') : '');
}

function setWizDate(mode, btn) {
    const el = document.getElementById('wiz-date');
    if (!el) return;
    const d = new Date();
    if (mode === 'yesterday') d.setDate(d.getDate() - 1);
    el.value = d.toISOString().split('T')[0];
    
    // Toggle active state
    if (btn && btn.parentNode) {
        btn.parentNode.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
    }
}

function addPesticideToTask() {
    const sel = document.getElementById('wiz-pest-select');
    const dose = document.getElementById('wiz-pest-dose');
    const vol = document.getElementById('wiz-pest-vol');
    if (!sel || !sel.value) { tg.showAlert('Оберіть препарат'); return; }
    taskPesticides.push({ name: sel.value, dose: dose ? dose.value : '', volume: vol ? vol.value : '' });
    const listEl = document.getElementById('wiz-pest-list');
    if (listEl) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:6px; background:var(--input-bg); border-radius:6px; margin-bottom:5px; font-size:13px;';
        item.textContent = sel.value + ' — ' + (vol ? vol.value : '') + ' л';
        listEl.appendChild(item);
    }
    if (sel) sel.value = '';
    if (dose) dose.value = '';
    if (vol) vol.value = '';
}

async function submitTask() {
    if (selectedWorkers.length === 0 && !currentTaskType.includes('mechanized')) {
        tg.showAlert('Оберіть хоча б одного працівника!');
        return;
    }
    const payload = {
        action: 'saveTask',
        telegramId: currentUserTgId,
        userSource: userAccess ? userAccess.name : 'Unknown',
        date: document.getElementById('wiz-date') ? document.getElementById('wiz-date').value : '',
        garden: document.getElementById('wiz-garden') ? document.getElementById('wiz-garden').value : '',
        workType: document.getElementById('wiz-workType') ? document.getElementById('wiz-workType').value : '',
        qty: document.getElementById('wiz-qty') ? document.getElementById('wiz-qty').value : '',
        taskType: currentTaskType,
        workers: selectedWorkers.map(n => ({ name: n })),
        mechanizedDetails: {
            tractor: document.getElementById('wiz-tractor') ? document.getElementById('wiz-tractor').value : '',
            driver: document.getElementById('wiz-driver') ? document.getElementById('wiz-driver').value : '',
            implement: document.getElementById('wiz-implement') ? document.getElementById('wiz-implement').value : '',
            operators: taskOperators
        },
        pesticideDetails: taskPesticides
    };
    tg.MainButton.showProgress();
    try {
        await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        tg.showAlert('✅ Наряд збережено!');
        closeWizard();
    } catch (e) { tg.showAlert('Помилка збереження'); } finally { tg.MainButton.hideProgress(); }
}

// ── REPORTS ──
function updateReportCategories() {
    const m = document.getElementById('rep-module');
    const s = document.getElementById('rep-category');
    const wWrap = document.getElementById('rep-worker-wrap');
    
    if (!m || !s) return;
    
    if (wWrap) {
        wWrap.style.display = m.value === 'tasks' ? 'block' : 'none';
    }
    
    s.innerHTML = '';
    const cats = m.value === 'inventory'
        ? [['ПММ','ПММ'], ['Пестициди','Пестициди'], ['Добрива','Добрива'], ['Запчастини','Запчастини']]
        : [['all_work','Всі роботи'], ['manual','Ручні роботи'], ['mechanized','Механізовані'], ['mechanized_operator','З оператором'], ['mechanized_pesticides','ЗЗР (механіз.)'], ['mechanized_pesticides_operator','ЗЗР з операторами']];
    cats.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
}

function setRepDates(mode, btn) {
    const start = document.getElementById('rep-start-date');
    const end = document.getElementById('rep-end-date');
    if (!start || !end) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (mode === 'today') { start.value = today; end.value = today; }
    else if (mode === 'yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        const yStr = y.toISOString().split('T')[0];
        start.value = yStr; end.value = yStr;
    } else if (mode === 'month') {
        start.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
        end.value = today;
    }
}

async function loadReport() {
    const start = document.getElementById('rep-start-date') ? document.getElementById('rep-start-date').value : '';
    const end = document.getElementById('rep-end-date') ? document.getElementById('rep-end-date').value : '';
    const module = document.getElementById('rep-module') ? document.getElementById('rep-module').value : '';
    const category = document.getElementById('rep-category') ? document.getElementById('rep-category').value : '';
    const isDetailed = document.getElementById('rep-detailed') ? document.getElementById('rep-detailed').value : 'false';
    const worker = document.getElementById('rep-worker') ? document.getElementById('rep-worker').value : '';
    const url = GAS_URL + '?action=getReport&module=' + module + '&category=' + category + '&startDate=' + start + '&endDate=' + end + '&telegramId=' + currentUserTgId + '&isDetailed=' + isDetailed + '&worker=' + encodeURIComponent(worker);
    tg.MainButton.showProgress();
    try {
        const r = await fetch(url);
        const j = await r.json();
        if (j.status === 'success') renderReport(j.data);
        else tg.showAlert('Помилка отримання звіту');
    } catch (e) { tg.showAlert('Помилка мережі'); } finally { tg.MainButton.hideProgress(); }
}

function renderReport(data) {
    if (!data) return;
    const thead = document.getElementById('report-thead');
    const tbody = document.getElementById('report-tbody');
    const resultsEl = document.getElementById('report-results');
    const emptyEl = document.getElementById('report-empty');
    if (!thead || !tbody) return;

    const isAdmin = userAccess && userAccess.role === 'admin';
    const items = data.items || [];

    if (items.length === 0) {
        if (resultsEl) resultsEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'block';
        tbody.innerHTML = '';
        thead.innerHTML = '';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'block';

    // Для стандартних звітів
    thead.innerHTML = '<th>Дата</th><th>Працівник / Назва</th><th>Вид роботи</th><th>' + (isAdmin ? 'Сума, грн' : 'Обсяг') + '</th>';
    tbody.innerHTML = '';
    items.forEach(i => {
        const r = document.createElement('tr');
        const col4 = isAdmin ? (i.col4 || i.sum || '') : (i.col3 || i.qty || '');
        r.innerHTML = '<td>' + (i.col1 || i.date || '') + '</td><td>' + (i.col1 || i.worker || i.col2 || '') + '</td><td>' + (i.col2 || i.work || i.col3 || '') + '</td><td>' + col4 + '</td>';
        tbody.appendChild(r);
    });
}

// Глобальний експорт
window.copyMyId = copyMyId;
window.loadAllData = loadAllData;
window.switchGlobalTab = switchGlobalTab;
window.renderInventory = renderInventory;
window.renderItemSelect = renderItemSelect;
window.updateBalanceBadge = updateBalanceBadge;
window.openAddMaterialModal = openAddMaterialModal;
window.startWizard = startWizard;
window.closeWizard = closeWizard;
window.showPesticideChoice = showPesticideChoice;
window.hidePesticideChoice = hidePesticideChoice;
window.wizStep = wizStep;
window.setWizDate = setWizDate;
window.filterWorkersByBrigade = filterWorkersByBrigade;
window.selectAllBrigade = selectAllBrigade;
window.renderWorkerChips = renderWorkerChips;
window.addPesticideToTask = addPesticideToTask;
window.addWizOperator = addWizOperator;
window.removeWizOperator = removeWizOperator;
window.addPinDigit = addPinDigit;
window.clearPin = clearPin;
window.verifyPin = verifyPin;
window.updateReportCategories = updateReportCategories;
window.setRepDates = setRepDates;
window.loadReport = loadReport;
