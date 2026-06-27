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

// ===== Malaysia Route Data =====
// Key: "city1|city2" (alphabetical order), value: { km, min, max } per seat
const MY_ROUTES = {
    'ipoh|kuala lumpur':       { km: 205,  min: 25, max: 35 },
    'ipoh|penang':             { km: 170,  min: 20, max: 28 },
    'ipoh|johor bahru':        { km: 510,  min: 55, max: 75 },
    'ipoh|melaka':             { km: 310,  min: 35, max: 48 },
    'johor bahru|kuala lumpur':{ km: 340,  min: 38, max: 55 },
    'johor bahru|melaka':      { km: 215,  min: 25, max: 35 },
    'johor bahru|penang':      { km: 700,  min: 75, max: 100 },
    'johor bahru|kuantan':     { km: 390,  min: 42, max: 60 },
    'kuala lumpur|melaka':     { km: 148,  min: 18, max: 28 },
    'kuala lumpur|penang':     { km: 370,  min: 42, max: 60 },
    'kuala lumpur|kuantan':    { km: 255,  min: 30, max: 42 },
    'kuala lumpur|kota bharu': { km: 470,  min: 50, max: 70 },
    'kuala lumpur|seremban':   { km: 68,   min: 10, max: 15 },
    'kuala lumpur|taiping':    { km: 290,  min: 32, max: 45 },
    'kuala lumpur|alor setar': { km: 460,  min: 50, max: 68 },
    'melaka|penang':           { km: 490,  min: 52, max: 70 },
    'penang|kota bharu':       { km: 340,  min: 38, max: 55 },
};

// City aliases for fuzzy matching
const CITY_ALIASES = {
    'kl': 'kuala lumpur',
    'jb': 'johor bahru',
    'pg': 'penang',
    'georgetown': 'penang',
    'butterworth': 'penang',
    'malacca': 'melaka',
    'kb': 'kota bharu',
    'kkb': 'kuala kubu bharu',
    'pj': 'petaling jaya',
    'sa': 'shah alam',
};

function normalizeCity(name) {
    const lower = name.trim().toLowerCase();
    return CITY_ALIASES[lower] || lower;
}

function getRouteSuggestion(from, to) {
    const a = normalizeCity(from);
    const b = normalizeCity(to);
    const key1 = [a, b].sort().join('|');
    if (MY_ROUTES[key1]) return MY_ROUTES[key1];
    // Partial match
    for (const [k, v] of Object.entries(MY_ROUTES)) {
        const [c1, c2] = k.split('|');
        if ((a.includes(c1) || c1.includes(a)) && (b.includes(c2) || c2.includes(b))) return v;
        if ((a.includes(c2) || c2.includes(a)) && (b.includes(c1) || c1.includes(b))) return v;
    }
    // Generic estimate: RM0.14/km per seat
    return null;
}

