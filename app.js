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
        data = data.filter(i => i.category === mapped);
    }
    // Фільтр: показувати тільки те, що є в наявності (> 0)
    data = data.filter(i => (parseFloat(String(i.quantity).replace(',', '.')) || 0) > 0);
    
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

    let filtered = inventoryData.filter(i => i.category === selectedCat);
    
    // При видачі (iss) показуємо лише ті матеріали, які є в наявності (> 0)
    // При приході (arr) показуємо всі
    if (prefix === 'iss') {
        filtered = filtered.filter(i => (parseFloat(String(i.quantity).replace(',', '.')) || 0) > 0);
    }
    
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

    // Бригади для звіту
    const repBrigade = document.getElementById('rep-brigade');
    if (repBrigade) {
        const brigades = [...new Set((refData.personnel || []).map(p => p.category).filter(Boolean))];
        repBrigade.innerHTML = '<option value="">— Всі бригади —</option>';
        brigades.sort().forEach(b => {
            const o = document.createElement('option');
            o.value = b;
            o.textContent = b;
            repBrigade.appendChild(o);
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
    const t = document.getElementById('rep-detailed');
    const wWrap = document.getElementById('rep-worker-wrap');
    const bWrap = document.getElementById('rep-brigade-wrap');
    
    if (!m || !s || !t) return;
    
    if (wWrap) wWrap.style.display = m.value === 'tasks' ? 'block' : 'none';
    if (bWrap) bWrap.style.display = m.value === 'tasks' ? 'block' : 'none';
    
    // Update Categories
    s.innerHTML = '';
    const cats = m.value === 'inventory'
        ? [['ПММ','ПММ'], ['Пестициди','Пестициди'], ['Добрива','Добрива'], ['Запчастини','Запчастини'], ['Склад','Інше']]
        : [['all_work','Всі роботи'], ['manual','Ручні роботи'], ['mechanized','Механізовані'], ['mechanized_operator','З оператором'], ['mechanized_pesticides','ЗЗР (механіз.)'], ['mechanized_pesticides_operator','ЗЗР з операторами']];
    cats.forEach(([v, text]) => { const o = document.createElement('option'); o.value = v; o.textContent = text; s.appendChild(o); });

    // Update Report Types
    const prevType = t.value;
    t.innerHTML = '';
    const types = m.value === 'inventory'
        ? [['summary', 'Залишки на складі (Сальдо)'], ['detailed', 'Історія рухів (Детально)']]
        : [['summary_workers', 'Загальний по працівниках'], ['detailed_workers', 'Деталізований (по днях/операціях)'], ['calendar', 'Календарний (Дні / Години)'], ['summary_works', 'Загальний по видах робіт'], ['payroll', 'Зарплатна відомість']];
    types.forEach(([v, text]) => { const o = document.createElement('option'); o.value = v; o.textContent = text; t.appendChild(o); });
    
    // Maintain selection if possible
    if (Array.from(t.options).some(o => o.value === prevType)) t.value = prevType;
}

function clearReport() {
    const resultsEl = document.getElementById('report-results');
    const thead = document.getElementById('report-thead');
    const tbody = document.getElementById('report-tbody');
    const summaryCard = document.getElementById('report-summary');
    
    if (resultsEl) resultsEl.style.display = 'none';
    if (summaryCard) summaryCard.style.display = 'none';
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';
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
    const isDetailed = document.getElementById('rep-detailed') ? document.getElementById('rep-detailed').value : 'summary';
    const worker = document.getElementById('rep-worker') ? document.getElementById('rep-worker').value : '';
    const brigade = document.getElementById('rep-brigade') ? document.getElementById('rep-brigade').value : '';
    const url = GAS_URL + '?action=getReport&module=' + module + '&category=' + category + '&startDate=' + start + '&endDate=' + end + '&telegramId=' + currentUserTgId + '&isDetailed=' + isDetailed + '&worker=' + encodeURIComponent(worker) + '&brigade=' + encodeURIComponent(brigade);
    tg.MainButton.showProgress();
    try {
        const r = await fetch(url);
        const j = await r.json();
        if (j.status === 'success') renderReport(j.data);
        else {
            console.error("Report Error:", j);
            tg.showAlert('Помилка: ' + (j.message || 'Невідома помилка сервера'));
        }
    } catch (e) { tg.showAlert('Помилка мережі'); } finally { tg.MainButton.hideProgress(); }
}

function renderReport(data) {
    if (!data) return;
    const thead = document.getElementById('report-thead');
    const tbody = document.getElementById('report-tbody');
    const resultsEl = document.getElementById('report-results');
    const emptyEl = document.getElementById('report-empty');
    const btnExcel = document.getElementById('btn-download-excel');
    const btnClear = document.getElementById('btn-clear-report');
    
    if (!thead || !tbody) return;

    const isAdmin = userAccess && userAccess.role === 'admin';
    const items = data.items || [];

    if (items.length === 0) {
        if (resultsEl) resultsEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'block';
        if (btnExcel) btnExcel.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        tbody.innerHTML = '';
        thead.innerHTML = '';
        return;
    }
    
    tbody.innerHTML = ''; // IMPORTANT: Clear previous results!
    
    if (emptyEl) emptyEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'block';
    if (btnExcel) btnExcel.style.display = 'block';
    if (btnClear) btnClear.style.display = 'block';

    const module = document.getElementById('rep-module') ? document.getElementById('rep-module').value : '';
    const isDetailed = document.getElementById('rep-detailed') ? document.getElementById('rep-detailed').value : 'summary';
    
    // Dynamic Headers based on report context
    let heads = [];
    if (module === 'inventory') {
        if (isDetailed === 'detailed' || isDetailed === 'true') heads = ['Дата', 'Назва (Матеріал)', 'Тип операції', 'Об\'єм'];
        else heads = ['Назва (Матеріал)', 'Надходження', 'Витрачено', 'Баланс (Різниця)'];
    } else {
        if (isDetailed === 'detailed_workers' || isDetailed === 'true') heads = ['Дата', 'Працівник', 'Вид роботи (Обсяг)', isAdmin ? 'Сума, грн' : '-'];
        else if (isDetailed === 'calendar') heads = ['Працівник / Бригада', '-', 'Відпрацьовані дні', isAdmin ? 'Загальна сума' : '-'];
        else if (isDetailed === 'summary_works') heads = ['Вид роботи', '-', 'Загальний обсяг', isAdmin ? 'Втрачено (грн)' : '-'];
        else heads = ['Працівник / Бригада', '-', 'Разом обсяг', isAdmin ? 'Всього сума, грн' : '-'];
    }

    // Render Headers
    let theadHTML = '';
    heads.forEach(h => theadHTML += '<th>' + h + '</th>');
    thead.innerHTML = theadHTML;
    
    if (data.type === 'calendar') {
        const dates = data.dates || [];
        
        let th = `<th style="position:sticky; left:0; z-index:2; background:var(--bg-color); min-width:150px;">Працівник</th>`;
        dates.forEach(d => th += `<th>${d}</th>`);
        th += `<th>Днів</th><th>Годин</th><th>Зароблено</th><th>На руки (чистими)</th>`;
        thead.innerHTML = th;
        
        items.forEach(i => {
           let tr = document.createElement('tr');
           let td = `<td style="position:sticky; left:0; z-index:1; background:var(--surface-color); font-weight:bold; white-space:nowrap;">${i.worker}<br><small style="font-weight:normal; color:var(--text-muted);">${i.brigade}</small></td>`;
           dates.forEach(d => {
               td += `<td style="text-align:center;">${i[d] || '-'}</td>`;
           });
           td += `<td style="text-align:center; font-weight:bold;">${i.totalDays}</td>
                  <td style="text-align:center;">${i.totalHours}</td>
                  <td style="text-align:right; font-weight:bold;">${i.gross}</td>
                  <td style="text-align:right; color:var(--primary); font-weight:bold;">${i.net}</td>`;
           tr.innerHTML = td;
           tbody.appendChild(tr);
        });
        
        // Horizontal scroll container styling is already expected to be handled globally
        return;
    }
    
    if (data.type === 'payroll') {
        thead.innerHTML = '<th>Дата / Робота</th><th>Працівник</th><th>Брутто</th><th>На руки / Витрати</th>';
        
        let sumBrutto = 0, sumPit = 0, sumMt = 0, sumNet = 0, sumEsv = 0;
        
        items.forEach(i => {
            sumBrutto += parseFloat(i.brutto) || 0;
            sumPit += parseFloat(i.pit) || 0;
            sumMt += parseFloat(i.military) || 0;
            sumNet += parseFloat(i.net) || 0;
            sumEsv += parseFloat(i.esv) || 0;
            
            const r = document.createElement('tr');
            
            const workClean = (i.work || '').replace(/\[.*\]\s*/, '');
            const c1 = `<b>${i.date}</b><br><small style="color:var(--text-muted);">${workClean} (${i.qty})</small>`;
            const c2 = `${i.worker}<br><small style="color:var(--text-muted);">${i.brigade}</small>`;
            const c3 = `${i.brutto}`;
            const c4 = `<span style="font-weight:bold; color:var(--primary); font-size:1.1em;">${i.net} <i class="fas fa-wallet"></i></span><br>
                <div style="margin-top:4px; padding-top:4px; border-top:1px dashed var(--border-color); color:#ef4444; font-size:0.85em;">- ПДФО: ${i.pit}<br>- ВЗ: ${i.military}</div>
                <div style="margin-top:2px; color:var(--text-muted); font-size:0.85em;">+ ЄСВ: ${i.esv}</div>`;
                
            r.innerHTML = `<td style="vertical-align:middle;">${c1}</td><td style="vertical-align:middle;">${c2}</td><td style="vertical-align:middle; font-weight:600;">${c3}</td><td style="vertical-align:middle;">${c4}</td>`;
            tbody.appendChild(r);
        });
        
        const f = document.createElement('tr');
        f.style.backgroundColor = 'var(--surface-color)';
        f.style.borderTop = '2px solid var(--border-color)';
        const totalTaxes = (sumPit + sumMt).toFixed(2);
        const totalCorp = (sumBrutto + sumEsv).toFixed(2);
        
        f.innerHTML = `
            <td colspan="2" style="text-align:right; font-weight:bold; vertical-align:middle; text-transform:uppercase;">Підсумки за період:</td>
            <td style="font-weight:bold; font-size:1.1em; vertical-align:middle; color:var(--text-main);">${sumBrutto.toFixed(2)}</td>
            <td style="font-size:0.9em; padding:10px;">
                <span style="font-weight:bold; color:var(--primary); font-size:1.2em;">До виплати: ${sumNet.toFixed(2)}</span><br>
                <div style="margin-top:6px; padding-top:6px; border-top:1px solid var(--border-color);">
                    <span style="color:#ef4444;">Податки (ПДФО+ВЗ): ${totalTaxes}</span><br>
                    <span style="color:var(--text-muted);">Нараховано ЄСВ: ${sumEsv.toFixed(2)}</span>
                </div>
                <div style="margin-top:6px; padding:6px; background:var(--bg-color); border-radius:6px;">
                    <b style="color:var(--text-main);">Витрати підприємства: ${totalCorp}</b>
                </div>
            </td>`;
        tbody.appendChild(f);
        return;
    }

    items.forEach(i => {
        const r = document.createElement('tr');
        
        let c1 = '', c2 = '', c3 = '', c4 = '';
        if (module === 'inventory') {
            if (isDetailed === 'detailed' || isDetailed === 'true') { c1 = i.col1; c2 = i.col2; c3 = i.col3; c4 = i.col4; }
            else { c1 = i.col1; c2 = `<span style="color:var(--primary);">${i.col2}</span>`; c3 = `<span style="color:#ef4444;">${i.col3}</span>`; c4 = `<b>${i.col4}</b>`; }
        } else {
            if (isDetailed === 'detailed_workers' || isDetailed === 'true') { 
                c1 = i.col1; c2 = i.col2 + (i.brigade ? `<br><small style="color:var(--text-muted);">${i.brigade}</small>` : ''); 
                c3 = i.col3; c4 = isAdmin ? i.col4 : '-'; 
            }
            else if (isDetailed === 'calendar') { 
                c1 = i.col1 + (i.brigade ? `<br><small style="color:var(--text-muted);">${i.brigade}</small>` : ''); 
                c2 = '-'; c3 = i.col3 + ' днів'; c4 = isAdmin ? i.col4 : '-'; 
            }
            else if (isDetailed === 'summary_works') { 
                c1 = i.col1; 
                c2 = '-'; c3 = i.col3; c4 = isAdmin ? i.col4 : '-'; 
            }
            else { 
                c1 = i.col1 + (i.brigade ? `<br><small style="color:var(--text-muted);">${i.brigade}</small>` : ''); 
                c2 = '-'; c3 = i.col3; c4 = isAdmin ? i.col4 : '-'; 
            }
        }
        
        r.innerHTML = `<td>${c1}</td><td>${c2}</td><td>${c3}</td><td style="font-weight:600;">${c4}</td>`;
        tbody.appendChild(r);
    });
}

function downloadExcel() {
    const table = document.getElementById('report-table');
    if (!table) return;
    
    // Add BOM for UTF-8 so Excel displays Cyrillic correctly
    let csv = '\uFEFF'; 
    let rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        let rowData = [];
        let cols = row.querySelectorAll('th, td');
        cols.forEach(col => {
            // Remove br tags and replace with space, strip inner tags
            let text = col.innerHTML.replace(/<br\s*[\/]?>/gi, " ");
            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = text;
            text = tempDiv.textContent || tempDiv.innerText || "";
            // Escape quotes
            text = text.replace(/"/g, '""');
            // Enclose in quotes
            rowData.push('"' + text.trim() + '"');
        });
        csv += rowData.join(';') + '\n';
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const fileName = 'Звіт_TaskBot_' + dateStr + '.csv';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
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
window.downloadExcel = downloadExcel;
