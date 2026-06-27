// ===== Storage =====
const DB = {
    get:    (k) => JSON.parse(localStorage.getItem(k) || '[]'),
    set:    (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    getObj: (k) => JSON.parse(localStorage.getItem(k) || 'null'),
    setObj: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

const K = {
    USERS:    'cp_users',
    RIDES:    'cp_rides',
    BOOKINGS: 'cp_bookings',
    USER:     'cp_user',
};

// ===== State =====
let currentUser  = DB.getObj(K.USER);
let detailMap    = null;
let currentRideId = null;
let activeSearch = null; // null = show all

// ===== Utilities =====
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showToast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 (周${days[d.getDay()]})`;
}

function fmtTime(str) { return str || ''; }

function initial(name) {
    if (!name) return '?';
    // Return first character (works for Chinese names)
    return name[0].toUpperCase();
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

// ===== Navigation =====
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');

    const nav = document.getElementById('bottom-nav');
    nav.classList.toggle('visible', name !== 'auth');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.screen === name);
    });

    if (name === 'home')     renderHomeRides();
    if (name === 'my-rides') renderMyRides();
    if (name === 'profile')  renderProfile();
}

// ===== Auth =====
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.tab === 'login';
        document.getElementById('login-form').style.display    = isLogin ? '' : 'none';
        document.getElementById('register-form').style.display = isLogin ? 'none' : '';
    });
});

document.getElementById('btn-login').addEventListener('click', () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) return showToast('请填写完整信息');

    const user = DB.get(K.USERS).find(u => u.username === username && u.password === password);
    if (!user) return showToast('用户名或密码错误');

    currentUser = user;
    DB.setObj(K.USER, user);
    showScreen('home');
    showToast(`欢迎回来，${user.username}！`);
});

document.getElementById('btn-register').addEventListener('click', () => {
    const username = document.getElementById('reg-username').value.trim();
    const phone    = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;

    if (!username || !phone || !password) return showToast('请填写所有必填项');
    if (password !== confirm) return showToast('两次密码不一致');
    if (password.length < 6) return showToast('密码至少需要6位');

    const users = DB.get(K.USERS);
    if (users.find(u => u.username === username)) return showToast('该用户名已被使用');

    const user = { id: uid(), username, phone, password };
    users.push(user);
    DB.set(K.USERS, users);
    currentUser = user;
    DB.setObj(K.USER, user);
    showScreen('home');
    showToast('注册成功，欢迎加入！');
});

// ===== Bottom Nav =====
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (!currentUser) return showScreen('auth');
        showScreen(item.dataset.screen);
    });
});

// ===== Home Screen =====
function getPublicRides() {
    const now = new Date();
    return DB.get(K.RIDES)
        .filter(r => {
            if (r.cancelled) return false;
            if (r.driverId === currentUser?.id) return false;
            const rdt = new Date(`${r.date}T${r.time}`);
            return rdt >= now;
        })
        .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        });
}

function availableSeats(ride) {
    return ride.seats - (ride.passengers || []).length;
}

function rideCardHTML(ride) {
    const users      = DB.get(K.USERS);
    const driver     = users.find(u => u.id === ride.driverId);
    const driverName = driver?.username || '未知司机';
    const seats      = availableSeats(ride);
    const priceHTML  = ride.price > 0
        ? `<span class="price-tag">¥${ride.price}<span class="unit">/人</span></span>`
        : `<span class="free-tag">免费</span>`;

    return `
    <div class="ride-card" data-id="${ride.id}">
        <div class="ride-route">
            <span class="city-name-large">${ride.from}</span>
            <div class="route-arrow-area">
                <div class="route-line-h"></div>
                <i class="fas fa-chevron-right" style="color:var(--secondary);font-size:13px"></i>
            </div>
            <span class="city-name-large">${ride.to}</span>
        </div>
        <div class="ride-meta">
            <span><i class="fas fa-calendar-alt"></i>${fmtDate(ride.date)}</span>
            <span><i class="fas fa-clock"></i>${fmtTime(ride.time)}</span>
            <span><i class="fas fa-chair"></i>剩余 <strong>${seats}</strong> 座</span>
        </div>
        <div class="ride-footer">
            <div class="driver-info">
                <div class="avatar">${initial(driverName)}</div>
                <span>${driverName}</span>
            </div>
            ${priceHTML}
        </div>
    </div>`;
}

function renderHomeRides() {
    const list  = document.getElementById('rides-list');
    const empty = document.getElementById('no-rides');
    const rides = activeSearch !== null ? activeSearch : getPublicRides().filter(r => availableSeats(r) > 0);

    if (rides.length === 0) {
        list.innerHTML = '';
        empty.style.display = '';
    } else {
        empty.style.display = 'none';
        list.innerHTML = rides.map(rideCardHTML).join('');
        list.querySelectorAll('.ride-card').forEach(card => {
            card.addEventListener('click', () => openRideDetail(card.dataset.id));
        });
    }
}

// Search
const searchFromEl = document.getElementById('search-from');
const searchToEl   = document.getElementById('search-to');

searchFromEl.addEventListener('input', () => {
    document.getElementById('clear-from').style.display = searchFromEl.value ? '' : 'none';
});
searchToEl.addEventListener('input', () => {
    document.getElementById('clear-to').style.display = searchToEl.value ? '' : 'none';
});

document.getElementById('clear-from').addEventListener('click', () => {
    searchFromEl.value = '';
    document.getElementById('clear-from').style.display = 'none';
});
document.getElementById('clear-to').addEventListener('click', () => {
    searchToEl.value = '';
    document.getElementById('clear-to').style.display = 'none';
});

document.getElementById('btn-swap').addEventListener('click', () => {
    const tmp = searchFromEl.value;
    searchFromEl.value = searchToEl.value;
    searchToEl.value = tmp;
    document.getElementById('clear-from').style.display = searchFromEl.value ? '' : 'none';
    document.getElementById('clear-to').style.display   = searchToEl.value   ? '' : 'none';
});

document.getElementById('btn-search').addEventListener('click', () => {
    const from = searchFromEl.value.trim().toLowerCase();
    const to   = searchToEl.value.trim().toLowerCase();
    const date = document.getElementById('search-date').value;

    let rides = getPublicRides();
    if (from) rides = rides.filter(r => r.from.toLowerCase().includes(from));
    if (to)   rides = rides.filter(r => r.to.toLowerCase().includes(to));
    if (date) rides = rides.filter(r => r.date === date);

    activeSearch = rides;
    document.getElementById('btn-clear-search').style.display = '';
    renderHomeRides();
    showToast(rides.length > 0 ? `找到 ${rides.length} 个行程` : '未找到符合条件的行程');
});

document.getElementById('btn-clear-search').addEventListener('click', () => {
    activeSearch = null;
    searchFromEl.value = '';
    searchToEl.value   = '';
    document.getElementById('search-date').value = '';
    document.getElementById('clear-from').style.display = 'none';
    document.getElementById('clear-to').style.display   = 'none';
    document.getElementById('btn-clear-search').style.display = 'none';
    renderHomeRides();
});

// ===== Post Ride =====
document.getElementById('btn-post').addEventListener('click', () => {
    if (!currentUser) return showScreen('auth');

    const from  = document.getElementById('post-from').value.trim();
    const to    = document.getElementById('post-to').value.trim();
    const date  = document.getElementById('post-date').value;
    const time  = document.getElementById('post-time').value;
    const seats = parseInt(document.getElementById('post-seats').value);
    const price = parseFloat(document.getElementById('post-price').value) || 0;
    const note  = document.getElementById('post-note').value.trim();

    if (!from || !to)   return showToast('请填写出发地和目的地');
    if (!date || !time) return showToast('请填写出发日期和时间');

    const rideDate = new Date(`${date}T${time}`);
    if (rideDate < new Date()) return showToast('出发时间不能早于现在');

    const ride = {
        id: uid(), driverId: currentUser.id,
        from, to, date, time, seats, price, note,
        passengers: [], cancelled: false, createdAt: Date.now(),
    };

    const rides = DB.get(K.RIDES);
    rides.push(ride);
    DB.set(K.RIDES, rides);

    // Clear form
    ['post-from', 'post-to', 'post-date', 'post-time', 'post-price', 'post-note']
        .forEach(id => { document.getElementById(id).value = ''; });

    activeSearch = null;
    showToast('行程发布成功！');
    showScreen('home');
});

// ===== Ride Detail =====
async function openRideDetail(rideId) {
    const rides = DB.get(K.RIDES);
    const ride  = rides.find(r => r.id === rideId);
    if (!ride) return;

    currentRideId = rideId;

    const users      = DB.get(K.USERS);
    const driver     = users.find(u => u.id === ride.driverId);
    const driverName = driver?.username || '未知司机';
    const bookings   = DB.get(K.BOOKINGS);
    const seats      = availableSeats(ride);
    const isDriver   = currentUser && ride.driverId === currentUser.id;

    // Populate fields
    document.getElementById('detail-from').textContent     = ride.from;
    document.getElementById('detail-to').textContent       = ride.to;
    document.getElementById('detail-datetime').textContent = `${fmtDate(ride.date)} ${fmtTime(ride.time)}`;
    document.getElementById('detail-driver').textContent   = driverName;
    document.getElementById('detail-seats').textContent    = `${seats} 座可用 / 共 ${ride.seats} 座`;
    document.getElementById('detail-price').textContent    = ride.price > 0 ? `¥${ride.price} / 人` : '免费';

    const noteCard = document.getElementById('detail-note-card');
    if (ride.note) {
        document.getElementById('detail-note').textContent = ride.note;
        noteCard.style.display = '';
    } else {
        noteCard.style.display = 'none';
    }

    // Book button
    const bookBtn = document.getElementById('btn-book-ride');
    bookBtn.disabled = false;
    bookBtn.style.cssText = '';
    bookBtn.textContent = '申请乘车';

    if (isDriver) {
        bookBtn.textContent = '这是我的行程';
        bookBtn.disabled = true;

        // Show passenger requests
        const rideBookings = bookings.filter(b => b.rideId === rideId);
        const passSection  = document.getElementById('passengers-section');
        if (rideBookings.length > 0) {
            passSection.style.display = '';
            document.getElementById('passengers-list').innerHTML = rideBookings.map(b => {
                const passenger = users.find(u => u.id === b.passengerId);
                const name = passenger?.username || '未知';
                const isPending = b.status === 'pending';
                return `
                <div class="booking-request">
                    <div class="driver-info">
                        <div class="avatar">${initial(name)}</div>
                        <span>${name}</span>
                    </div>
                    <div class="booking-actions">
                        ${isPending
                            ? `<button class="btn-sm btn-accept" data-bid="${b.id}">接受</button>
                               <button class="btn-sm btn-reject" data-bid="${b.id}">拒绝</button>`
                            : `<span class="badge ${b.status === 'accepted' ? 'badge-success' : 'badge-danger'}">
                                ${b.status === 'accepted' ? '已接受' : '已拒绝'}
                               </span>`}
                    </div>
                </div>`;
            }).join('');

            document.querySelectorAll('[data-bid]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.classList.contains('btn-accept') ? 'accepted' : 'rejected';
                    respondBooking(btn.dataset.bid, action);
                });
            });
        } else {
            passSection.style.display = 'none';
        }
    } else {
        document.getElementById('passengers-section').style.display = 'none';
        const myBooking = bookings.find(b => b.rideId === rideId && b.passengerId === currentUser?.id);
        if (myBooking) {
            const map = {
                pending:  ['申请中…', '#7C3AED'],
                accepted: ['已确认上车 ✓', '#059669'],
                rejected: ['申请被拒绝', '#DC2626'],
            };
            const [label, color] = map[myBooking.status] || ['已申请', '#888'];
            bookBtn.textContent = label;
            bookBtn.disabled    = true;
            bookBtn.style.background = color;
        } else if (seats <= 0) {
            bookBtn.textContent = '座位已满';
            bookBtn.disabled    = true;
            bookBtn.style.background = '#B0BAD4';
        }
    }

    // Show modal
    document.getElementById('modal-ride-detail').classList.add('active');

    // Init map
    setTimeout(() => initDetailMap(ride), 80);
}

function respondBooking(bookingId, status) {
    const bookings = DB.get(K.BOOKINGS);
    const booking  = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    booking.status = status;

    if (status === 'accepted') {
        const rides = DB.get(K.RIDES);
        const ride  = rides.find(r => r.id === booking.rideId);
        if (ride && !(ride.passengers || []).includes(booking.passengerId)) {
            ride.passengers = ride.passengers || [];
            ride.passengers.push(booking.passengerId);
            DB.set(K.RIDES, rides);
        }
    }

    DB.set(K.BOOKINGS, bookings);
    openRideDetail(currentRideId);
    showToast(status === 'accepted' ? '已接受乘客申请' : '已拒绝申请');
}

document.getElementById('btn-book-ride').addEventListener('click', () => {
    if (!currentUser) return showScreen('auth');
    if (!currentRideId) return;

    const bookings = DB.get(K.BOOKINGS);
    if (bookings.find(b => b.rideId === currentRideId && b.passengerId === currentUser.id)) {
        return showToast('你已经申请过这个行程了');
    }

    bookings.push({
        id: uid(), rideId: currentRideId,
        passengerId: currentUser.id, status: 'pending',
        createdAt: Date.now(),
    });
    DB.set(K.BOOKINGS, bookings);
    showToast('申请已发送，等待司机确认');
    openRideDetail(currentRideId);
});

function closeModal() {
    document.getElementById('modal-ride-detail').classList.remove('active');
    if (detailMap) { detailMap.remove(); detailMap = null; }
}

document.getElementById('btn-close-detail').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);

// ===== Map =====
async function geocode(query) {
    try {
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9', 'User-Agent': 'CarpoolApp/1.0' } }
        );
        const data = await r.json();
        if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (_) {}
    return null;
}

function makeMarkerIcon(color) {
    return L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7], className: '',
    });
}

async function initDetailMap(ride) {
    const container = document.getElementById('detail-map');
    if (detailMap) { detailMap.remove(); detailMap = null; }

    detailMap = L.map(container, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(detailMap);

    detailMap.setView([25.0, 121.5], 9);

    const [fromCoords, toCoords] = await Promise.all([geocode(ride.from), geocode(ride.to)]);

    if (fromCoords) {
        L.marker([fromCoords.lat, fromCoords.lng], { icon: makeMarkerIcon('#4F6CF7') })
            .addTo(detailMap)
            .bindPopup(`<b>出发</b>: ${ride.from}`);
    }
    if (toCoords) {
        L.marker([toCoords.lat, toCoords.lng], { icon: makeMarkerIcon('#F97316') })
            .addTo(detailMap)
            .bindPopup(`<b>目的</b>: ${ride.to}`);
    }

    if (fromCoords && toCoords) {
        L.polyline(
            [[fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]],
            { color: '#4F6CF7', weight: 3, opacity: 0.75, dashArray: '8 8' }
        ).addTo(detailMap);

        detailMap.fitBounds(
            L.latLngBounds([fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]),
            { padding: [28, 28] }
        );
    } else if (fromCoords) {
        detailMap.setView([fromCoords.lat, fromCoords.lng], 12);
    }

    detailMap.invalidateSize();
}

// ===== My Rides =====
function renderMyRides() {
    const rides    = DB.get(K.RIDES);
    const bookings = DB.get(K.BOOKINGS);
    const users    = DB.get(K.USERS);

    // Posted rides
    const myPosted = rides.filter(r => r.driverId === currentUser?.id);
    const postedEl = document.getElementById('my-posted-rides');

    if (myPosted.length === 0) {
        postedEl.innerHTML = `<div class="empty-state"><i class="fas fa-road"></i><p>还没有发布行程</p><span>点击"+"发布你的第一个行程</span></div>`;
    } else {
        postedEl.innerHTML = myPosted
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(ride => {
                const seats      = availableSeats(ride);
                const pending    = bookings.filter(b => b.rideId === ride.id && b.status === 'pending').length;
                const priceStr   = ride.price > 0 ? `¥${ride.price}/人` : '免费';
                const pendingBadge = pending > 0
                    ? `<span class="pending-badge"><i class="fas fa-bell"></i>${pending} 个申请</span>`
                    : '';
                return `
                <div class="ride-card${ride.cancelled ? ' cancelled' : ''}" data-id="${ride.id}">
                    <div class="ride-route">
                        <span class="city-name-large">${ride.from}</span>
                        <div class="route-arrow-area">
                            <div class="route-line-h"></div>
                            <i class="fas fa-chevron-right" style="color:var(--secondary);font-size:13px"></i>
                        </div>
                        <span class="city-name-large">${ride.to}</span>
                    </div>
                    <div class="ride-meta">
                        <span><i class="fas fa-calendar-alt"></i>${fmtDate(ride.date)}</span>
                        <span><i class="fas fa-clock"></i>${fmtTime(ride.time)}</span>
                        <span><i class="fas fa-chair"></i>${seats}/${ride.seats} 座</span>
                    </div>
                    <div class="ride-footer">
                        ${pendingBadge || `<span style="font-size:13px;color:var(--text-muted)">${priceStr}</span>`}
                        ${ride.cancelled
                            ? '<span class="badge badge-danger">已取消</span>'
                            : `<button class="cancel-ride-btn" data-cancel="${ride.id}">取消行程</button>`}
                    </div>
                </div>`;
            }).join('');

        postedEl.querySelectorAll('.ride-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.dataset.cancel || e.target.closest('[data-cancel]')) return;
                openRideDetail(card.dataset.id);
            });
        });

        postedEl.querySelectorAll('[data-cancel]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                cancelRide(btn.dataset.cancel);
            });
        });
    }

    // Booked rides
    const myBookings = bookings.filter(b => b.passengerId === currentUser?.id);
    const bookedEl   = document.getElementById('my-booked-rides');

    if (myBookings.length === 0) {
        bookedEl.innerHTML = `<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>还没有预约记录</p><span>去找一个顺风车吧</span></div>`;
    } else {
        bookedEl.innerHTML = myBookings
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(booking => {
                const ride   = rides.find(r => r.id === booking.rideId);
                if (!ride) return '';
                const driver = users.find(u => u.id === ride.driverId);
                const name   = driver?.username || '未知';
                const statusMap = {
                    pending:  ['等待确认', 'badge-warning'],
                    accepted: ['已确认',   'badge-success'],
                    rejected: ['已拒绝',   'badge-danger'],
                };
                const [label, cls] = statusMap[booking.status] || ['未知', 'badge-muted'];
                return `
                <div class="ride-card" data-id="${ride.id}">
                    <div class="ride-route">
                        <span class="city-name-large">${ride.from}</span>
                        <div class="route-arrow-area">
                            <div class="route-line-h"></div>
                            <i class="fas fa-chevron-right" style="color:var(--secondary);font-size:13px"></i>
                        </div>
                        <span class="city-name-large">${ride.to}</span>
                    </div>
                    <div class="ride-meta">
                        <span><i class="fas fa-calendar-alt"></i>${fmtDate(ride.date)}</span>
                        <span><i class="fas fa-clock"></i>${fmtTime(ride.time)}</span>
                    </div>
                    <div class="ride-footer">
                        <div class="driver-info">
                            <div class="avatar">${initial(name)}</div>
                            <span>${name}</span>
                        </div>
                        <span class="badge ${cls}">${label}</span>
                    </div>
                </div>`;
            }).join('');

        bookedEl.querySelectorAll('.ride-card').forEach(card => {
            card.addEventListener('click', () => openRideDetail(card.dataset.id));
        });
    }
}

function cancelRide(rideId) {
    const rides = DB.get(K.RIDES);
    const ride  = rides.find(r => r.id === rideId);
    if (!ride) return;
    ride.cancelled = true;
    DB.set(K.RIDES, rides);
    showToast('行程已取消');
    renderMyRides();
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isPosted = tab.dataset.tab === 'posted';
        document.getElementById('my-posted-rides').style.display = isPosted ? '' : 'none';
        document.getElementById('my-booked-rides').style.display = isPosted ? 'none' : '';
    });
});

// ===== Profile =====
function renderProfile() {
    if (!currentUser) return;
    document.getElementById('profile-avatar').textContent = initial(currentUser.username);
    document.getElementById('profile-name').textContent   = currentUser.username;
    document.getElementById('profile-phone').textContent  = currentUser.phone || '';

    const rides    = DB.get(K.RIDES);
    const bookings = DB.get(K.BOOKINGS);

    const posted    = rides.filter(r => r.driverId === currentUser.id && !r.cancelled).length;
    const booked    = bookings.filter(b => b.passengerId === currentUser.id).length;
    const completed = bookings.filter(b => b.passengerId === currentUser.id && b.status === 'accepted').length;

    document.getElementById('stat-posted').textContent    = posted;
    document.getElementById('stat-booked').textContent    = booked;
    document.getElementById('stat-completed').textContent = completed;
}

// Logout (last menu item)
document.querySelectorAll('.menu-item').forEach((item, i) => {
    if (i === 3) { // Logout
        item.addEventListener('click', () => {
            currentUser = null;
            DB.setObj(K.USER, null);
            showScreen('auth');
            showToast('已退出登录');
        });
    }
});

// ===== Demo Data =====
function seedDemoData() {
    const users = DB.get(K.USERS);
    if (users.length > 0) return; // already seeded

    const demoId = uid();
    users.push({ id: demoId, username: 'demo', phone: '0912345678', password: 'demo123' });
    DB.set(K.USERS, users);

    const d0 = todayStr();
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const d2 = new Date(); d2.setDate(d2.getDate() + 2);
    const d3 = new Date(); d3.setDate(d3.getDate() + 3);
    const fmt = d => d.toISOString().split('T')[0];

    const rides = [
        { id: uid(), driverId: demoId, from: '台北', to: '台中', date: fmt(d1), time: '08:00', seats: 3, price: 200, note: '准时出发，高速路走，约2小时', passengers: [], cancelled: false, createdAt: Date.now() - 300000 },
        { id: uid(), driverId: demoId, from: '新竹', to: '高雄', date: fmt(d1), time: '09:30', seats: 2, price: 350, note: '走高速，可放行李', passengers: [], cancelled: false, createdAt: Date.now() - 200000 },
        { id: uid(), driverId: demoId, from: '台北', to: '花莲', date: fmt(d2), time: '07:00', seats: 4, price: 0,   note: '免费共乘，一起去赏景！', passengers: [], cancelled: false, createdAt: Date.now() - 100000 },
        { id: uid(), driverId: demoId, from: '台南', to: '台北', date: fmt(d3), time: '14:00', seats: 3, price: 300, note: '午后出发，预计傍晚到', passengers: [], cancelled: false, createdAt: Date.now() },
    ];
    DB.set(K.RIDES, rides);
}

// ===== Init =====
function init() {
    // Set default date min for post
    document.getElementById('post-date').min = todayStr();

    seedDemoData();

    if (currentUser) {
        showScreen('home');
        document.getElementById('greeting-text').textContent = `你好，${currentUser.username} 👋`;
    } else {
        showScreen('auth');
    }
}

init();