// ===== State =====
let currentUser   = DB.getObj(K.USER);
let detailMap     = null;
let currentRideId = null;
let activeSearch  = null;

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
    const d    = new Date(str + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

function fmtTime(str) { return str || ''; }

function initial(name) {
    return name ? name[0].toUpperCase() : '?';
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function fmtPrice(price) {
    return price > 0 ? `RM ${price.toFixed(0)}` : 'Free';
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
    if (!username || !password) return showToast('Please fill in all fields');

    const user = DB.get(K.USERS).find(u => u.username === username && u.password === password);
    if (!user) return showToast('Wrong username or password');

    currentUser = user;
    DB.setObj(K.USER, user);
    document.getElementById('greeting-text').textContent = `你好，${user.username} 👋`;
    showScreen('home');
    showToast(`Welcome back, ${user.username}!`);
});

document.getElementById('btn-register').addEventListener('click', () => {
    const username = document.getElementById('reg-username').value.trim();
    const phone    = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;

    if (!username || !phone || !password) return showToast('Please fill in all fields');
    if (password !== confirm)             return showToast('Passwords do not match');
    if (password.length < 6)             return showToast('Password must be at least 6 characters');

    const users = DB.get(K.USERS);
    if (users.find(u => u.username === username)) return showToast('Username already taken');

    const user = { id: uid(), username, phone, password };
    users.push(user);
    DB.set(K.USERS, users);
    currentUser = user;
    DB.setObj(K.USER, user);
    document.getElementById('greeting-text').textContent = `你好，${user.username} 👋`;
    showScreen('home');
    showToast('Account created! Welcome 🎉');
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
            return new Date(`${r.date}T${r.time}`) >= now;
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
    const driverName = driver?.username || 'Unknown';
    const seats      = availableSeats(ride);
    const priceHTML  = ride.price > 0
        ? `<span class="price-tag">RM ${ride.price}<span class="unit">/seat</span></span>`
        : `<span class="free-tag">Free</span>`;

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
            <span><i class="fas fa-chair"></i>${seats} seat${seats !== 1 ? 's' : ''} left</span>
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
    const rides = activeSearch !== null
        ? activeSearch
        : getPublicRides().filter(r => availableSeats(r) > 0);

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

// Popular route chips
document.querySelectorAll('.route-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const from = chip.dataset.from;
        const to   = chip.dataset.to;

        document.getElementById('search-from').value = from;
        document.getElementById('search-to').value   = to;
        document.getElementById('clear-from').style.display = '';
        document.getElementById('clear-to').style.display   = '';

        // Auto search
        let rides = getPublicRides().filter(r => availableSeats(r) > 0);
        rides = rides.filter(r =>
            r.from.toLowerCase().includes(from.toLowerCase()) &&
            r.to.toLowerCase().includes(to.toLowerCase())
        );
        activeSearch = rides;
        document.getElementById('btn-clear-search').style.display = '';
        renderHomeRides();
        showToast(rides.length > 0 ? `${rides.length} ride(s) found` : 'No rides for this route yet');
    });
});

// Search inputs
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
    [searchFromEl.value, searchToEl.value] = [searchToEl.value, searchFromEl.value];
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
    document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
    renderHomeRides();
    showToast(rides.length > 0 ? `${rides.length} ride(s) found` : 'No rides found');
});

document.getElementById('btn-clear-search').addEventListener('click', () => {
    activeSearch = null;
    searchFromEl.value = '';
    searchToEl.value   = '';
    document.getElementById('search-date').value = '';
    document.getElementById('clear-from').style.display = 'none';
    document.getElementById('clear-to').style.display   = 'none';
    document.getElementById('btn-clear-search').style.display = 'none';
    document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
    renderHomeRides();
});

// ===== Post Ride — Price Suggestion =====
function updatePriceSuggestion() {
    const from = document.getElementById('post-from').value.trim();
    const to   = document.getElementById('post-to').value.trim();
    const box  = document.getElementById('price-suggestion');
    const txt  = document.getElementById('price-suggestion-text');

    if (!from || !to) { box.style.display = 'none'; return; }

    const route = getRouteSuggestion(from, to);
    if (route) {
        txt.textContent = `建议价格：RM ${route.min}–${route.max} / 人（约 ${route.km} km）`;
        box.style.display = '';
        // Auto-fill price if empty
        const priceEl = document.getElementById('post-price');
        if (!priceEl.value) {
            priceEl.value = Math.round((route.min + route.max) / 2);
        }
    } else {
        box.style.display = 'none';
    }
}

document.getElementById('post-from').addEventListener('change', updatePriceSuggestion);
document.getElementById('post-to').addEventListener('change', updatePriceSuggestion);

document.getElementById('btn-post').addEventListener('click', () => {
    if (!currentUser) return showScreen('auth');

    const from  = document.getElementById('post-from').value.trim();
    const to    = document.getElementById('post-to').value.trim();
    const date  = document.getElementById('post-date').value;
    const time  = document.getElementById('post-time').value;
    const seats = parseInt(document.getElementById('post-seats').value);
    const price = parseFloat(document.getElementById('post-price').value) || 0;
    const note  = document.getElementById('post-note').value.trim();

    if (!from || !to)   return showToast('Please enter pickup and destination');
    if (!date || !time) return showToast('Please select date and time');
    if (new Date(`${date}T${time}`) < new Date()) return showToast('Departure time cannot be in the past');

    const ride = {
        id: uid(), driverId: currentUser.id,
        from, to, date, time, seats, price, note,
        passengers: [], cancelled: false, createdAt: Date.now(),
    };

    const rides = DB.get(K.RIDES);
    rides.push(ride);
    DB.set(K.RIDES, rides);

    ['post-from','post-to','post-date','post-time','post-price','post-note']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('price-suggestion').style.display = 'none';

    activeSearch = null;
    showToast('Ride posted successfully! 🚗');
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
    const driverName = driver?.username || 'Unknown';
    const bookings   = DB.get(K.BOOKINGS);
    const seats      = availableSeats(ride);
    const isDriver   = currentUser && ride.driverId === currentUser.id;

    document.getElementById('detail-from').textContent     = ride.from;
    document.getElementById('detail-to').textContent       = ride.to;
    document.getElementById('detail-datetime').textContent = `${fmtDate(ride.date)} · ${fmtTime(ride.time)}`;
    document.getElementById('detail-driver').textContent   = driverName;
    document.getElementById('detail-seats').textContent    = `${seats} seat${seats !== 1 ? 's' : ''} available / ${ride.seats} total`;
    document.getElementById('detail-price').textContent    = ride.price > 0 ? `RM ${ride.price} / seat` : 'Free';

    const noteCard = document.getElementById('detail-note-card');
    if (ride.note) {
        document.getElementById('detail-note').textContent = ride.note;
        noteCard.style.display = '';
    } else {
        noteCard.style.display = 'none';
    }

    // Book button
    const bookBtn = document.getElementById('btn-book-ride');
    bookBtn.disabled    = false;
    bookBtn.style.cssText = '';
    bookBtn.textContent = 'Request to Join';

    if (isDriver) {
        bookBtn.textContent = 'This is your ride';
        bookBtn.disabled    = true;

        const rideBookings = bookings.filter(b => b.rideId === rideId);
        const passSection  = document.getElementById('passengers-section');
        if (rideBookings.length > 0) {
            passSection.style.display = '';
            document.getElementById('passengers-list').innerHTML = rideBookings.map(b => {
                const p    = users.find(u => u.id === b.passengerId);
                const name = p?.username || 'Unknown';
                return `
                <div class="booking-request">
                    <div class="driver-info">
                        <div class="avatar">${initial(name)}</div>
                        <div>
                            <div style="font-weight:600;font-size:14px">${name}</div>
                            ${p?.phone ? `<div style="font-size:12px;color:var(--text-muted)">${p.phone}</div>` : ''}
                        </div>
                    </div>
                    <div class="booking-actions">
                        ${b.status === 'pending'
                            ? `<button class="btn-sm btn-accept" data-bid="${b.id}">Accept</button>
                               <button class="btn-sm btn-reject" data-bid="${b.id}">Reject</button>`
                            : `<span class="badge ${b.status === 'accepted' ? 'badge-success' : 'badge-danger'}">
                                ${b.status === 'accepted' ? 'Accepted' : 'Rejected'}
                               </span>`}
                    </div>
                </div>`;
            }).join('');

            document.querySelectorAll('[data-bid]').forEach(btn => {
                btn.addEventListener('click', () => {
                    respondBooking(btn.dataset.bid, btn.classList.contains('btn-accept') ? 'accepted' : 'rejected');
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
                pending:  ['Request sent – awaiting driver', '#7C3AED'],
                accepted: ['Confirmed! See you on board ✓',  '#059669'],
                rejected: ['Request declined',               '#DC2626'],
            };
            const [label, color] = map[myBooking.status] || ['Requested', '#888'];
            bookBtn.textContent       = label;
            bookBtn.disabled          = true;
            bookBtn.style.background  = color;
        } else if (seats <= 0) {
            bookBtn.textContent      = 'Fully booked';
            bookBtn.disabled         = true;
            bookBtn.style.background = '#B0BAD4';
        }
    }

    document.getElementById('modal-ride-detail').classList.add('active');
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
    showToast(status === 'accepted' ? 'Passenger accepted ✓' : 'Request declined');
}

document.getElementById('btn-book-ride').addEventListener('click', () => {
    if (!currentUser) return showScreen('auth');
    if (!currentRideId) return;

    const bookings = DB.get(K.BOOKINGS);
    if (bookings.find(b => b.rideId === currentRideId && b.passengerId === currentUser.id)) {
        return showToast('You have already requested this ride');
    }

    bookings.push({
        id: uid(), rideId: currentRideId,
        passengerId: currentUser.id, status: 'pending',
        createdAt: Date.now(),
    });
    DB.set(K.BOOKINGS, bookings);
    showToast('Request sent! Waiting for driver to confirm 🙏');
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
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Malaysia')}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'CarpoolMY/1.0' } }
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

    // Malaysia center
    detailMap = L.map(container, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(detailMap);
    detailMap.setView([4.2, 109.0], 6);

    const [fromCoords, toCoords] = await Promise.all([geocode(ride.from), geocode(ride.to)]);

    if (fromCoords) {
        L.marker([fromCoords.lat, fromCoords.lng], { icon: makeMarkerIcon('#4F6CF7') })
            .addTo(detailMap).bindPopup(`<b>From:</b> ${ride.from}`);
    }
    if (toCoords) {
        L.marker([toCoords.lat, toCoords.lng], { icon: makeMarkerIcon('#F97316') })
            .addTo(detailMap).bindPopup(`<b>To:</b> ${ride.to}`);
    }
    if (fromCoords && toCoords) {
        L.polyline(
            [[fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]],
            { color: '#4F6CF7', weight: 3, opacity: 0.7, dashArray: '8 8' }
        ).addTo(detailMap);
        detailMap.fitBounds(
            L.latLngBounds([fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]),
            { padding: [28, 28] }
        );
    } else if (fromCoords) {
        detailMap.setView([fromCoords.lat, fromCoords.lng], 10);
    }

    detailMap.invalidateSize();
}

// ===== My Rides =====
function renderMyRides() {
    const rides    = DB.get(K.RIDES);
    const bookings = DB.get(K.BOOKINGS);
    const users    = DB.get(K.USERS);

    // Posted
    const myPosted = rides.filter(r => r.driverId === currentUser?.id)
                          .sort((a, b) => b.createdAt - a.createdAt);
    const postedEl = document.getElementById('my-posted-rides');

    if (myPosted.length === 0) {
        postedEl.innerHTML = `<div class="empty-state"><i class="fas fa-road"></i><p>No rides posted yet</p><span>Tap "+" to post your first ride</span></div>`;
    } else {
        postedEl.innerHTML = myPosted.map(ride => {
            const seats   = availableSeats(ride);
            const pending = bookings.filter(b => b.rideId === ride.id && b.status === 'pending').length;
            const pendingBadge = pending > 0
                ? `<span class="pending-badge"><i class="fas fa-bell"></i>${pending} request${pending > 1 ? 's' : ''}</span>` : '';
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
                    <span><i class="fas fa-chair"></i>${seats}/${ride.seats} seats</span>
                    ${ride.price > 0 ? `<span><i class="fas fa-tag"></i>RM ${ride.price}/seat</span>` : '<span><i class="fas fa-gift"></i>Free</span>'}
                </div>
                <div class="ride-footer">
                    ${pendingBadge || '<span></span>'}
                    ${ride.cancelled
                        ? '<span class="badge badge-danger">Cancelled</span>'
                        : `<button class="cancel-ride-btn" data-cancel="${ride.id}">Cancel ride</button>`}
                </div>
            </div>`;
        }).join('');

        postedEl.querySelectorAll('.ride-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-cancel]')) return;
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

    // Booked
    const myBookings = bookings.filter(b => b.passengerId === currentUser?.id)
                               .sort((a, b) => b.createdAt - a.createdAt);
    const bookedEl   = document.getElementById('my-booked-rides');

    if (myBookings.length === 0) {
        bookedEl.innerHTML = `<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>No bookings yet</p><span>Search for a ride to get started</span></div>`;
    } else {
        bookedEl.innerHTML = myBookings.map(booking => {
            const ride   = rides.find(r => r.id === booking.rideId);
            if (!ride) return '';
            const driver = users.find(u => u.id === ride.driverId);
            const name   = driver?.username || 'Unknown';
            const statusMap = {
                pending:  ['Pending',   'badge-warning'],
                accepted: ['Confirmed', 'badge-success'],
                rejected: ['Declined',  'badge-danger'],
            };
            const [label, cls] = statusMap[booking.status] || ['Unknown', 'badge-muted'];
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
                    ${ride.price > 0 ? `<span><i class="fas fa-tag"></i>RM ${ride.price}/seat</span>` : '<span><i class="fas fa-gift"></i>Free</span>'}
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
    showToast('Ride cancelled');
    renderMyRides();
}

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

    document.getElementById('stat-posted').textContent    = rides.filter(r => r.driverId === currentUser.id && !r.cancelled).length;
    document.getElementById('stat-booked').textContent    = bookings.filter(b => b.passengerId === currentUser.id).length;
    document.getElementById('stat-completed').textContent = bookings.filter(b => b.passengerId === currentUser.id && b.status === 'accepted').length;
}

document.querySelectorAll('.menu-item').forEach((item, i) => {
    if (i === 3) {
        item.addEventListener('click', () => {
            currentUser = null;
            DB.setObj(K.USER, null);
            showScreen('auth');
        });
    }
});

// ===== Demo Data (Malaysia) =====
function seedDemoData() {
    const users = DB.get(K.USERS);
    if (users.length > 0) return;

    const demoId = uid();
    const d2Id   = uid();
    users.push(
        { id: demoId, username: 'demo',    phone: '012-345 6789', password: 'demo123' },
        { id: d2Id,   username: 'Ahmad',   phone: '011-234 5678', password: 'demo123' },
    );
    DB.set(K.USERS, users);

    const addDays = (n) => {
        const d = new Date(); d.setDate(d.getDate() + n);
        return d.toISOString().split('T')[0];
    };

    DB.set(K.RIDES, [
        { id: uid(), driverId: demoId, from: 'Kuala Lumpur', to: 'Penang',       date: addDays(1), time: '07:30', seats: 3, price: 50, note: 'Meeting point: TBS, Bandar Tasik Selatan. WhatsApp me to confirm.', passengers: [], cancelled: false, createdAt: Date.now() - 500000 },
        { id: uid(), driverId: d2Id,   from: 'Kuala Lumpur', to: 'Johor Bahru',  date: addDays(1), time: '09:00', seats: 2, price: 45, note: 'Depart from Sunway area. Highway toll included in price.', passengers: [], cancelled: false, createdAt: Date.now() - 400000 },
        { id: uid(), driverId: demoId, from: 'Kuala Lumpur', to: 'Ipoh',         date: addDays(2), time: '08:00', seats: 4, price: 30, note: 'North Plus highway. 2-hour drive. Can stop at Tapah R&R.', passengers: [], cancelled: false, createdAt: Date.now() - 300000 },
        { id: uid(), driverId: d2Id,   from: 'Penang',       to: 'Kuala Lumpur', date: addDays(2), time: '14:00', seats: 3, price: 50, note: 'Return trip from Penang. Pickup at Komtar area.', passengers: [], cancelled: false, createdAt: Date.now() - 200000 },
        { id: uid(), driverId: demoId, from: 'Kuala Lumpur', to: 'Melaka',       date: addDays(3), time: '10:00', seats: 4, price: 0,  note: 'Free ride, just sharing fuel cost vibes 🙂 Contact via WhatsApp.', passengers: [], cancelled: false, createdAt: Date.now() - 100000 },
        { id: uid(), driverId: d2Id,   from: 'Ipoh',         to: 'Penang',       date: addDays(3), time: '11:30', seats: 2, price: 25, note: 'Around 1.5 hours drive. Comfortable SUV.', passengers: [], cancelled: false, createdAt: Date.now() },
    ]);
}

// ===== Init =====
function init() {
    document.getElementById('post-date').min = todayStr();
    seedDemoData();

    if (currentUser) {
        document.getElementById('greeting-text').textContent = `你好，${currentUser.username} 👋`;
        showScreen('home');
    } else {
        showScreen('auth');
    }
}

init();
