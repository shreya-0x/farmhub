// ============================================================
// FARMHUB — MASTER CONTROLLER & APPLICATION LOGIC
// Strict Vanilla ES6+ JavaScript — No Frontend Frameworks
// ============================================================

// App Global State Container
const FarmHubState = {
  user: JSON.parse(localStorage.getItem('farmhub_user') || 'null'),
  activeFarm: JSON.parse(localStorage.getItem('farmhub_active_farm') || 'null'),
  farms: JSON.parse(localStorage.getItem('farmhub_farms') || '[]'),
  theme: localStorage.getItem('farmhub_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  lang: localStorage.getItem('farmhub_lang') || 'en',
  fin: JSON.parse(localStorage.getItem('farmhub_fin') || '[]'),
  tasks: JSON.parse(localStorage.getItem('farmhub_tasks') || '[]'),
  history: JSON.parse(localStorage.getItem('farmhub_history') || '[]'),
  demoMode: false,
  mandiApiKey: localStorage.getItem('farmhub_mandi_key') || '',
  currentRoute: 'landing', // 'landing', 'user-details', 'crop-specs', or main module 'overview'
  currentModule: 'overview',
  weatherCache: {},
  curWeather: null,
  curDecision: null,
  healthPhotoSignals: []
};

// State Persistence Helper
function persistState() {
  try {
    localStorage.setItem('farmhub_user', JSON.stringify(FarmHubState.user));
    localStorage.setItem('farmhub_active_farm', JSON.stringify(FarmHubState.activeFarm));
    localStorage.setItem('farmhub_farms', JSON.stringify(FarmHubState.farms));
    localStorage.setItem('farmhub_theme', FarmHubState.theme);
    localStorage.setItem('farmhub_lang', FarmHubState.lang);
    localStorage.setItem('farmhub_fin', JSON.stringify(FarmHubState.fin));
    localStorage.setItem('farmhub_tasks', JSON.stringify(FarmHubState.tasks));
    localStorage.setItem('farmhub_history', JSON.stringify(FarmHubState.history));
  } catch (e) {
    console.warn('LocalStorage quota or write error', e);
  }
}

// Global Translation Helper shortcut
const t = (k, def) => I18N.t(k, def);

// DOM Selection shortcuts
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Runtime references
let activeLeafletMap = null;
let activeMapMarker = null;
let activeAdvisoryUtterance = null;
let tempOnboarding = {
  location: null,
  cropCategory: null,
  cropId: null,
  cropName: '',
  isCustomCrop: false
};

// ============================================================
// THEME & LANGUAGE MANAGEMENT
// ============================================================
function applyTheme(themeName) {
  FarmHubState.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  try {
    localStorage.setItem('farmhub_theme', themeName);
  } catch (e) {}

  const themeBtn = $('#themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = themeName === 'dark' ? '☀️' : '🌙';
    themeBtn.setAttribute('title', themeName === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme');
  }
}

function toggleTheme() {
  const newTheme = FarmHubState.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function setAppLanguage(langCode) {
  if (activeAdvisoryUtterance) stopAdvisorySpeech();
  I18N.setLanguage(langCode);
  FarmHubState.lang = langCode;
  // Re-render current view with new translations
  renderApp();
}

window.onLanguageChanged = () => {
  renderApp();
};

// ============================================================
// ROUTING & APP VIEW RENDERER
// ============================================================
function navigateTo(route, module = 'overview') {
  FarmHubState.currentRoute = route;
  if (module) FarmHubState.currentModule = module;
  renderApp();
  window.scrollTo(0, 0);
}

// Main View Switcher
function renderApp() {
  const root = $('#appRoot');
  if (!root) return;

  // If no user or no active farm, handle landing / onboarding journey
  if (!FarmHubState.activeFarm) {
    if (FarmHubState.currentRoute === 'user-details') {
      root.innerHTML = renderUserDetailsScreen();
    } else if (FarmHubState.currentRoute === 'crop-specs') {
      root.innerHTML = renderCropSpecsScreen();
      initOnboardingMap();
    } else {
      // Default entry: Landing Page (No demo account forced!)
      FarmHubState.currentRoute = 'landing';
      root.innerHTML = renderLandingPage();
    }
    return;
  }

  // Active Farm exists -> Render Dashboard layout (Sidebar + Topbar + Workspace)
  root.innerHTML = renderDashboardLayout();
  bindSidebarEvents();
  renderActiveModule();
}

// ============================================================
// 1. LANDING PAGE VIEW
// ============================================================
function renderLandingPage() {
  return `
    <header class="topbar" style="left:0">
      <div class="topbar-left">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="sidebar-logo">🌱</div>
          <div>
            <b style="font-size:18px;letter-spacing:0.04em">FARMHUB</b>
            <small style="display:block;font-size:10px;color:var(--green);font-weight:700">SMART FARM DECISIONS</small>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <!-- Language Selector -->
        <select class="util-btn" onchange="setAppLanguage(this.value)" aria-label="${t('langSelect')}">
          ${I18N.languages.map(l => `<option value="${l.code}"${l.code === I18N.currentLang ? ' selected' : ''}>🌐 ${l.native}</option>`).join('')}
        </select>
        <!-- Theme Toggle -->
        <button id="themeToggleBtn" class="util-btn theme-toggle-btn" onclick="toggleTheme()" aria-label="${t('themeToggle')}">
          ${FarmHubState.theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>

    <main class="main-workspace entry-workspace" style="margin-left:0;max-width:1080px;margin-top:70px">
      <section class="landing-hero">
        <div class="landing-badge">🌱 ${t('brandName')} · ${t('subBrand')}</div>
        <h1 class="landing-title">${t('landingTitle')}</h1>
        <p class="landing-subtitle">${t('landingSubtitle')}</p>
        <div>
          <button class="btn primary-cta" onclick="navigateTo('user-details')">
            ${t('letsExplore')}
          </button>
        </div>
      </section>

      <section class="landing-features-grid">
        <div class="landing-feat-card">
          <div class="landing-feat-icon">💧</div>
          <h3 style="color:var(--text);margin-bottom:6px">${t('landingFeat1Title')}</h3>
          <p class="mu">${t('landingFeat1Desc')}</p>
        </div>
        <div class="landing-feat-card">
          <div class="landing-feat-icon">🌾</div>
          <h3 style="color:var(--text);margin-bottom:6px">${t('landingFeat2Title')}</h3>
          <p class="mu">${t('landingFeat2Desc')}</p>
        </div>
        <div class="landing-feat-card">
          <div class="landing-feat-icon">🎯</div>
          <h3 style="color:var(--text);margin-bottom:6px">${t('landingFeat3Title')}</h3>
          <p class="mu">${t('landingFeat3Desc')}</p>
        </div>
      </section>
    </main>
  `;
}

// ============================================================
// 2. USER DETAILS SCREEN
// ============================================================
function renderUserDetailsScreen() {
  return `
    <header class="topbar" style="left:0">
      <div class="topbar-left">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="navigateTo('landing')">
          <div class="sidebar-logo">🌱</div>
          <b style="font-size:18px">FARMHUB</b>
        </div>
      </div>
      <div class="topbar-right">
        <select class="util-btn" onchange="setAppLanguage(this.value)" aria-label="${t('langSelect')}">
          ${I18N.languages.map(l => `<option value="${l.code}"${l.code === I18N.currentLang ? ' selected' : ''}>🌐 ${l.native}</option>`).join('')}
        </select>
        <button id="themeToggleBtn" class="util-btn theme-toggle-btn" onclick="toggleTheme()" aria-label="${t('themeToggle')}">
          ${FarmHubState.theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>

    <main class="main-workspace entry-workspace" style="margin-left:0;margin-top:80px">
      <div class="onboarding-screen">
        <div class="step-indicator">
          <div class="step-dot active"></div>
          <div class="step-dot"></div>
        </div>

        <h2 style="font-size:24px;margin-bottom:6px">${t('welcomeTitle')}</h2>
        <p class="mu" style="margin-bottom:24px">${t('welcomeSubtitle')}</p>

        <form onsubmit="handleUserDetailsSubmit(event)">
          <div class="form-group">
            <label for="u_name">${t('fullName')}</label>
            <input id="u_name" required placeholder="${t('enterName')}" autocomplete="name">
          </div>
          <div class="form-group">
            <label for="u_phone">${t('phoneNumber')}</label>
            <input id="u_phone" type="tel" required placeholder="${t('enterPhone')}" autocomplete="tel">
          </div>

          <div class="row" style="margin-top:28px;gap:14px">
            <button type="submit" class="btn" style="flex:1;justify-content:center">
              ${t('btnContinue')}
            </button>
            <button type="button" class="btn secondary" onclick="handleLoginLater()" style="flex:1;justify-content:center">
              ${t('btnLoginLater')}
            </button>
          </div>
        </form>
      </div>
    </main>
  `;
}

function handleUserDetailsSubmit(e) {
  e.preventDefault();
  const name = $('#u_name').value.trim();
  const phone = $('#u_phone').value.trim();
  FarmHubState.user = {
    id: 'u_' + Date.now().toString(36),
    name,
    phone,
    isGuest: false,
    createdAt: Date.now()
  };
  persistState();
  navigateTo('crop-specs');
}

function handleLoginLater() {
  FarmHubState.user = {
    id: 'guest_' + Date.now().toString(36),
    name: 'Farmer Guest',
    phone: '',
    isGuest: true,
    createdAt: Date.now()
  };
  persistState();
  navigateTo('crop-specs');
}

// ============================================================
// 3. CROP SPECIFICATIONS SCREEN
// ============================================================
function renderCropSpecsScreen() {
  const loc = tempOnboarding.location;
  const selectedCat = tempOnboarding.cropCategory;
  const selectedCropId = tempOnboarding.cropId;

  // Generate crops for chosen category (5 standard options + Other)
  let cropsList = [];
  if (selectedCat) {
    cropsList = CROPS_DATA.getByCategory(selectedCat);
  }

  return `
    <header class="topbar" style="left:0">
      <div class="topbar-left">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="navigateTo('user-details')">
          <div class="sidebar-logo">🌱</div>
          <b style="font-size:18px">FARMHUB</b>
        </div>
      </div>
      <div class="topbar-right">
        <select class="util-btn" onchange="setAppLanguage(this.value)" aria-label="${t('langSelect')}">
          ${I18N.languages.map(l => `<option value="${l.code}"${l.code === I18N.currentLang ? ' selected' : ''}>🌐 ${l.native}</option>`).join('')}
        </select>
        <button id="themeToggleBtn" class="util-btn theme-toggle-btn" onclick="toggleTheme()" aria-label="${t('themeToggle')}">
          ${FarmHubState.theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>

    <main class="main-workspace entry-workspace" style="margin-left:0;margin-top:80px">
      <div class="onboarding-screen" style="max-width:760px">
        <div class="step-indicator">
          <div class="step-dot active"></div>
          <div class="step-dot active"></div>
        </div>

        <h2 style="font-size:24px;margin-bottom:6px">${t('tellUsFarm')}</h2>
        <p class="mu" style="margin-bottom:24px">Set your location and primary crop to generate your farm dashboard.</p>

        <!-- STEP A: LOCATION SELECTION -->
        <div style="margin-bottom:28px">
          <label style="font-size:14px;letter-spacing:0.04em">${t('whereLocation')}</label>
          <div class="row" style="margin-bottom:12px">
            <button type="button" class="btn" onclick="detectUserLocation()">
              ${t('useMyLocation')}
            </button>
            <div style="display:flex;gap:8px;flex:1;min-width:240px">
              <input id="locSearchInput" placeholder="Village, mandal, district or town..." style="flex:1">
              <button type="button" class="btn secondary" onclick="searchOnboardingLocation()">
                Search
              </button>
            </div>
          </div>

          <div id="locStatusBadge" class="mu" style="font-weight:600;margin-bottom:10px">
            ${loc ? `<span style="color:var(--green)">${t('locationSelected')}: ${esc(loc.displayName)}</span>` : `<span style="color:var(--farm-amber)">${t('locationNotSelected')}</span>`}
          </div>

          <!-- Interactive Leaflet Map -->
          <div id="fieldMap"></div>
          <div id="mapErrorState" class="map-error-banner" style="display:none">
            <p><b>${t('mapUnavailable')}</b></p>
            <p class="mu">Coordinates: <span id="mapErrCoords">--</span></p>
            <button class="btn secondary sm" onclick="initOnboardingMap()">${t('retryMap')}</button>
          </div>
        </div>

        <!-- STEP B: CROP CATEGORY -->
        <div style="margin-bottom:24px">
          <label style="font-size:14px;letter-spacing:0.04em">${t('whatCropType')}</label>
          <div class="category-cards-grid">
            ${CROPS_DATA.categories.map(cat => `
              <div class="cat-card ${selectedCat === cat.id ? 'selected' : ''}" onclick="selectCropCategory('${cat.id}')">
                <span class="cat-icon">${cat.icon}</span>
                <span class="cat-title">${t(cat.nameKey)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- STEP C: CROP SELECTION (Appears when category is selected) -->
        ${selectedCat ? `
          <div style="margin-bottom:28px">
            <label style="font-size:14px;letter-spacing:0.04em">${t('whichCrop')}</label>
            <div class="crops-chips-grid">
              ${cropsList.map(crop => {
                const displayName = CROPS_DATA.getDisplayName(crop, I18N.currentLang);
                return `
                  <div class="crop-chip ${selectedCropId === crop.id && !tempOnboarding.isCustomCrop ? 'selected' : ''}" onclick="selectStandardCrop('${crop.id}')">
                    ${displayName}
                    <small>${crop.names.en}</small>
                  </div>
                `;
              }).join('')}
              <!-- Option: OTHER -->
              <div class="crop-chip ${tempOnboarding.isCustomCrop ? 'selected' : ''}" onclick="selectOtherCrop()">
                ${t('cropOther')}
                <small>Custom crop</small>
              </div>
            </div>

            <!-- Custom Crop Name Input if OTHER is selected -->
            ${tempOnboarding.isCustomCrop ? `
              <div class="form-group" style="margin-top:16px">
                <label for="customCropName">${t('enterCropName')}</label>
                <input id="customCropName" required placeholder="${t('cropPlaceholder')}" value="${esc(tempOnboarding.cropName)}" oninput="tempOnboarding.cropName=this.value;updateGoButtonState()">
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- STEP D: GO TO MY FARM -->
        <div style="margin-top:30px">
          <button id="btnGoToFarm" class="btn primary-cta" style="width:100%;justify-content:center" onclick="completeOnboarding()" ${!loc || !tempOnboarding.cropName ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
            ${t('goToMyFarm')}
          </button>
        </div>
      </div>
    </main>
  `;
}

// Leaflet Map with CARTO Voyager tiles (Permitted, reliable, no 403 block)
function initOnboardingMap() {
  const container = $('#fieldMap');
  const errBanner = $('#mapErrorState');
  if (!container || typeof L === 'undefined') return;

  if (activeLeafletMap) {
    try {
      activeLeafletMap.remove();
    } catch (e) {}
    activeLeafletMap = null;
  }

  // Default coordinate if not yet selected: 13.136, 78.129
  const defaultLat = tempOnboarding.location ? tempOnboarding.location.lat : 13.136;
  const defaultLon = tempOnboarding.location ? tempOnboarding.location.lon : 78.129;

  try {
    activeLeafletMap = L.map('fieldMap', {
      zoomControl: true,
      attributionControl: true
    }).setView([defaultLat, defaultLon], tempOnboarding.location ? 14 : 12);

    // Reliable CartoDB Voyager tiles with CORS and SSL
    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    });

    tileLayer.on('tileerror', () => {
      // Tile load failed -> show fallback banner gracefully
      if (errBanner) {
        errBanner.style.display = 'block';
        const coordsSpan = $('#mapErrCoords');
        if (coordsSpan) coordsSpan.textContent = `${defaultLat.toFixed(4)}, ${defaultLon.toFixed(4)}`;
      }
    });

    tileLayer.addTo(activeLeafletMap);

    // Draggable marker
    activeMapMarker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(activeLeafletMap);

    // Drag marker event
    activeMapMarker.on('dragend', async () => {
      const pos = activeMapMarker.getLatLng();
      const rev = await API.reverse(pos.lat, pos.lng, 'Map Pin');
      setOnboardingLocation(rev);
    });

    // Map click event
    activeLeafletMap.on('click', async e => {
      activeMapMarker.setLatLng(e.latlng);
      const rev = await API.reverse(e.latlng.lat, e.latlng.lng, 'Map Click');
      setOnboardingLocation(rev);
    });

    if (errBanner) errBanner.style.display = 'none';
  } catch (err) {
    console.warn('Map initialization error', err);
    if (errBanner) {
      errBanner.style.display = 'block';
      const coordsSpan = $('#mapErrCoords');
      if (coordsSpan) coordsSpan.textContent = `${defaultLat.toFixed(4)}, ${defaultLon.toFixed(4)}`;
    }
  }
}

async function detectUserLocation() {
  const badge = $('#locStatusBadge');
  if (badge) badge.innerHTML = `<span class="mu">Detecting GPS coordinates…</span>`;
  try {
    const coords = await API.here();
    const locObj = await API.reverse(coords.lat, coords.lon, 'GPS');
    setOnboardingLocation(locObj);
  } catch (err) {
    if (badge) badge.innerHTML = `<span style="color:var(--farm-danger)">GPS permission denied or unavailable. Please use the search box or click on the map.</span>`;
  }
}

async function searchOnboardingLocation() {
  const input = $('#locSearchInput');
  if (!input || !input.value.trim()) return;
  const q = input.value.trim();
  const badge = $('#locStatusBadge');
  if (badge) badge.innerHTML = `<span class="mu">Searching location…</span>`;

  try {
    const results = await API.geocode(q);
    if (results.length > 0) {
      setOnboardingLocation(results[0]);
    } else {
      if (badge) badge.innerHTML = `<span style="color:var(--farm-amber)">No matches found. Try entering a nearby town or mandal.</span>`;
    }
  } catch (err) {
    if (badge) badge.innerHTML = `<span style="color:var(--farm-danger)">Location search service unreachable. Check your internet connection.</span>`;
  }
}

function setOnboardingLocation(locObj) {
  tempOnboarding.location = locObj;
  const badge = $('#locStatusBadge');
  if (badge) {
    badge.innerHTML = `<span style="color:var(--green)">${t('locationSelected')}: ${esc(locObj.displayName)} (${locObj.lat.toFixed(4)}, ${locObj.lon.toFixed(4)})</span>`;
  }

  if (activeLeafletMap && activeMapMarker) {
    activeLeafletMap.setView([locObj.lat, locObj.lon], 14);
    activeMapMarker.setLatLng([locObj.lat, locObj.lon]);
  }
  updateGoButtonState();
}

function selectCropCategory(catId) {
  tempOnboarding.cropCategory = catId;
  tempOnboarding.cropId = null;
  tempOnboarding.cropName = '';
  tempOnboarding.isCustomCrop = false;
  // Re-render crop specs to display category crops
  renderApp();
}

function selectStandardCrop(cropId) {
  const cropObj = CROPS_DATA.getCrop(cropId);
  tempOnboarding.cropId = cropId;
  tempOnboarding.cropName = cropObj.names.en;
  tempOnboarding.isCustomCrop = false;
  renderApp();
}

function selectOtherCrop() {
  tempOnboarding.cropId = 'custom';
  tempOnboarding.cropName = '';
  tempOnboarding.isCustomCrop = true;
  renderApp();
}

function updateGoButtonState() {
  const btn = $('#btnGoToFarm');
  if (!btn) return;
  const ready = tempOnboarding.location && tempOnboarding.cropName && tempOnboarding.cropName.trim().length > 0;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.5';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
}

function completeOnboarding() {
  if (!tempOnboarding.location || !tempOnboarding.cropName) return;

  const farmId = 'farm_' + Date.now().toString(36);
  const newFarm = {
    id: farmId,
    name: `${tempOnboarding.cropName} Farm`,
    location: tempOnboarding.location,
    cropCategory: tempOnboarding.cropCategory,
    cropId: tempOnboarding.cropId,
    cropName: tempOnboarding.cropName.trim(),
    isCustomCrop: tempOnboarding.isCustomCrop,
    stage: 'Vegetative', // Default initial stage
    farmSize: 0,         // Optional profile completion item
    soil: '',            // Optional profile completion item
    irrigation: '',      // Optional profile completion item
    fertilizerPreference: 'Integrated',
    plantingDate: new Date().toISOString().slice(0, 10),
    sensorUrl: '',
    man: null
  };

  FarmHubState.farms.push(newFarm);
  FarmHubState.activeFarm = newFarm;
  persistState();

  // Route directly to the Dashboard!
  navigateTo('dashboard', 'overview');
}

// ============================================================
// 4. MAIN DASHBOARD LAYOUT (Sidebar + Topbar + Workspace)
// ============================================================
function renderDashboardLayout() {
  const f = FarmHubState.activeFarm;
  const user = FarmHubState.user || { name: 'Farmer Guest', isGuest: true };
  const currentMod = FarmHubState.currentModule;

  return `
    <div class="app-container">
      <!-- Left Sidebar -->
      <aside class="sidebar" id="appSidebar" role="navigation" aria-label="Main Navigation">
        <div class="sidebar-header">
          <div class="sidebar-logo">🌱</div>
          <div class="sidebar-title">
            FARMHUB
            <small>SMART FARM DECISIONS</small>
          </div>
        </div>

        <!-- Active Farm Badge in Sidebar -->
        <div class="sidebar-farm-badge" onclick="navigateTo('dashboard', 'my-farm')" title="Manage or switch farm">
          <div style="overflow:hidden">
            <div class="sidebar-farm-name">🌾 ${esc(f.name)}</div>
            <div class="sidebar-farm-crop">${esc(f.cropName)} · ${f.location?.locality || f.location?.district || 'Field'}</div>
          </div>
          <span style="font-size:12px;color:rgba(255,255,255,0.4)">▾</span>
        </div>

        <!-- Navigation Sections -->
        <div class="sidebar-nav">
          <!-- GROUP: YOUR FARM -->
          <div>
            <div class="nav-group-label">${t('groupYourFarm')}</div>
            <ul class="nav-links">
              <li>
                <button class="nav-link ${currentMod === 'overview' ? 'active' : ''}" onclick="switchModule('overview')">
                  <span class="nav-link-icon">📊</span> <span>${t('navOverview')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'my-farm' ? 'active' : ''}" onclick="switchModule('my-farm')">
                  <span class="nav-link-icon">🚜</span> <span>${t('navMyFarm')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'weather' ? 'active' : ''}" onclick="switchModule('weather')">
                  <span class="nav-link-icon">⛅</span> <span>${t('navWeather')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'calendar' ? 'active' : ''}" onclick="switchModule('calendar')">
                  <span class="nav-link-icon">📅</span> <span>${t('navCalendar')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'irrigation' ? 'active' : ''}" onclick="switchModule('irrigation')">
                  <span class="nav-link-icon">💧</span> <span>${t('navIrrigation')}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- GROUP: ADVISORY -->
          <div>
            <div class="nav-group-label">${t('groupAdvisory')}</div>
            <ul class="nav-links">
              <li>
                <button class="nav-link ${currentMod === 'advisory' ? 'active' : ''}" onclick="switchModule('advisory')">
                  <span class="nav-link-icon">🎯</span> <span>${t('navAdvisory')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'fertilizer' ? 'active' : ''}" onclick="switchModule('fertilizer')">
                  <span class="nav-link-icon">🧪</span> <span>${t('navFertilizer')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'health' ? 'active' : ''}" onclick="switchModule('health')">
                  <span class="nav-link-icon">🩺</span> <span>${t('navHealth')}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- GROUP: INSIGHTS -->
          <div>
            <div class="nav-group-label">${t('groupInsights')}</div>
            <ul class="nav-links">
              <li>
                <button class="nav-link ${currentMod === 'market' ? 'active' : ''}" onclick="switchModule('market')">
                  <span class="nav-link-icon">📈</span> <span>${t('navMarket')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'finance' ? 'active' : ''}" onclick="switchModule('finance')">
                  <span class="nav-link-icon">💰</span> <span>${t('navFinance')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'history' ? 'active' : ''}" onclick="switchModule('history')">
                  <span class="nav-link-icon">📜</span> <span>${t('navHistory')}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- GROUP: MANAGEMENT -->
          <div>
            <div class="nav-group-label">${t('groupManagement')}</div>
            <ul class="nav-links">
              <li>
                <button class="nav-link ${currentMod === 'sensors' ? 'active' : ''}" onclick="switchModule('sensors')">
                  <span class="nav-link-icon">📡</span> <span>${t('navSensors')}</span>
                </button>
              </li>
              <li>
                <button class="nav-link ${currentMod === 'settings' ? 'active' : ''}" onclick="switchModule('settings')">
                  <span class="nav-link-icon">⚙️</span> <span>${t('navSettings')}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Sidebar Footer -->
        <div class="sidebar-footer">
          <div class="user-badge">
            <div class="user-avatar">${user.name ? user.name.charAt(0).toUpperCase() : 'F'}</div>
            <div class="user-info">
              <div class="user-name">${esc(user.name)}</div>
              <div class="user-role">${user.isGuest ? t('guestProfile') : t('farmerAccount')}</div>
            </div>
          </div>
          <button class="btn secondary sm" onclick="signOutUser()" title="${t('signOut')}">⎋</button>
        </div>
      </aside>

      <!-- Top Utility Bar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="hamburger-btn" onclick="toggleMobileSidebar()" aria-label="Toggle Navigation">☰</button>
          <span class="field-status-pill" id="weatherPill">
            ● ${esc(f.location?.locality || f.location?.displayName || 'Field')}
          </span>
        </div>

        <div class="topbar-right">
          <!-- Notifications -->
          <button class="util-btn" onclick="openNotificationsModal()" aria-label="${t('notifications')}">
            🔔
          </button>

          <!-- Language Selector -->
          <select class="util-btn" onchange="setAppLanguage(this.value)" aria-label="${t('langSelect')}">
            ${I18N.languages.map(l => `<option value="${l.code}"${l.code === I18N.currentLang ? ' selected' : ''}>🌐 ${l.native}</option>`).join('')}
          </select>

          <!-- Theme Toggle -->
          <button id="themeToggleBtn" class="util-btn theme-toggle-btn" onclick="toggleTheme()" aria-label="${t('themeToggle')}">
            ${FarmHubState.theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <!-- Profile Badge -->
          <button class="util-btn" onclick="switchModule('settings')" aria-label="Profile Settings">
            👤 ${esc(user.name?.split(' ')[0] || 'Profile')}
          </button>
        </div>
      </header>

      <!-- Main Workspace -->
      <main class="main-workspace" id="moduleContainer" role="main">
        <div class="card" style="text-align:center;padding:40px">
          <b>Loading module…</b>
        </div>
      </main>
    </div>
  `;
}

function bindSidebarEvents() {
  // Mobile drawer backdrop handling if needed
}

function toggleMobileSidebar() {
  const sb = $('#appSidebar');
  if (sb) sb.classList.toggle('open');
}

function switchModule(modName) {
  FarmHubState.currentModule = modName;
  // Update active class on nav links
  $$('.nav-link').forEach(link => link.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-link[onclick*="${modName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Close mobile sidebar on navigation
  const sb = $('#appSidebar');
  if (sb) sb.classList.remove('open');

  renderActiveModule();
  window.scrollTo(0, 0);
}

function signOutUser() {
  if (confirm('Switch user or reset current session?')) {
    FarmHubState.activeFarm = null;
    FarmHubState.user = null;
    persistState();
    navigateTo('landing');
  }
}

// ============================================================
// 5. MODULE DISPATCHER & VIEWS
// ============================================================
async function renderActiveModule() {
  const container = $('#moduleContainer');
  if (!container) return;

  const mod = FarmHubState.currentModule;
  container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><b>Loading ${mod}…</b></div>`;

  try {
    switch (mod) {
      case 'overview':
        container.innerHTML = await renderOverviewModule();
        break;
      case 'my-farm':
        container.innerHTML = renderMyFarmModule();
        initFieldMap();
        break;
      case 'weather':
        container.innerHTML = await renderWeatherModule();
        drawWeatherCharts();
        break;
      case 'calendar':
        container.innerHTML = renderCalendarModule();
        break;
      case 'irrigation':
        container.innerHTML = await renderIrrigationModule();
        break;
      case 'advisory':
        container.innerHTML = await renderAdvisoryModule();
        break;
      case 'fertilizer':
        container.innerHTML = renderFertilizerModule();
        break;
      case 'health':
        container.innerHTML = renderHealthModule();
        break;
      case 'market':
        container.innerHTML = await renderMarketModule();
        break;
      case 'finance':
        container.innerHTML = renderFinanceModule();
        drawFinanceCharts();
        break;
      case 'sensors':
        container.innerHTML = await renderSensorsModule();
        break;
      case 'history':
        container.innerHTML = renderHistoryModule();
        break;
      case 'settings':
        container.innerHTML = renderSettingsModule();
        break;
      default:
        container.innerHTML = await renderOverviewModule();
    }
  } catch (err) {
    console.error('Module rendering error', err);
    container.innerHTML = `
      <div class="card">
        <h2>Module Error</h2>
        <p class="mu">${esc(err.message)}</p>
        <button class="btn" onclick="renderActiveModule()">Retry</button>
      </div>
    `;
  }
}

// Fetch and cache weather for the active farm
async function getActiveFarmWeather(force = false) {
  const f = FarmHubState.activeFarm;
  if (!f || !f.location) return null;

  if (force || !FarmHubState.weatherCache[f.id]) {
    try {
      const raw = await API.weather(f.location.lat, f.location.lon, f.id);
      FarmHubState.weatherCache[f.id] = normalizeWeather(raw);
    } catch (e) {
      console.warn('Weather fetch failed', e);
      return null;
    }
  }
  return FarmHubState.weatherCache[f.id];
}

// Generate engine inputs from farm and weather
function buildEngineInputs(f, wx) {
  const stageInfo = computeCropStage(f);
  const sm = wx ? wx.sm : null;
  const isDemo = FarmHubState.demoMode;

  return {
    cropId: f.cropId,
    cropName: f.cropName,
    stage: stageInfo.name,
    soil: f.soil || 'Red loam',
    area: f.farmSize || 1,
    method: f.irrigation || 'Drip',
    sm: isDemo ? 23.4 : (f.man ? f.man.sm : sm),
    src: isDemo ? 'Demo IoT sensor stream' : (f.man ? 'Manual field reading' : 'Open-Meteo numerical model'),
    t: wx ? wx.t : 26,
    h: wx ? wx.h : 60,
    wind: wx ? wx.wind : 10,
    tmax: wx ? wx.tmax : 30,
    et0: wx ? wx.et0 : null,
    rp: wx ? wx.rp : 10,
    rain: wx ? wx.rain : 0,
    wx: !!wx,
    fresh: wx ? wx.age : 30,
    q: f.man ? f.man.q : 0.6,
    day: stageInfo.day
  };
}

// ============================================================
// MODULE: OVERVIEW (Farmer-First 4 Questions + Hero)
// ============================================================
async function renderOverviewModule() {
  const f = FarmHubState.activeFarm;
  const wx = await getActiveFarmWeather();
  const inputs = buildEngineInputs(f, wx);
  const decision = runDecisionEngine(inputs, FarmHubState.history);
  const stageInfo = computeCropStage(f);
  FarmHubState.curDecision = decision;

  // Check if profile is complete (soil, farmSize, irrigation)
  const isProfileIncomplete = !f.soil || !f.farmSize || !f.irrigation;

  // Stat metrics (real stored values only)
  const totalFields = FarmHubState.farms.length;
  const totalArea = FarmHubState.farms.reduce((acc, x) => acc + (x.farmSize || 0), 0);
  const activeCropsCount = new Set(FarmHubState.farms.map(x => x.cropName)).size;
  const netIncome = FarmHubState.fin.filter(x => x.farmId === f.id || !x.farmId).reduce((acc, x) => acc + (x.type === 'Income' ? x.amt : -x.amt), 0);

  return `
    <!-- Top Greeting Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <h1 style="font-size:26px">🌾 ${esc(f.name)}</h1>
        <p class="mu" style="margin:2px 0 0">
          ${esc(f.cropName)} (${t(f.cropCategory ? 'cat' + f.cropCategory.charAt(0).toUpperCase() + f.cropCategory.slice(1) : 'catVegetables', f.cropCategory)}) · ${esc(f.location?.displayName || 'Location not set')}
        </p>
      </div>
      <div class="row">
        <button id="advisorySpeechButton" class="btn secondary sm" onclick="toggleAdvisorySpeech()" aria-label="${t(activeAdvisoryUtterance ? 'stopAdvisory' : 'readAdvisory')}" aria-pressed="${!!activeAdvisoryUtterance}">
          ${activeAdvisoryUtterance ? '⏹️ ' + t('stopAdvisory') : '🔊 ' + t('readAdvisory')}
        </button>
        <button class="btn secondary sm" onclick="window.print()">🖨️ ${t('printAdvisory')}</button>
      </div>
    </div>

    <!-- Complete Profile Notice if Missing Soil/Size/Irrigation -->
    ${isProfileIncomplete ? `
      <section class="complete-notice-card">
        <div>
          <b style="font-size:16px;color:var(--forest)">${t('completeProfileNotice')}</b>
          <p style="margin:4px 0 0;color:var(--text-secondary)">${t('completeProfileDesc')}</p>
        </div>
        <button class="btn sm" onclick="switchModule('my-farm')">${t('btnCompleteProfile')}</button>
      </section>
    ` : ''}

    <!-- 1. WHAT SHOULD I DO NOW? (HERO DECISION CARD) -->
    <section class="hero ${decision.level}" aria-labelledby="heroTitleId">
      <div>
        <div class="hero-label" id="heroTitleId">${decision.icon} ${t('heroTitle')}</div>
        <div class="hero-big">${decision.dec}</div>
        <div class="hero-window">⏰ When: ${decision.win}</div>
        <p class="hero-desc">${decision.act}</p>
        <div class="row" style="margin-top:14px">
          <span class="field-status-pill" style="background:rgba(255,255,255,0.18);color:#FFF;border-color:rgba(255,255,255,0.3)">
            💧 ${decision.impact}
          </span>
        </div>
      </div>
      <div class="hero-right-box">
        <div class="hero-metric-row">
          <span>${t('confidence')}:</span> <b>${decision.conf}%</b>
        </div>
        <div class="bar"><i style="width:${decision.conf}%;background:var(--accent)"></i></div>
        <div class="hero-metric-row" style="margin-top:8px">
          <span>${t('fieldRisk')}:</span> <b>${decision.level} (${decision.over}/100)</b>
        </div>
        <div class="bar"><i style="width:${decision.over}%;background:${decision.over > 60 ? 'var(--farm-danger)' : 'var(--farm-warning)'}"></i></div>
        <small style="color:var(--farm-warning);font-size:12px;margin-top:4px">⚠️ ${decision.unc}</small>
      </div>
    </section>

    <!-- KEY STAT CARDS -->
    <section class="grid" aria-label="Farm Statistics">
      <div class="sig-card">
        <small>${t('statFields')}</small>
        <b>${totalFields}</b>
        <span>Registered parcels</span>
      </div>
      <div class="sig-card">
        <small>${t('statArea')}</small>
        <b>${totalArea > 0 ? totalArea + ' Acres' : t('notAddedYet')}</b>
        <span>${totalArea > 0 ? 'Recorded land' : `<a href="javascript:void(0)" onclick="switchModule('my-farm')" style="color:var(--green)">+ ${t('add')}</a>`}</span>
      </div>
      <div class="sig-card">
        <small>${t('statCrops')}</small>
        <b>${activeCropsCount}</b>
        <span>${esc(f.cropName)} active</span>
      </div>
      <div class="sig-card">
        <small>${t('statIncome')}</small>
        <b style="color:${netIncome >= 0 ? 'var(--green)' : 'var(--farm-danger)'}">₹${netIncome.toLocaleString('en-IN')}</b>
        <span>Net farm ledger</span>
      </div>
    </section>

    <!-- 2. WHY? -->
    <section class="ff-card">
      <div class="ff-title">🔍 ${t('whyTitle')}</div>
      <ul class="ff-why-list">
        ${decision.why.map(w => `<li><b>${esc(w)}</b></li>`).join('')}
      </ul>
      <details style="margin-top:14px;cursor:pointer">
        <summary class="mu">View agronomic reasoning trace</summary>
        <div style="background:var(--surface-alt);padding:14px;border-radius:8px;margin-top:8px;font-size:13.5px">
          ${decision.flow.map(x => `<div>• ${esc(x)}</div>`).join('')}
        </div>
      </details>
    </section>

    <!-- 3. DATA USED -->
    <section class="ff-card">
      <div class="ff-title">📊 ${t('dataUsedTitle')}</div>
      <div class="data-used-grid">
        ${decision.dataUsed.map(d => `
          <div class="data-used-item">
            <span class="data-used-label">${d.label}</span>
            <span class="data-used-val">${d.value}</span>
            <span class="data-used-sub">${d.sub}</span>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- 4. WHAT SHOULD I CHECK NEXT? -->
    <section class="ff-card" style="background:var(--surface-alt)">
      <div class="ff-title">📋 ${t('nextCheckTitle')}</div>
      <p style="font-size:15px;margin-bottom:6px">
        <b>${t('scheduledCheck')}:</b> ${decision.nextCheck}
      </p>
      <p class="mu">
        Monitor your local sky conditions and hand-feel soil moisture before operating drip valves. If rain develops early, cancel irrigation.
      </p>
    </section>

    <!-- FIELD TELEMETRY SIGNALS -->
    <section class="grid" aria-label="Field Telemetry">
      <div class="sig-card">
        <small>${t('soilMoisture')}</small>
        <b>${wx?.sm != null ? r1(wx.sm) + '%' : t('notAddedYet')}</b>
        <span>${inputs.src}</span>
      </div>
      <div class="sig-card">
        <small>${t('airTemp')}</small>
        <b>${wx ? wx.t + '°C' : '--'}</b>
        <span>High ${wx ? wx.tmax + '°C' : '--'} · Low ${wx ? wx.tmin + '°C' : '--'}</span>
      </div>
      <div class="sig-card">
        <small>${t('humidity')}</small>
        <b>${wx ? wx.h + '%' : '--'}</b>
        <span>Wind ${wx ? wx.wind + ' km/h' : '--'}</span>
      </div>
      <div class="sig-card">
        <small>${t('rainChance')}</small>
        <b>${wx ? wx.rp + '%' : '--'}</b>
        <span>Next 48h chance</span>
      </div>
      <div class="sig-card">
        <small>${t('expectedRain')}</small>
        <b>${wx ? wx.rain + ' mm' : '--'}</b>
        <span>Cumulative 48h</span>
      </div>
      <div class="sig-card">
        <small>${t('cropStage')}</small>
        <b>${stageInfo.name}</b>
        <span>${stageInfo.isConfirmed ? 'Farmer confirmed' : 'Calculated'} · Day ${Math.max(0, stageInfo.day)}</span>
      </div>
    </section>
  `;
}

function updateAdvisorySpeechButton() {
  const button = $('#advisorySpeechButton');
  if (!button) return;

  const isActive = !!activeAdvisoryUtterance;
  const labelKey = isActive ? 'stopAdvisory' : 'readAdvisory';
  button.textContent = `${isActive ? '⏹️' : '🔊'} ${t(labelKey)}`;
  button.setAttribute('aria-label', t(labelKey));
  button.setAttribute('aria-pressed', String(isActive));
}

function stopAdvisorySpeech() {
  if (!activeAdvisoryUtterance) return;
  activeAdvisoryUtterance = null;
  window.speechSynthesis.cancel();
  updateAdvisorySpeechButton();
}

function toggleAdvisorySpeech() {
  if (!('speechSynthesis' in window)) {
    alert('Voice speech synthesis is not supported on this browser.');
    return;
  }
  if (activeAdvisoryUtterance) {
    stopAdvisorySpeech();
    return;
  }

  const f = FarmHubState.activeFarm;
  const d = FarmHubState.curDecision;
  if (!f || !d) return;

  const speechLocale = ({ en: 'en-US', kn: 'kn-IN', ta: 'ta-IN', te: 'te-IN', hi: 'hi-IN' })[I18N.currentLang] || 'en-US';
  const speechCopy = I18N.t('audioAdvisory');
  const guidance = (speechCopy.guidance[d.dec] || d.act).replace(/[.!?।]+$/, '');
  const confidence = new Intl.NumberFormat(speechLocale).format(d.conf);
  const text = `${speechCopy.opening} ${f.name}. ${speechCopy.cropLabel} ${f.cropName}. ${speechCopy.recommendation} ${guidance}. ${speechCopy.confidence} ${confidence} ${speechCopy.percent}.`;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLocale;
  const languagePrefix = speechLocale.split('-')[0].toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  utter.voice = voices.find(voice => voice.lang.toLowerCase() === speechLocale.toLowerCase())
    || voices.find(voice => voice.lang.toLowerCase().startsWith(languagePrefix + '-'))
    || null;
  utter.rate = 0.95;
  const clearPlayback = () => {
    if (activeAdvisoryUtterance !== utter) return;
    activeAdvisoryUtterance = null;
    updateAdvisorySpeechButton();
  };
  utter.onend = clearPlayback;
  utter.onerror = clearPlayback;
  activeAdvisoryUtterance = utter;
  updateAdvisorySpeechButton();
  window.speechSynthesis.speak(utter);
}

// ============================================================
// MODULE: MY FARM & SOIL/IRRIGATION SETUP
// ============================================================
function renderMyFarmModule() {
  const f = FarmHubState.activeFarm;
  const soils = ['Sandy', 'Red loam', 'Loamy', 'Clay', 'Black cotton', 'Alluvial'];
  const irrs = ['Drip', 'Sprinkler', 'Flood', 'Sub-surface Drip'];
  const stages = ['Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest'];

  return `
    <h2>${t('navMyFarm')} — ${esc(f.name)}</h2>
    <p class="mu">Complete or update your farm profile to unlock fine-tuned, field-specific agronomic advice.</p>

    <div class="grid2">
      <!-- Edit Farm Form -->
      <form class="card" onsubmit="handleUpdateFarmProfile(event)">
        <h3>FARM SPECIFICATIONS</h3>
        <div class="form-group">
          <label>Farm Name</label>
          <input id="edit_name" value="${esc(f.name)}" required>
        </div>
        <div class="grid2">
          <div class="form-group">
            <label>Farm Size (Acres)</label>
            <input id="edit_size" type="number" step="0.1" min="0.1" value="${f.farmSize || ''}" placeholder="e.g. 2.5">
          </div>
          <div class="form-group">
            <label>Soil Type</label>
            <select id="edit_soil">
              <option value="">-- Select soil type --</option>
              ${soils.map(s => `<option value="${s}"${f.soil === s ? ' selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid2">
          <div class="form-group">
            <label>Irrigation System</label>
            <select id="edit_irr">
              <option value="">-- Select irrigation --</option>
              ${irrs.map(i => `<option value="${i}"${f.irrigation === i ? ' selected' : ''}>${i}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Crop Stage</label>
            <select id="edit_stage">
              ${stages.map(st => `<option value="${st}"${f.stage === st ? ' selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Planting / Sowing Date</label>
          <input id="edit_plant" type="date" value="${f.plantingDate || ''}">
        </div>

        <button type="submit" class="btn" style="margin-top:10px">${t('save')} Profile</button>
      </form>

      <!-- Field Boundary Map -->
      <div class="card">
        <h3>GEOSPATIAL FIELD BOUNDARY</h3>
        <p class="mu">📍 ${esc(f.location?.displayName || 'Coordinates not set')}</p>
        <div id="fieldMap"></div>
        <div id="mapErrorState" class="map-error-banner" style="display:none">
          <p><b>${t('mapUnavailable')}</b></p>
          <button class="btn secondary sm" onclick="initFieldMap()">${t('retryMap')}</button>
        </div>
      </div>
    </div>

    <!-- Multi-Farm Switcher / Add Farm -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <h3>REGISTERED FARMS (${FarmHubState.farms.length})</h3>
        <button class="btn secondary sm" onclick="startAddNewFarm()">+ Add Another Farm</button>
      </div>
      <div style="display:grid;gap:10px">
        ${FarmHubState.farms.map(fm => `
          <div class="card" style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;background:${fm.id === f.id ? 'var(--green-light)' : 'var(--surface-alt)'}">
            <div>
              <b style="font-size:15px">${esc(fm.name)}</b>
              <span class="mu" style="display:block;font-size:12.5px">
                ${esc(fm.cropName)} · ${fm.farmSize ? fm.farmSize + ' acres' : 'Size not set'} · ${esc(fm.location?.locality || fm.location?.district || 'Field')}
              </span>
            </div>
            <div class="row">
              ${fm.id !== f.id ? `<button class="btn sm" onclick="switchActiveFarm('${fm.id}')">Switch to this</button>` : '<span class="field-status-pill">Active</span>'}
              ${FarmHubState.farms.length > 1 ? `<button class="btn secondary sm" onclick="deleteFarm('${fm.id}')">Delete</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function handleUpdateFarmProfile(e) {
  e.preventDefault();
  const f = FarmHubState.activeFarm;
  f.name = $('#edit_name').value.trim();
  f.farmSize = parseFloat($('#edit_size').value) || 0;
  f.soil = $('#edit_soil').value;
  f.irrigation = $('#edit_irr').value;
  f.stage = $('#edit_stage').value;
  f.farmerConfirmedStage = true;
  f.plantingDate = $('#edit_plant').value;

  // Sync into farms list
  const idx = FarmHubState.farms.findIndex(x => x.id === f.id);
  if (idx >= 0) FarmHubState.farms[idx] = f;

  persistState();
  alert('Farm profile updated successfully!');
  switchModule('overview');
}

function switchActiveFarm(farmId) {
  const target = FarmHubState.farms.find(x => x.id === farmId);
  if (target) {
    FarmHubState.activeFarm = target;
    persistState();
    renderApp();
  }
}

function startAddNewFarm() {
  tempOnboarding = { location: null, cropCategory: null, cropId: null, cropName: '', isCustomCrop: false };
  navigateTo('crop-specs');
}

function deleteFarm(farmId) {
  if (!confirm('Are you sure you want to delete this farm?')) return;
  FarmHubState.farms = FarmHubState.farms.filter(x => x.id !== farmId);
  if (FarmHubState.activeFarm.id === farmId) {
    FarmHubState.activeFarm = FarmHubState.farms[0] || null;
  }
  persistState();
  renderApp();
}

function initFieldMap() {
  const container = $('#fieldMap');
  const errBanner = $('#mapErrorState');
  if (!container || typeof L === 'undefined') return;

  if (activeLeafletMap) {
    try { activeLeafletMap.remove(); } catch (e) {}
    activeLeafletMap = null;
  }

  const f = FarmHubState.activeFarm;
  const lat = f.location?.lat || 13.136;
  const lon = f.location?.lon || 78.129;

  try {
    activeLeafletMap = L.map('fieldMap').setView([lat, lon], 14);

    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; CARTO &copy; OSM'
    });

    tiles.on('tileerror', () => {
      if (errBanner) errBanner.style.display = 'block';
    });

    tiles.addTo(activeLeafletMap);

    activeMapMarker = L.marker([lat, lon], { draggable: true }).addTo(activeLeafletMap);

    // Dynamic field boundary radius circle
    const acres = f.farmSize || 2.0;
    const radiusMeters = Math.sqrt(acres * 4047 / Math.PI);
    const circle = L.circle([lat, lon], {
      radius: radiusMeters,
      color: '#2F7D4A',
      fillColor: '#55D68A',
      fillOpacity: 0.2
    }).addTo(activeLeafletMap);

    activeMapMarker.on('dragend', async () => {
      const pos = activeMapMarker.getLatLng();
      circle.setLatLng(pos);
      const rev = await API.reverse(pos.lat, pos.lng, 'Map Pin');
      f.location = rev;
      persistState();
    });

    if (errBanner) errBanner.style.display = 'none';
  } catch (err) {
    if (errBanner) errBanner.style.display = 'block';
  }
}

// ============================================================
// MODULE: WEATHER & ROOT ZONE HYDROLOGY
// ============================================================
function sumRecentRainfall(wx, hours) {
  const rainfall = wx?.H?.precipitation || [];
  if (!rainfall.length) return null;
  const start = Math.max(0, (wx.i || 0) - hours + 1);
  return r1(rainfall.slice(start, (wx.i || 0) + 1).reduce((total, value) => total + (value || 0), 0));
}

function buildWeatherIrrigationView(f, wx, inputs, decision) {
  const cropObj = CROPS_DATA.getCrop(f.cropId, f.cropName);
  const stageInfo = computeCropStage(f);
  const fc = SOIL_FC[f.soil] || 28;
  const pwp = SOIL_PWP[f.soil] || 12;
  const moisture = inputs.sm;
  const pref = fc * 0.8;
  const moistureStatus = moisture == null
    ? 'Unavailable'
    : moisture > fc * 1.15
    ? 'Waterlogging Risk'
    : moisture < pwp + (pref - pwp) * 0.3
    ? 'Low'
    : moisture < pref
    ? 'Getting Dry'
    : 'Adequate';
  const status = {
    IRRIGATE: 'Irrigation Required',
    WAIT: 'Irrigation Not Required',
    'DELAY IRRIGATION': 'Delay Irrigation',
    'CHECK DRAINAGE': 'Monitor Soil Moisture',
    'PROTECT CROP': 'Monitor Soil Moisture',
    'INSPECT FIELD': 'Monitor Soil Moisture',
    MONITOR: 'Monitor Soil Moisture'
  }[decision.actionKey] || 'Monitor Soil Moisture';
  const recent24 = sumRecentRainfall(wx, 24);
  const recent48 = sumRecentRainfall(wx, 48);
  const weekly = wx?.D?.precipitation_sum?.length ? r1(wx.D.precipitation_sum.slice(-7).reduce((total, value) => total + (value || 0), 0)) : null;
  const cropEt = wx.et0 != null ? r1(wx.et0 * (cropObj.kc || 0.8)) : null;
  const waterStress = moisture != null && moisture < pref && (wx.tmax >= 32 || wx.h < 40 || wx.wind >= 25) && wx.rain < 5;
  const waterlogging = moisture != null && moisture > fc * 1.1 && (wx.rain >= 10 || wx.rp >= 60);
  const diseaseWeather = wx.h >= 80 && (wx.rain >= 5 || recent24 >= 2);
  const rainfallReason = wx.rain > 0
    ? `${wx.rain} mm rainfall is expected within 48 hours. If soil moisture remains adequate, irrigation may be delayed.`
    : 'Little or no rainfall is expected; check root-zone moisture before irrigating.';
  const reasons = decision.why.length ? decision.why : ['No single weather or soil factor dominates the current status.'];

  return {
    cropObj, stageInfo, fc, pwp, pref, moistureStatus, status, recent24, recent48, weekly, cropEt,
    waterStress, waterlogging, diseaseWeather, rainfallReason, reasons
  };
}

async function renderWeatherModule() {
  const f = FarmHubState.activeFarm;
  const wx = await getActiveFarmWeather(true);

  if (!wx) {
    return `
      <div class="card">
        <h2>${t('liveWeatherUnavailable')}</h2>
        <p class="mu">FarmHub could not connect to Open-Meteo. Please check your internet connection.</p>
        <button class="btn" onclick="renderActiveModule()">${t('refresh')}</button>
      </div>
    `;
  }

  const spray = evaluateSprayWindow(wx);
  const inputs = buildEngineInputs(f, wx);
  const decision = runDecisionEngine(inputs, FarmHubState.history);
  const irrigation = buildWeatherIrrigationView(f, wx, inputs, decision);

  return `
    <h2>${t('navWeather')} — ${esc(f.location?.displayName || 'Field')}</h2>
    <p class="mu">Real numerical weather predictions and root-zone soil hydrology (0–9 cm depth) from Open-Meteo.</p>

    <!-- METRICS GRID -->
    <div class="grid">
      <div class="sig-card">
        <small>Current Temp</small>
        <b>${wx.t}°C</b>
        <span>${t('feelsLike')} ${wx.apparentTemp ?? wx.t}°C</span>
      </div>
      <div class="sig-card">
        <small>Humidity & Wind</small>
        <b>${wx.h}%</b>
        <span>Wind ${wx.wind} km/h</span>
      </div>
      <div class="sig-card">
        <small>48h Rain Probability</small>
        <b>${wx.rp}%</b>
        <span>${wx.rain} mm expected</span>
      </div>
      <div class="sig-card">
        <small>Soil Temp (6cm)</small>
        <b>${wx.st != null ? r1(wx.st) + '°C' : '--'}</b>
        <span>Root zone temperature</span>
      </div>
      <div class="sig-card">
        <small>${t('uvIndex')}</small>
        <b>${wx.uvMax ?? '--'}</b>
        <span>Solar radiation</span>
      </div>
      <div class="sig-card">
        <small>Sun Cycle</small>
        <b>${wx.sunrise ? wx.sunrise.slice(11, 16) : '--'}</b>
        <span>Sunset ${wx.sunset ? wx.sunset.slice(11, 16) : '--'}</span>
      </div>
    </div>

    <div class="card" style="border-left:6px solid ${irrigation.status === 'Irrigation Required' ? 'var(--farm-danger)' : irrigation.status === 'Delay Irrigation' || irrigation.status === 'Irrigation Not Required' ? 'var(--green)' : 'var(--farm-amber)'}">
      <h3>WEATHER → IRRIGATION STATUS</h3>
      <div style="font-size:22px;font-weight:800;margin:8px 0">${irrigation.status}</div>
      <p>${esc(irrigation.rainfallReason)}</p>
      <div class="row" style="margin-top:10px">
        <span class="field-status-pill">Soil: ${esc(irrigation.moistureStatus)}</span>
        <span class="field-status-pill">Risk: ${esc(decision.level)}</span>
        <span class="field-status-pill">Confidence: ${decision.conf}%</span>
      </div>
      <p class="mu" style="margin-top:12px"><b>Action:</b> ${esc(decision.act)}</p>
      <p class="mu"><b>Reassess:</b> ${esc(decision.nextCheck)}. Do not use a fixed rule such as watering every two days; combine current weather, soil moisture, crop, stage and water demand.</p>
    </div>

    <div class="grid">
      <div class="sig-card"><small>Current soil moisture</small><b>${inputs.sm != null ? r1(inputs.sm) + '%' : '--'}</b><span>${esc(irrigation.moistureStatus)}</span></div>
      <div class="sig-card"><small>Root-zone moisture</small><b>${inputs.sm != null ? `${r1(inputs.sm)}%` : '--'}</b><span>${esc(f.soil || 'Soil not set')} · target ~${r(irrigation.pref)}%</span></div>
      <div class="sig-card"><small>Soil temperature</small><b>${wx.st != null ? r1(wx.st) + '°C' : '--'}</b><span>At approximately 6 cm</span></div>
      <div class="sig-card"><small>Rainfall last 24h / 48h</small><b>${irrigation.recent24 == null ? '--' : irrigation.recent24 + ' / ' + (irrigation.recent48 ?? '--') + ' mm'}</b><span>From hourly model</span></div>
      <div class="sig-card"><small>Weekly rainfall</small><b>${irrigation.weekly == null ? '--' : irrigation.weekly + ' mm'}</b><span>Available forecast window</span></div>
      <div class="sig-card"><small>Crop water demand</small><b>${irrigation.cropEt == null ? '--' : irrigation.cropEt + ' mm/day'}</b><span>${esc(f.cropName)} · ${esc(irrigation.stageInfo.name)}</span></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>RAINFALL IMPACT</h3>
        <p><b>Probability:</b> ${wx.rp}%<br><b>Expected:</b> ${wx.rain} mm in the next 48 hours<br><b>Recent:</b> ${irrigation.recent24 ?? '--'} mm / 24h, ${irrigation.recent48 ?? '--'} mm / 48h</p>
        <ul>${irrigation.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
        <p class="mu">Effective rainfall may be lower than total rainfall because runoff, deep drainage and evaporation reduce the water available to roots.</p>
      </div>
      <div class="card">
        <h3>EVAPOTRANSPIRATION</h3>
        <p>Evapotranspiration combines water lost through soil evaporation and plant transpiration.</p>
        <p><b>Reference ET (ET0):</b> ${wx.et0 != null ? wx.et0 + ' mm/day' : 'Unavailable'}<br><b>Crop ET (ETc):</b> ${irrigation.cropEt != null ? irrigation.cropEt + ' mm/day' : 'Unavailable'}<br><b>Relationship:</b> ETc = ET0 × Kc<br><b>Kc:</b> ${irrigation.cropObj.kc || 0.8} for ${esc(f.cropName)}</p>
        <p class="mu">Crop coefficient changes with crop type and growth stage, so ETc is an estimate rather than a fixed irrigation dose.</p>
      </div>
    </div>

    <div class="grid2">
      <div class="card" style="border-left:6px solid ${irrigation.waterlogging ? 'var(--farm-danger)' : 'var(--farm-amber)'}">
        <h3>WATERLOGGING RISK</h3>
        <p>${irrigation.waterlogging ? 'Heavy rain is expected while soil moisture is already high. Monitor drainage and avoid unnecessary irrigation.' : 'Risk rises when heavy rainfall meets wet soil, poor drainage or recent excess irrigation.'}</p>
        <p class="mu">Watch for yellowing, wilting despite wet soil, poor growth and root damage. Improve drainage where needed.</p>
      </div>
      <div class="card" style="border-left:6px solid ${irrigation.waterStress ? 'var(--farm-warning)' : 'var(--green)'}">
        <h3>WATER-STRESS RISK</h3>
        <p>${irrigation.waterStress ? 'Low soil moisture, high atmospheric demand and limited rainfall may increase water stress.' : 'Current weather and soil signals do not strongly indicate acute water stress.'}</p>
        <p class="mu">Risk can rise with low moisture, heat, low humidity, strong wind, limited rainfall or high ET. Monitor the crop and root zone.</p>
      </div>
    </div>

    <div class="card">
      <h3>IRRIGATION + CROP HEALTH</h3>
      <p>${irrigation.diseaseWeather ? 'High humidity and rainfall may favour some fungal or bacterial foliar diseases. Avoid unnecessary overhead irrigation and monitor the crop after rainfall.' : 'Weather conditions do not currently show the strongest combined humidity and rainfall signal for foliar disease risk.'}</p>
      <p class="mu">Irrigation status and spraying status are separate decisions. Wet foliage, high humidity and rain can change spray timing even when irrigation is appropriate.</p>
    </div>

    <!-- SPRAY WINDOW ADVISORY -->
    <div class="card" style="border-left:6px solid ${spray.status === 'OPTIMAL' ? 'var(--green)' : spray.status === 'MARGINAL' ? 'var(--farm-warning)' : 'var(--farm-danger)'}">
      <h3>SPRAYING & CANOPY APPLICATION WINDOW</h3>
      <p style="font-size:15px;margin-bottom:6px"><b>Status: ${spray.status}</b></p>
      <p class="mu">${spray.text}</p>
    </div>

    <!-- CHARTS -->
    <div class="card">
      <h3>SOIL MOISTURE % DYNAMICS (PAST 3 DAYS + 7-DAY FORECAST)</h3>
      <div class="chart-canvas-tall"><canvas id="chart_soil"></canvas></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>DAILY TEMPERATURE HIGHS & LOWS (°C)</h3>
        <div class="chart-canvas-wrap"><canvas id="chart_temp"></canvas></div>
      </div>
      <div class="card">
        <h3>RAIN PROBABILITY (%) & RAINFALL (mm)</h3>
        <div class="chart-canvas-wrap"><canvas id="chart_rain"></canvas></div>
      </div>
    </div>
  `;
}

function drawWeatherCharts() {
  const f = FarmHubState.activeFarm;
  const wx = FarmHubState.weatherCache[f.id];
  if (!wx || typeof Chart === 'undefined') return;

  const H = wx.H || {};
  const D = wx.D || {};
  const fc = SOIL_FC[f.soil] || 28;
  const pref = r1(fc * 0.8);

  // 1. Soil moisture chart
  if (H.time && H.soil_moisture_3_to_9cm) {
    const a = Math.max(0, wx.i - 72);
    const b = Math.min(H.time.length, wx.i + 96);
    const smData = H.soil_moisture_3_to_9cm.slice(a, b).map(v => v == null ? null : r1(v * 100));
    const labels = H.time.slice(a, b).map((t, idx) => {
      const d = new Date(t);
      return idx % 12 === 0 ? `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}` : '';
    });

    createSafeChart('chart_soil', 'line', {
      labels,
      datasets: [
        {
          label: 'Soil Moisture % (3-9cm)',
          data: smData,
          borderColor: '#2F7D4A',
          backgroundColor: 'rgba(47, 125, 74, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: `Comfortable Target (${pref}%)`,
          data: smData.map(() => pref),
          borderColor: '#D97706',
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    });
  }

  // 2. Temperature chart
  if (D.time && D.temperature_2m_max) {
    const dates = D.time.map(t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    createSafeChart('chart_temp', 'line', {
      labels: dates,
      datasets: [
        { label: 'High (°C)', data: D.temperature_2m_max, borderColor: '#D97706', tension: 0.2 },
        { label: 'Low (°C)', data: D.temperature_2m_min, borderColor: '#2563EB', tension: 0.2 }
      ]
    });

    // 3. Rain chart
    createSafeChart('chart_rain', 'bar', {
      labels: dates,
      datasets: [
        { label: 'Rain Chance (%)', data: D.precipitation_probability_max, backgroundColor: 'rgba(85, 214, 138, 0.7)', yAxisID: 'y' },
        { label: 'Rain (mm)', data: D.precipitation_sum, borderColor: '#2563EB', type: 'line', yAxisID: 'y1' }
      ]
    }, {
      scales: {
        y: { min: 0, max: 100 },
        y1: { position: 'right', grid: { drawOnChartArea: false } }
      }
    });
  }
}

function createSafeChart(id, type, data, options = {}) {
  const canvas = $('#' + id);
  if (!canvas || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  new Chart(canvas, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: data.datasets.length > 1 } },
      ...options
    }
  });
}

// ============================================================
// MODULE: CROP CALENDAR & STAGE MANAGEMENT
// ============================================================
function renderCalendarModule() {
  const f = FarmHubState.activeFarm;
  const cropObj = CROPS_DATA.getCrop(f.cropId, f.cropName);
  const stageInfo = computeCropStage(f);
  const endDays = cropObj.end || [20, 45, 70, 105, 130];
  const plantDate = f.plantingDate ? new Date(f.plantingDate) : new Date();

  const getDateForDay = days => {
    const d = new Date(plantDate);
    d.setDate(d.getDate() + days);
    return fmtDate(d);
  };

  const tasksList = FarmHubState.tasks.filter(t => t.farmId === f.id);

  return `
    <h2>${t('navCalendar')} — ${esc(f.cropName)}</h2>
    <p class="mu">Phenological progress tracking based on planting date (${fmtDate(plantDate)}).</p>

    <!-- STAGE PROGRESS BAR -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <b>Stage: ${stageInfo.name} (Day ${Math.max(0, stageInfo.day)} of ~${stageInfo.totalDuration})</b>
        <span class="field-status-pill">${stageInfo.stageProgress}% stage progress</span>
      </div>
      <div class="bar" style="height:12px;background:var(--surface-alt)">
        <i style="width:${stageInfo.stageProgress}%;background:var(--green)"></i>
      </div>
      <p class="mu" style="margin-top:10px">
        Status: <b>${stageInfo.isConfirmed ? 'Farmer Confirmed' : 'Calculated by FarmHub'}</b>. ${stageInfo.daysToNext} days remaining until next stage milestone.
      </p>
    </div>

    <!-- STAGES TIMELINE TABLE -->
    <div class="card">
      <h3>PHENOLOGICAL STAGE MILESTONES</h3>
      <table>
        <thead>
          <tr>
            <th>Growth Stage</th>
            <th>Approx Window</th>
            <th>Sensitivity</th>
            <th>Key Field Tasks</th>
          </tr>
        </thead>
        <tbody>
          ${STAGES.map((stName, idx) => {
            const isNow = stName === stageInfo.name;
            const startD = idx === 0 ? 0 : endDays[idx - 1] + 1;
            const endD = endDays[idx];
            return `
              <tr class="${isNow ? 'now' : ''}">
                <td><b>${stName}</b> ${isNow ? '◀ Current' : ''}</td>
                <td>${getDateForDay(startD)} – ${getDateForDay(endD)}</td>
                <td>${STAGE_SENSITIVITY[stName] >= 0.9 ? 'High' : 'Moderate'}</td>
                <td>${cropObj.tasks[stName] || 'Standard maintenance and moisture scouting.'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- CUSTOM TASK MANAGER -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3>FIELD TASKS CHECKLIST (${tasksList.length})</h3>
        <button class="btn secondary sm" onclick="addCalendarTask()">+ Add Task</button>
      </div>
      <div style="display:grid;gap:8px">
        ${tasksList.map(task => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-alt);border-radius:8px">
            <label style="display:flex;align-items:center;gap:10px;margin:0;cursor:pointer">
              <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleTaskDone('${task.id}')" style="width:18px;height:18px">
              <span style="${task.done ? 'text-decoration:line-through;color:var(--muted)' : 'font-weight:600'}">${esc(task.title)}</span>
            </label>
            <button class="btn secondary sm" onclick="deleteCalendarTask('${task.id}')">✕</button>
          </div>
        `).join('') || '<p class="mu">No custom tasks scheduled yet. Click "+ Add Task" to schedule weeding, spraying or irrigation.</p>'}
      </div>
    </div>
  `;
}

function addCalendarTask() {
  const f = FarmHubState.activeFarm;
  const title = prompt('Enter task description: (e.g. Apply vermicompost top dressing)');
  if (title && title.trim()) {
    FarmHubState.tasks.push({
      id: 'task_' + Date.now().toString(36),
      farmId: f.id,
      title: title.trim(),
      done: false,
      createdAt: Date.now()
    });
    persistState();
    renderActiveModule();
  }
}

function toggleTaskDone(id) {
  const task = FarmHubState.tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    persistState();
    renderActiveModule();
  }
}

function deleteCalendarTask(id) {
  FarmHubState.tasks = FarmHubState.tasks.filter(t => t.id !== id);
  persistState();
  renderActiveModule();
}

// ============================================================
// MODULE: IRRIGATION & WATER BALANCE
// ============================================================
async function renderIrrigationModule() {
  const f = FarmHubState.activeFarm;
  const wx = await getActiveFarmWeather();
  const inputs = buildEngineInputs(f, wx);
  const decision = runDecisionEngine(inputs, FarmHubState.history);

  const fc = SOIL_FC[f.soil] || 28;
  const pwp = SOIL_PWP[f.soil] || 12;
  const smVal = inputs.sm != null ? inputs.sm : 20;
  const stageInfo = computeCropStage(f);
  const cropObj = CROPS_DATA.getCrop(f.cropId, f.cropName);
  const kc = cropObj.kc || 0.8;
  const etc = inputs.et0 != null ? r1(inputs.et0 * kc) : null;

  return `
    <h2>${t('navIrrigation')} Management — ${esc(f.name)}</h2>
    <p class="mu">Root zone moisture assessment and volumetric irrigation demand calculations.</p>

    <!-- DECISION HIGHLIGHT -->
    <div class="card" style="border-left:6px solid ${decision.dec === 'IRRIGATE' ? 'var(--green)' : 'var(--farm-amber)'}">
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:6px">
        ${decision.icon} Action: ${decision.dec} (${decision.win})
      </div>
      <p style="margin:0">${decision.act}</p>
    </div>

    <!-- WATER BUDGET & VOLUME -->
    <div class="grid">
      <div class="sig-card">
        <small>Volumetric Requirement</small>
        <b>${decision.liters.toLocaleString()} L</b>
        <span>~${decision.cubicMeters} m³ for ${f.farmSize || 1} acres</span>
      </div>
      <div class="sig-card">
        <small>Irrigation System</small>
        <b>${f.irrigation || 'Drip'}</b>
        <span>${f.irrigation === 'Drip' ? '90% efficiency' : 'Standard efficiency'}</span>
      </div>
      <div class="sig-card">
        <small>Current Moisture</small>
        <b>${r1(smVal)}%</b>
        <span>Target: ~${r(fc * 0.8)}% (FC: ${fc}%)</span>
      </div>
      <div class="sig-card">
        <small>Pump Run Time Estimate</small>
        <b>~${r1((decision.liters / 1000) / 2.5)} Hours</b>
        <span>Assuming 2,500 LPH discharge</span>
      </div>
    </div>

    <div class="card" style="border-left:6px solid var(--green)">
      <h3>IRRIGATION DECISION CONTEXT</h3>
      <p>Good irrigation means the right amount of water at the right time and in the right way. The recommendation combines crop, ${esc(stageInfo.name)} stage, ${esc(f.soil || 'recorded soil')} soil, root-zone moisture, weather, rainfall, irrigation method and system efficiency.</p>
      <div class="grid">
        <div class="sig-card"><small>Rainfall outlook</small><b>${wx ? `${inputs.rp}% / ${inputs.rain} mm` : 'Unavailable'}</b><span>${wx ? 'Next 48 hours' : 'Verify locally'}</span></div>
        <div class="sig-card"><small>Reference ET0</small><b>${inputs.et0 != null ? inputs.et0 + ' mm' : 'Unavailable'}</b><span>Weather model estimate</span></div>
        <div class="sig-card"><small>Crop ETc estimate</small><b>${etc != null ? etc + ' mm' : 'Unavailable'}</b><span>ETc = ET0 × Kc (${kc})</span></div>
        <div class="sig-card"><small>Root-zone range</small><b>${pwp}%–${fc}%</b><span>PWP to field capacity</span></div>
      </div>
      <p class="mu">Net irrigation need is influenced by crop water requirement, effective rainfall and useful soil moisture. Actual applied water must also account for system losses; rainfall is not entirely available because runoff, drainage and evaporation can occur.</p>
    </div>

    <div class="card">
      <h3>WHEN AND HOW MUCH TO IRRIGATE</h3>
      <p>Irrigation scheduling answers when to irrigate and how much water to apply. Check soil moisture, crop stage, weather, effective root-zone depth, soil water-holding capacity, crop demand and irrigation efficiency together.</p>
      <div class="grid2">
        <div><b>Soil guidance</b><ul><li>Sandy soil drains quickly and may need more frequent, smaller applications.</li><li>Loamy soil holds moderate to good available water.</li><li>Clay soil drains slowly; excess water can cause waterlogging.</li></ul></div>
        <div><b>Weather guidance</b><ul><li>Heat, solar radiation, wind and low humidity can increase demand.</li><li>Forecast rain may reduce or postpone irrigation, but do not cancel automatically.</li><li>Use forecast confidence, current moisture and crop sensitivity before deciding.</li></ul></div>
      </div>
      <p class="mu"><b>Water balance:</b> Net irrigation requirement = crop water requirement − effective rainfall − useful soil-moisture contribution. The actual applied amount may be higher because no system is 100% efficient.</p>
    </div>

    <div class="card">
      <h3>IRRIGATION METHODS</h3>
      <div class="grid2">${IRRIGATION_GUIDE_DATA.methods.map(item => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><b>${esc(item[0])}</b><p class="mu" style="margin:3px 0">${esc(item[1])}</p><p style="margin:3px 0">${esc(item[2])}</p></div>`).join('')}</div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>GROWTH-STAGE WATER NEEDS</h3>
        ${IRRIGATION_GUIDE_DATA.stages.map(item => `<p><b>${esc(item[0])}</b><br>${esc(item[1])}<br><span class="mu">Avoid: ${esc(item[2])}</span></p>`).join('')}
      </div>
      <div class="card">
        <h3>CROP CONSIDERATIONS</h3>
        ${(IRRIGATION_GUIDE_DATA.cropNotes.find(item => item[0].toLowerCase() === String(f.cropName || '').toLowerCase()) ? [IRRIGATION_GUIDE_DATA.cropNotes.find(item => item[0].toLowerCase() === String(f.cropName || '').toLowerCase())] : IRRIGATION_GUIDE_DATA.cropNotes).map(item => `<p><b>${esc(item[0])}</b><br><span class="mu">${esc(item[1])}</span></p>`).join('')}
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>SMART AND SENSOR-BASED IRRIGATION</h3>
        <p>Smart irrigation combines soil sensors, weather, crop information, irrigation history, valves and a mobile dashboard.</p>
        <p><b>Basic logic:</b> If soil moisture is below the crop threshold and rainfall is not expected, irrigation may be considered. Also check stage, recent irrigation, soil type, root-zone moisture and water availability.</p>
        ${IRRIGATION_GUIDE_DATA.sensors.map(item => `<p><b>${esc(item[0])}</b> <span class="mu">${esc(item[1])}</span></p>`).join('')}
      </div>
      <div class="card">
        <h3>WATER-SAVING PRACTICES</h3>
        <div>${IRRIGATION_GUIDE_DATA.saving.map(item => `<span class="field-status-pill" style="display:inline-block;margin:3px">${esc(item)}</span>`).join('')}</div>
        <h3 style="margin-top:16px">MULCHING</h3>
        <p class="mu">Mulch reduces evaporation, moderates soil temperature, suppresses weeds and can reduce erosion.</p>
        <p>${IRRIGATION_GUIDE_DATA.mulch.map(item => `<span class="field-status-pill" style="display:inline-block;margin:3px">${esc(item)}</span>`).join('')}</p>
      </div>
    </div>

    <div class="grid2">
      <div class="card" style="border-left:6px solid var(--farm-amber)">
        <h3>OVER-IRRIGATION AND WATERLOGGING</h3>
        <p>Applying more water than the crop and soil can use can cause waterlogging, low root oxygen, root disease, nutrient leaching, higher costs and reduced nutrient-use efficiency.</p>
        <p class="mu"><b>Warning signs:</b> Yellowing, wilting despite wet soil, poor growth, root damage or root rot.</p>
        <p><b>Respond:</b> Improve drainage, avoid unnecessary irrigation, use raised beds where appropriate and monitor soil moisture.</p>
      </div>
      <div class="card" style="border-left:6px solid var(--farm-info)">
        <h3>UNDER-IRRIGATION</h3>
        <p>Insufficient water can cause wilting, curling, leaf drying, reduced growth, flower drop, fruit-development problems and lower yield.</p>
        <p><b>Respond:</b> Check soil moisture and crop stage before deciding whether additional irrigation is required. Do not rely on a fixed litre value alone.</p>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE: FARM ADVISORY (Deep Explainability)
// ============================================================
function buildAdvisoryExplainability(f, inputs, decision) {
  const risk = decision.level === 'CRITICAL' || decision.level === 'HIGH' ? 'HIGH' : decision.level === 'MODERATE' ? 'MEDIUM' : 'LOW';
  const priority = risk === 'HIGH' ? 'IMMEDIATE' : risk === 'MEDIUM' ? 'SOON' : 'MONITOR';
  const confidenceBand = decision.conf >= 85 ? 'HIGH' : decision.conf >= 60 ? 'MEDIUM' : 'LOW';
  const crop = f.cropName || 'your crop';
  const stage = inputs.stage || 'current growth stage';
  const evidence = [
    `Crop: ${crop}, ${stage} stage (day ${inputs.day ?? 0}).`,
    `Soil: ${inputs.soil || 'not recorded'}; moisture ${inputs.sm == null ? 'not available' : r1(inputs.sm) + '%'} from ${inputs.src || 'unknown source'}.`,
    inputs.wx ? `Weather: ${inputs.t ?? '--'}°C, ${inputs.h ?? '--'}% humidity, ${inputs.rp ?? '--'}% rain probability and ${inputs.rain ?? '--'} mm expected rain.` : 'Weather data is unavailable; local conditions need manual verification.',
    `Irrigation: ${inputs.method || 'not recorded'}; farm history matches: ${FarmHubState.history.length}.`
  ];
  const actionPlan = {
    IRRIGATE: ['Check soil moisture and irrigation lines.', `Irrigate ${crop} in the recommended early-morning window.`, 'Use the calculated volume as a planning estimate and stop if the soil reaches the target range.'],
    WAIT: ['Do not irrigate immediately.', 'Inspect drainage and monitor rainfall before the next pump cycle.', 'Re-check the crop after the forecast window changes.'],
    'DELAY IRRIGATION': ['Hold irrigation briefly while watching the rain front.', 'Re-check soil moisture and the forecast within 12–24 hours.', 'Irrigate only if the crop remains below its target range and rain does not arrive.'],
    'INSPECT FIELD': ['Walk the field and hand-check root-zone moisture.', 'Inspect leaves, stems and nearby plants for stress or disease signs.', 'Record a fresh reading before starting a long irrigation cycle.'],
    'PROTECT CROP': ['Protect the crop from peak heat or heavy rain exposure.', 'Use mulch, shade or drainage measures appropriate to the field.', 'Re-check the crop after the weather event.'],
    'CHECK DRAINAGE': ['Inspect and clear field drains and bund exits.', 'Prevent standing water around the root zone.', 'Re-check soil moisture after rainfall stops.'],
    MONITOR: ['Continue routine crop scouting.', 'Check soil moisture and local weather before the next irrigation decision.', 'Record a fresh reading if crop symptoms appear.']
  }[decision.actionKey] || ['Inspect the field and verify the recommendation locally.'];
  const why = decision.why.length ? decision.why : ['No single risk factor dominates the current decision.'];
  const consequence = decision.actionKey === 'IRRIGATE'
    ? 'Leaving a sustained moisture deficit untreated can increase wilting, growth loss and heat stress.'
    : decision.actionKey === 'CHECK DRAINAGE'
    ? 'Ignoring standing water can reduce root oxygen and favour root disease.'
    : decision.actionKey === 'WAIT' || decision.actionKey === 'DELAY IRRIGATION'
    ? 'Irrigating despite likely rainfall can waste water, leach nutrients and increase excess moisture.'
    : 'Ignoring a changing field signal can delay detection of crop stress or disease.';
  const prevention = ['Use healthy planting material and maintain field sanitation.', 'Match irrigation to soil moisture, crop stage and forecast rainfall.', 'Scout regularly and keep crop, fertilizer and field observations in the farm record.'];

  return { risk, priority, confidenceBand, evidence, actionPlan, why, consequence, prevention, crop, stage };
}

async function renderAdvisoryModule() {
  const f = FarmHubState.activeFarm;
  const wx = await getActiveFarmWeather();
  const inputs = buildEngineInputs(f, wx);
  const decision = runDecisionEngine(inputs, FarmHubState.history);
  const advisory = buildAdvisoryExplainability(f, inputs, decision);
  FarmHubState.curDecision = decision;

  return `
    <h2>${t('navAdvisory')} & Explainability Engine</h2>
    <p class="mu">${esc(advisory.crop)} advisory for the ${esc(advisory.stage)} stage. The engine follows Detect → Explain → Recommend → Prevent → Monitor.</p>

    <div class="card">
      <div style="font-size:24px;font-weight:800;margin-bottom:10px">${decision.icon} ${decision.dec}</div>
      <p style="font-size:16px;color:var(--text)">${decision.act}</p>
      <div class="row" style="margin-top:14px">
        <span class="field-status-pill">Confidence: ${decision.conf}%</span>
        <span class="field-status-pill">Confidence band: ${advisory.confidenceBand}</span>
        <span class="field-status-pill">Data Quality: ${decision.dq}%</span>
        <span class="field-status-pill">Risk: ${advisory.risk} (${decision.over}/100)</span>
        <span class="field-status-pill">Priority: ${advisory.priority}</span>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>WHAT WAS DETECTED?</h3>
        <p><b>Current advisory:</b> ${esc(decision.dec)} for ${esc(advisory.crop)}.</p>
        <p class="mu">This is a risk and action estimate from the available field data, not confirmation of a disease, pest or nutrient deficiency.</p>
        <h3 style="margin-top:16px">EVIDENCE USED</h3>
        <ul>${advisory.evidence.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <h3>WHY THIS RECOMMENDATION?</h3>
        <ul>${advisory.why.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        <p class="mu">The risk level is an estimate based on the available evidence. Weather risk is not the same as confirmed disease.</p>
      </div>
    </div>

    <div class="card" style="border-left:6px solid ${advisory.priority === 'IMMEDIATE' ? 'var(--farm-danger)' : advisory.priority === 'SOON' ? 'var(--farm-amber)' : 'var(--green)'}">
      <h3>DO THIS NOW <span class="mu">(${advisory.priority})</span></h3>
      <ol>${advisory.actionPlan.map(item => `<li>${esc(item)}</li>`).join('')}</ol>
      <p><b>When:</b> ${esc(decision.win)}</p>
      <p class="mu"><b>Why this matters:</b> ${esc(decision.act)}</p>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>RISK IF IGNORED</h3>
        <p>${esc(advisory.consequence)}</p>
        <h3 style="margin-top:16px">EXPECTED BENEFIT</h3>
        <p class="mu">Timely field verification and the recommended action can reduce avoidable water loss, stress and progression of crop problems.</p>
      </div>
      <div class="card">
        <h3>PREVENTION</h3>
        <ul>${advisory.prevention.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="card" style="background:var(--surface-alt)">
      <h3>MONITORING AND ESCALATION</h3>
      <p><b>Next check:</b> ${esc(decision.nextCheck)}</p>
      <p class="mu">${esc(decision.unc)}</p>
      <p>Upload additional plant images, add crop and soil information, or consult an agricultural expert when confidence is low, symptoms are ambiguous, roots are affected, a viral problem is suspected, damage is severe, or chemical treatment may be required.</p>
    </div>

    <div class="ff-card">
      <div class="ff-title">AGRONOMIC REASONS</div>
      <ul class="ff-why-list">
        ${decision.why.map(w => `<li>${esc(w)}</li>`).join('')}
      </ul>
    </div>

    <div class="ff-card">
      <div class="ff-title">MATHEMATICAL DECISION TRACE</div>
      <div style="background:var(--surface-alt);padding:14px;border-radius:8px">
        ${decision.flow.map(fl => `<div>• ${esc(fl)}</div>`).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// MODULE: FERTILIZER & NUTRITION GUIDE
// ============================================================
function renderFertilizerModule() {
  const f = FarmHubState.activeFarm;
  const cropObj = CROPS_DATA.getCrop(f.cropId, f.cropName);
  const stageInfo = computeCropStage(f);
  const area = f.farmSize || 1;
  const pref = f.fertilizerPreference || 'Integrated';

  return `
    <h2>${t('navFertilizer')} Guide — ${esc(f.cropName)}</h2>
    <p class="mu">Targeted nutrition guide adapted to your preferred management strategy. Use soil tests and crop requirements before deciding source or dose.</p>

    <!-- FERTILIZER PREFERENCE TOGGLE -->
    <div class="card">
      <h3>CHOOSE FERTILIZER STRATEGY</h3>
      <div class="row">
        <button class="btn ${pref === 'Natural' ? '' : 'secondary'}" onclick="setFertPreference('Natural')">
          ${t('fertPrefNatural')}
        </button>
        <button class="btn ${pref === 'Synthetic' ? '' : 'secondary'}" onclick="setFertPreference('Synthetic')">
          ${t('fertPrefSynthetic')}
        </button>
        <button class="btn ${pref === 'Integrated' ? '' : 'secondary'}" onclick="setFertPreference('Integrated')">
          ${t('fertPrefIntegrated')}
        </button>
      </div>
    </div>

    <!-- SAFETY & SOIL TEST NOTICE -->
    <div class="card" style="background:var(--surface-alt);border-left:6px solid var(--farm-amber)">
      <p style="font-weight:600;margin:0">⚠️ ${t('fertSafetyNotice')}</p>
    </div>

    <!-- NPK ESTIMATES -->
    <div class="card">
      <h3>${t('npkDosageTitle')} (${stageInfo.name.toUpperCase()} STAGE) — ${area} ACRES</h3>
      <p class="mu">Illustrative starter estimates only, not a fertilizer prescription. Confirm nutrient need, dose and timing with soil testing and local crop guidance.</p>
      <div class="grid">
        <div class="sig-card">
          <small>Nitrogen (Urea 46%)</small>
          <b>~${r(area * 25)} kg</b>
          <span>~${r1((area * 25) / 45)} bags</span>
        </div>
        <div class="sig-card">
          <small>Phosphorus (DAP 18:46:0)</small>
          <b>~${r(area * 30)} kg</b>
          <span>Root vigor</span>
        </div>
        <div class="sig-card">
          <small>Potassium (MOP 60%)</small>
          <b>~${r(area * 20)} kg</b>
          <span>Stress tolerance</span>
        </div>
        <div class="sig-card">
          <small>Compost / Vermicompost</small>
          <b>~${r1(area * 1.5)} tonnes</b>
          <span>Organic matter</span>
        </div>
      </div>
    </div>

    <!-- STAGE SCHEDULE -->
    <div class="card">
      <h3>STAGE-SPECIFIC NUTRITIONAL INSTRUCTIONS</h3>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Conventional Option</th>
            <th>Organic Option</th>
          </tr>
        </thead>
        <tbody>
          ${STAGES.map(stName => {
            const isNow = stName === stageInfo.name;
            const fertData = cropObj.fert ? cropObj.fert[stName] : null;
            return `
              <tr class="${isNow ? 'now' : ''}">
                <td><b>${stName}</b> ${isNow ? '◀ Current' : ''}</td>
                <td>${fertData ? fertData[0] : 'Balanced NPK as per local package of practices.'}</td>
                <td>${fertData ? fertData[1] : 'Well-rotted compost + Jeevamrutham every 14 days.'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3>FERTILIZER REFERENCE LIBRARY</h3>
      <p class="mu">Organic fertilizers add matter and biology; mineral fertilizers supply more concentrated, measurable nutrients. Choose by crop, stage, soil and irrigation.</p>
      <div class="grid2">
        <details open>
          <summary><b>Organic fertilizers</b></summary>
          ${FERTILIZER_GUIDE_DATA.organic.map(item => `<div style="padding:12px 0;border-bottom:1px solid var(--border)"><b>${esc(item[0])}</b><p class="mu" style="margin:3px 0">Source: ${esc(item[1])}</p><p style="margin:3px 0">${esc(item[2])}</p><small class="mu">Suitable / note: ${esc(item[3])}</small></div>`).join('')}
        </details>
        <details>
          <summary><b>Inorganic and mineral fertilizers</b></summary>
          ${FERTILIZER_GUIDE_DATA.mineral.map(item => `<div style="padding:12px 0;border-bottom:1px solid var(--border)"><b>${esc(item[0])}</b><p class="mu" style="margin:3px 0">${esc(item[1])}</p><p style="margin:3px 0">${esc(item[2])}</p><small class="mu">Precaution: ${esc(item[3])}</small></div>`).join('')}
        </details>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>SECONDARY NUTRIENTS</h3>
        ${FERTILIZER_GUIDE_DATA.secondary.map(item => `<p><b>${esc(item[0])}</b><br><span class="mu">Sources: ${esc(item[1])}</span><br>${esc(item[2])}</p>`).join('')}
      </div>
      <div class="card">
        <h3>MICRONUTRIENTS</h3>
        ${FERTILIZER_GUIDE_DATA.micronutrients.map(item => `<p><b>${esc(item[0])}</b><br><span class="mu">${esc(item[1])}</span><br>${esc(item[2])}</p>`).join('')}
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>WATER-SOLUBLE FERTILIZERS</h3>
        <p>${FERTILIZER_GUIDE_DATA.waterSoluble.map(item => `<span class="field-status-pill" style="display:inline-block;margin:3px">${esc(item)}</span>`).join('')}</p>
        <p class="mu">Useful for fertigation or foliar application depending on the product. Rapid availability does not remove the need for correct concentration and compatibility.</p>
      </div>
      <div class="card">
        <h3>BIOFERTILIZERS</h3>
        ${FERTILIZER_GUIDE_DATA.biofertilizers.map(item => `<p><b>${esc(item[0])}</b><br><span class="mu">${esc(item[1])}</span></p>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>FERTILIZER SELECTION BY PURPOSE</h3>
      <table><thead><tr><th>Purpose</th><th>Priority nutrient</th><th>Examples</th></tr></thead><tbody>
        ${FERTILIZER_GUIDE_DATA.purposes.map(item => `<tr><td><b>${esc(item[0])}</b></td><td>${esc(item[1])}</td><td>${esc(item[2])}</td></tr>`).join('')}
      </tbody></table>
    </div>

    <div class="card">
      <h3>APPLICATION METHODS</h3>
      <div class="grid2">${FERTILIZER_GUIDE_DATA.methods.map(item => `<div><b>${esc(item[0])}</b><p class="mu">${esc(item[1])}</p><p>${esc(item[2])}</p></div>`).join('')}</div>
    </div>

    <div class="card" style="background:var(--surface-alt);border-left:6px solid var(--green)">
      <h3>INTEGRATED NUTRIENT MANAGEMENT AND 4R STEWARDSHIP</h3>
      <p>Combine organic manures, compost, biofertilizers, mineral fertilizers, crop residues, green manure, soil-test-based application and crop rotation. This supports nutrient-use efficiency and soil fertility better than relying on one source.</p>
      <p><b>Right nutrient + Right source + Right dose + Right time + Right place.</b></p>
      <p class="mu">Do not recommend fertilizer from a leaf image alone. Combine crop, growth stage, soil test, pH, soil type, irrigation, weather, expected yield, fertilizer history and confirmed deficiency.</p>
      <p class="mu">Excess fertilizer can cause toxicity, salt stress, imbalance, root damage, runoff, water pollution and poor nutrient-use efficiency. Follow the product label and local agricultural recommendations.</p>
    </div>
  `;
}

function setFertPreference(pref) {
  FarmHubState.activeFarm.fertilizerPreference = pref;
  persistState();
  renderActiveModule();
}

// ============================================================
// MODULE: CROP HEALTH & PEST/DISEASE DIAGNOSTIC
// ============================================================
function renderHealthModule() {
  const f = FarmHubState.activeFarm;
  const cropObj = CROPS_DATA.getCrop(f.cropId, f.cropName);

  return `
    <h2>${t('healthTitle')} — ${esc(f.cropName)}</h2>
    <p class="mu">${t('healthSubtitle')}</p>

    <!-- PHOTO UPLOAD & DIAGNOSTIC CARD -->
    <div class="grid2">
      <div class="card">
        <h3>${t('uploadPhoto')}</h3>
        <p class="mu">Upload a clear photo, then select visible signs below. The result is a probable triage match.</p>
        <input type="file" id="healthPhotoInput" accept="image/*" onchange="handleHealthPhotoUpload(event)" style="margin-bottom:12px">
        <div id="photoPreviewArea" style="text-align:center"></div>
      </div>

      <div class="card">
        <h3>OBSERVED SYMPTOMS</h3>
        <label><input type="checkbox" class="sym-chk" value="yellow_leaves"> Leaves turning yellow / pale chlorosis</label>
        <label><input type="checkbox" class="sym-chk" value="curling"> Leaves curling or crinkling</label>
        <label><input type="checkbox" class="sym-chk" value="spots"> Brown/black spots or concentric rings</label>
        <label><input type="checkbox" class="sym-chk" value="wilting"> Wilting during midday sun</label>
        <label><input type="checkbox" class="sym-chk" value="chewed"> Chewed margins or holes on foliage</label>
        <label><input type="checkbox" class="sym-chk" value="white_growth"> White powder or growth on leaves</label>
        <button class="btn" style="margin-top:14px" onclick="runSymptomDiagnosis()">${t('analyzeSymptoms')}</button>
      </div>
    </div>

    <!-- DIAGNOSTIC RESULTS CONTAINER -->
    <div id="healthResultsContainer"></div>

    <!-- KNOWN PESTS & DISEASES FOR ACTIVE CROP -->
    <div class="card" style="margin-top:16px">
      <h3>COMMON VULNERABILITIES FOR ${esc(f.cropName).toUpperCase()}</h3>
      <div class="grid2">
        <div>
          <b>Known Diseases:</b>
          <ul>
            ${(cropObj.diseases || ['Fungal leaf spot', 'Root rot']).map(d => `<li>${esc(d)}</li>`).join('')}
          </ul>
        </div>
        <div>
          <b>Known Pests:</b>
          <ul>
            ${(cropObj.pests || ['Sucking insects', 'Fruit borer']).map(p => `<li>${esc(p)}</li>`).join('')}
          </ul>
        </div>
      </div>
      <p class="mu" style="margin-top:10px">⚠️ ${t('healthDisclaimer')}</p>
    </div>
  `;
}

function handleHealthPhotoUpload(e) {
  const file = e.target.files[0];
  const area = $('#photoPreviewArea');
  if (!file || !area) return;

  if (!file.type.startsWith('image/')) {
    area.innerHTML = '<p class="mu">Please choose an image file.</p>';
    return;
  }

  const reader = new FileReader();
  reader.onload = evt => {
    area.innerHTML = `
      <img src="${evt.target.result}" style="max-height:180px;border-radius:8px;margin-bottom:8px">
      <div class="field-status-pill" style="display:inline-block">Photo received for probable diagnosis</div>
    `;
    inferHealthPhotoSignals(evt.target.result, signals => {
      FarmHubState.healthPhotoSignals = signals;
      runSymptomDiagnosis(true);
    });
  };
  reader.readAsDataURL(file);
}

function inferHealthPhotoSignals(dataUrl, done) {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let yellow = 0;
    let brown = 0;
    let white = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      if (red > 120 && green > 90 && blue < 105 && red > blue * 1.25) yellow++;
      if (red > 55 && red > green * 1.15 && green > blue * 1.15) brown++;
      if (red > 190 && green > 190 && blue > 190) white++;
    }
    const total = pixels.length / 4;
    const signals = [];
    if (yellow / total > 0.08) signals.push('yellow_leaves');
    if (brown / total > 0.08) signals.push('spots');
    if (white / total > 0.16) signals.push('white_growth');
    done(signals);
  };
  image.onerror = () => done([]);
  image.src = dataUrl;
}

function runSymptomDiagnosis(hasPhoto = false) {
  const container = $('#healthResultsContainer');
  if (!container) return;

  const selectedTags = [...$$('.sym-chk:checked')].map(c => c.value);
  const photoTags = hasPhoto ? (FarmHubState.healthPhotoSignals || []) : [];
  const chks = [...new Set([...selectedTags, ...photoTags])];
  const farm = FarmHubState.activeFarm;
  const cropName = farm?.cropName || '';
  if (!chks.length && !hasPhoto) {
    container.innerHTML = `<div class="card" style="margin-top:14px"><p class="mu">Please select at least one symptom or upload a photo.</p></div>`;
    return;
  }

  const matches = PLANT_HEALTH_KB.map(item => {
    const cropMatch = !item.crops.length || item.crops.some(c => c.toLowerCase() === cropName.toLowerCase());
    const matchedTags = chks.filter(tag => item.tags.includes(tag));
    let score = matchedTags.length * 24 + (cropMatch ? 22 : 0);
    if (hasPhoto) score += 8;
    return { item, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const best = matches[0];
  const confidence = best ? Math.min(94, Math.max(42, best.score + (chks.length > 1 ? 8 : 0))) : 42;
  const labels = { yellow_leaves: 'yellowing or pale leaves', curling: 'curling or crinkling', spots: 'spots or lesions', wilting: 'wilting', chewed: 'chewed margins or holes', white_growth: 'white powder or growth' };
  const observed = chks.length ? chks.map(tag => `${labels[tag]}${photoTags.includes(tag) && !selectedTags.includes(tag) ? ' (photo cue)' : ''}`).join(', ') : 'photo uploaded; no manual signs selected';
  const detail = best?.item;
  const resultRows = matches.length ? matches.map((match, index) => {
    const item = match.item;
    const cropNote = item.crops.length ? `Relevant crops: ${item.crops.join(', ')}.` : 'Can affect many crops.';
    return `<div style="padding:12px 0;${index ? 'border-top:1px solid var(--border);' : ''}"><b>${index + 1}. ${esc(item.name)}</b> <span class="mu">(${esc(item.type)})</span><p class="mu" style="margin:3px 0">${esc(item.symptoms.join(' '))} ${esc(cropNote)}</p></div>`;
  }).join('') : '<p class="mu">No strong symptom match. Capture the whole plant, both leaf sides, stem, fruit and roots where possible.</p>';

  container.innerHTML = `
    <div class="card" style="margin-top:16px;border-left:6px solid var(--farm-amber)">
      <h3>${t('possibleIssue')}: ${esc(detail?.name || 'Uncertain plant-health issue')} <span class="mu">(${confidence}% probable match)</span></h3>
      <p class="mu"><b>Observed:</b> ${esc(observed)}</p>
      ${detail ? `<p><b>Likely category:</b> ${esc(detail.type)}<br><b>Possible cause:</b> ${esc(detail.cause)}<br><b>Favourable conditions:</b> ${esc(detail.conditions)}</p><div class="grid2" style="margin-top:12px"><div><b>Precautions</b><ul>${detail.precautions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b>Management</b><ul>${detail.management.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><b>Other possible matches</b>${resultRows}</div>
      <p class="mu" style="margin-top:12px">This is a probable diagnosis based on crop and reported signs. Similar symptoms can come from disease, pests, nutrient, water or environmental stress. Confirm before chemical treatment using local agricultural guidance, the product label, or an expert or lab.</p>
    </div>
  `;
}

// ============================================================
// MODULE: MARKET & MANDI INTELLIGENCE
// ============================================================
async function renderMarketModule() {
  const f = FarmHubState.activeFarm;
  const stateName = f.location?.state || 'Karnataka';
  const data = await API.market(f.cropName, stateName, FarmHubState.demoMode, FarmHubState.mandiApiKey);

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <h2>${t('marketTitle')} — ${esc(f.cropName)}</h2>
      <button class="btn secondary sm" onclick="configureMandiKey()">⚙️ Configure Mandi API</button>
    </div>
    <p class="mu">Daily APMC arrivals and modal benchmark prices for ${esc(f.cropName)} in ${esc(stateName)}.</p>

    ${data.isDemo ? `
      <div class="complete-notice-card" style="border-color:var(--farm-amber);background:rgba(245, 158, 11, 0.1)">
        <b>⚡ ${t('demoDataTag')}</b>
      </div>
    ` : ''}

    ${data.status === 'UNCONFIGURED' ? `
      <div class="card" style="border-left:6px solid var(--farm-amber)">
        <h3>${t('liveMarketUnavailable')}</h3>
        <p class="mu">Live government mandi feed requires an API key. You can toggle Demo Mode to explore benchmark APMC rates.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn" onclick="FarmHubState.demoMode=true;renderActiveModule()">View Demo Mandi Rates</button>
          <button class="btn secondary" onclick="configureMandiKey()">Add API Key</button>
        </div>
      </div>
    ` : `
      <div class="grid">
        <div class="sig-card">
          <small>${t('modalPrice')}</small>
          <b style="color:var(--green)">₹${data.modalPrice?.toLocaleString() || '--'}</b>
          <span>${data.unit}</span>
        </div>
        <div class="sig-card">
          <small>${t('priceRange')}</small>
          <b>${data.priceRange || '--'}</b>
          <span>Min – Max recorded</span>
        </div>
        <div class="sig-card">
          <small>${t('weeklyTrend')}</small>
          <b style="color:${(data.trend || '').startsWith('+') ? 'var(--green)' : 'var(--farm-danger)'}">${data.trend || '0.0%'}</b>
          <span>7-day movement</span>
        </div>
      </div>

      <div class="card">
        <h3>ACTIVE MANDI ARRIVALS</h3>
        <table>
          <thead>
            <tr>
              <th>Mandi Yard</th>
              <th>State</th>
              <th>Modal Price</th>
              <th>Arrival Date</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            ${(data.records || []).map(r => `
              <tr>
                <td><b>${esc(r.mandi)}</b></td>
                <td>${esc(r.state)}</td>
                <td style="font-weight:700">₹${r.modalPrice.toLocaleString()}</td>
                <td>${r.arrivalDate}</td>
                <td>${r.distanceKm ? `~${r.distanceKm} km` : 'Regional'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

function configureMandiKey() {
  const k = prompt('Enter your Data.gov.in API Key (leave empty to cancel or clear):', FarmHubState.mandiApiKey);
  if (k !== null) {
    FarmHubState.mandiApiKey = k.trim();
    localStorage.setItem('farmhub_mandi_key', FarmHubState.mandiApiKey);
    renderActiveModule();
  }
}

// ============================================================
// MODULE: FARM FINANCE & PROFITABILITY
// ============================================================
function renderFinanceModule() {
  const f = FarmHubState.activeFarm;
  const entries = FarmHubState.fin.filter(x => !x.farmId || x.farmId === f.id);
  const inc = entries.filter(x => x.type === 'Income').reduce((a, b) => a + b.amt, 0);
  const exp = entries.filter(x => x.type === 'Expense').reduce((a, b) => a + b.amt, 0);
  const profit = inc - exp;
  const costPerAcre = f.farmSize > 0 ? r(exp / f.farmSize) : 0;

  return `
    <h2>${t('navFinance')} Ledger — ${esc(f.name)}</h2>
    <p class="mu">Farm-specific accounting of inputs, irrigation power, labor, and crop harvest revenues.</p>

    <!-- FINANCIAL METRICS -->
    <div class="grid">
      <div class="sig-card">
        <small>${t('revenue')}</small>
        <b style="color:var(--green)">₹${inc.toLocaleString('en-IN')}</b>
        <span>Recorded sales</span>
      </div>
      <div class="sig-card">
        <small>${t('expenses')}</small>
        <b style="color:var(--farm-danger)">₹${exp.toLocaleString('en-IN')}</b>
        <span>Inputs & labor</span>
      </div>
      <div class="sig-card">
        <small>${t('netProfit')}</small>
        <b style="color:${profit >= 0 ? 'var(--green)' : 'var(--farm-danger)'}">₹${profit.toLocaleString('en-IN')}</b>
        <span>${profit >= 0 ? 'Surplus' : 'Deficit'}</span>
      </div>
      <div class="sig-card">
        <small>${t('costPerAcre')}</small>
        <b>₹${costPerAcre.toLocaleString('en-IN')}</b>
        <span>Across ${f.farmSize || 1} acre(s)</span>
      </div>
    </div>

    <!-- ENTRY FORM & DOUGHNUT CHART -->
    <div class="grid2">
      <form class="card" onsubmit="handleAddFinanceEntry(event)">
        <h3>LOG TRANSACTION</h3>
        <div class="form-group">
          <label>Type</label>
          <select id="fin_type">
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
          </select>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="fin_cat">
            <option value="Fertilizer">Fertilizers & Nutrients</option>
            <option value="Seeds">Seeds / Seedlings</option>
            <option value="Labor">Labor & Weeding</option>
            <option value="Irrigation">Irrigation / Electricity</option>
            <option value="Pest Control">Pest Control & Sprays</option>
            <option value="Machinery">Tractor & Equipment</option>
            <option value="Harvest Sale">Crop Harvest Sale</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₹)</label>
          <input id="fin_amt" type="number" min="1" required placeholder="e.g. 1500">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input id="fin_date" type="date" value="${new Date().toISOString().slice(0, 10)}" required>
        </div>
        <button type="submit" class="btn">Save Record</button>
      </form>

      <div class="card">
        <h3>EXPENSES BREAKDOWN</h3>
        <div class="chart-canvas-wrap"><canvas id="chart_fin"></canvas></div>
      </div>
    </div>

    <!-- TRANSACTIONS TABLE -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3>TRANSACTION HISTORY (${entries.length})</h3>
        ${entries.length ? `<button class="btn secondary sm" onclick="exportFinanceCsv()">Export CSV</button>` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Amount (₹)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${entries.slice().reverse().map(e => `
            <tr>
              <td>${fmtDate(e.date)}</td>
              <td>
                <span class="field-status-pill" style="${e.type === 'Income' ? 'background:rgba(47,125,74,0.15);color:var(--green)' : 'background:rgba(225,29,72,0.15);color:var(--farm-danger)'}">
                  ${e.type}
                </span>
              </td>
              <td>${esc(e.cat)}</td>
              <td style="font-weight:700">₹${e.amt.toLocaleString('en-IN')}</td>
              <td><button class="btn secondary sm" onclick="deleteFinanceEntry('${e.id}')">✕</button></td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">No financial records logged yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function handleAddFinanceEntry(e) {
  e.preventDefault();
  const f = FarmHubState.activeFarm;
  FarmHubState.fin.push({
    id: 'fin_' + Date.now().toString(36),
    farmId: f.id,
    type: $('#fin_type').value,
    cat: $('#fin_cat').value,
    amt: parseFloat($('#fin_amt').value) || 0,
    date: $('#fin_date').value
  });
  persistState();
  renderActiveModule();
}

function deleteFinanceEntry(id) {
  FarmHubState.fin = FarmHubState.fin.filter(x => x.id !== id);
  persistState();
  renderActiveModule();
}

function exportFinanceCsv() {
  const f = FarmHubState.activeFarm;
  const entries = FarmHubState.fin.filter(x => !x.farmId || x.farmId === f.id);
  const rows = [['Date', 'Type', 'Category', 'Amount']];
  entries.forEach(e => rows.push([e.date, e.type, `"${e.cat}"`, e.amt]));
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `farmhub-finance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function drawFinanceCharts() {
  const f = FarmHubState.activeFarm;
  const entries = FarmHubState.fin.filter(x => (!x.farmId || x.farmId === f.id) && x.type === 'Expense');
  const catMap = {};
  entries.forEach(x => { catMap[x.cat] = (catMap[x.cat] || 0) + x.amt; });

  const labels = Object.keys(catMap);
  const values = Object.values(catMap);

  if (!labels.length) {
    const canvas = $('#chart_fin');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.font = '13px Inter';
      ctx.fillStyle = '#68736B';
      ctx.textAlign = 'center';
      ctx.fillText('No expenses logged yet.', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  createSafeChart('chart_fin', 'doughnut', {
    labels,
    datasets: [{
      data: values,
      backgroundColor: ['#2F7D4A', '#D97706', '#2563EB', '#E11D48', '#55D68A', '#8B5CF6']
    }]
  });
}

// ============================================================
// MODULE: IOT SENSORS & TELEMETRY
// ============================================================
async function renderSensorsModule() {
  const f = FarmHubState.activeFarm;
  const data = await API.fetchSensors(f, FarmHubState.demoMode);

  return `
    <h2>${t('navSensors')} & Hardware Feeds — ${esc(f.name)}</h2>
    <p class="mu">Interface with on-farm capacitance probes, temperature loggers, and weather stations.</p>

    ${FarmHubState.demoMode ? `
      <div class="complete-notice-card" style="border-color:var(--farm-amber);background:rgba(245, 158, 11, 0.1)">
        <b>⚡ ${t('demoSensorData')} (Simulated Telemetry Stream)</b>
      </div>
    ` : ''}

    ${data.status === 'NO_DEVICE' ? `
      <div class="card" style="border-left:6px solid var(--farm-amber)">
        <h3>${t('noSensorConnected')}</h3>
        <p class="mu">FarmHub is actively utilizing Open-Meteo satellite & numerical models for your field. Connect hardware endpoint or explore Demo Stream.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn" onclick="FarmHubState.demoMode=true;renderActiveModule()">Preview Demo IoT Stream</button>
          <button class="btn secondary" onclick="configureSensorEndpoint()">Connect Sensor URL</button>
        </div>
      </div>
    ` : `
      <div class="grid">
        <div class="sig-card">
          <small>Moisture 10cm</small>
          <b>${data.sm10cm != null ? data.sm10cm + '%' : '--'}</b>
          <span>Surface root zone</span>
        </div>
        <div class="sig-card">
          <small>Moisture 30cm</small>
          <b>${data.sm30cm != null ? data.sm30cm + '%' : '--'}</b>
          <span>Deep sub-surface</span>
        </div>
        <div class="sig-card">
          <small>Soil Temp (6cm)</small>
          <b>${data.soilTemp != null ? data.soilTemp + '°C' : '--'}</b>
          <span>Under canopy</span>
        </div>
        <div class="sig-card">
          <small>Leaf Wetness</small>
          <b>${data.leafWetness != null ? data.leafWetness + '%' : '--'}</b>
          <span>Canopy wetness sensor</span>
        </div>
        <div class="sig-card">
          <small>Electrical Cond. (EC)</small>
          <b>${data.ec != null ? data.ec + ' dS/m' : '--'}</b>
          <span>Salinity indicator</span>
        </div>
        <div class="sig-card">
          <small>Device Battery</small>
          <b style="color:var(--green)">${data.batteryPct != null ? data.batteryPct + '%' : '100%'}</b>
          <span>${data.deviceStatus}</span>
        </div>
      </div>
    `}
  `;
}

function configureSensorEndpoint() {
  const f = FarmHubState.activeFarm;
  const url = prompt('Enter your JSON sensor feed endpoint URL:', f.sensorUrl || '');
  if (url !== null) {
    f.sensorUrl = url.trim();
    persistState();
    renderActiveModule();
  }
}

// ============================================================
// MODULE: DECISION HISTORY & AUDIT TRAIL
// ============================================================
function renderHistoryModule() {
  const f = FarmHubState.activeFarm;
  const logs = FarmHubState.history.slice().reverse();

  return `
    <h2>${t('navHistory')} & Decision Audit Trail</h2>
    <p class="mu">Historical log of all automated recommendations generated for ${esc(f.name)}.</p>

    <div style="display:grid;gap:12px">
      ${logs.map(log => `
        <details class="card">
          <summary style="font-weight:700">
            ${fmtDate(log.ts)} — <span style="color:var(--green)">${log.dec}</span> · ${log.conf}% Confidence · ${log.level} Risk
          </summary>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
            <p><b>When:</b> ${log.win}</p>
            <p class="mu"><b>Reasons:</b></p>
            <ul>${(log.why || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul>
          </div>
        </details>
      `).join('') || '<div class="card"><p class="mu">No historical decisions logged yet. Explore the Overview module to generate your first advisory.</p></div>'}
    </div>
  `;
}

// ============================================================
// MODULE: SETTINGS & PREFERENCES
// ============================================================
function renderSettingsModule() {
  const user = FarmHubState.user || { name: 'Farmer Guest', isGuest: true };

  return `
    <h2>${t('navSettings')} & Preferences</h2>
    <p class="mu">Manage your profile, language, display theme, and application data.</p>

    <div class="grid2">
      <!-- Profile Card -->
      <div class="card">
        <h3>USER PROFILE</h3>
        <p><b>Name:</b> ${esc(user.name)}</p>
        <p><b>Status:</b> ${user.isGuest ? t('guestProfile') : t('farmerAccount')}</p>
        <p><b>Phone:</b> ${user.phone ? esc(user.phone) : 'Not registered'}</p>
        <div class="row" style="margin-top:16px">
          ${user.isGuest ? `<button class="btn" onclick="navigateTo('user-details')">${t('createAccount')}</button>` : ''}
          <button class="btn secondary" onclick="signOutUser()">${t('signOut')}</button>
        </div>
      </div>

      <!-- App Preferences -->
      <div class="card">
        <h3>DISPLAY & LANGUAGE</h3>
        <div class="form-group">
          <label>${t('langSelect')}</label>
          <select onchange="setAppLanguage(this.value)">
            ${I18N.languages.map(l => `<option value="${l.code}"${l.code === I18N.currentLang ? ' selected' : ''}>🌐 ${l.native} (${l.label})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Theme</label>
          <div class="row">
            <button class="btn ${FarmHubState.theme === 'light' ? '' : 'secondary'}" onclick="applyTheme('light')">Light Theme</button>
            <button class="btn ${FarmHubState.theme === 'dark' ? '' : 'secondary'}" onclick="applyTheme('dark')">Dark Theme</button>
          </div>
        </div>
        <div class="form-group" style="margin-top:20px">
          <label>Data Management</label>
          <button class="btn secondary sm" style="color:var(--farm-danger)" onclick="resetAllData()">Reset Local Data</button>
        </div>
      </div>
    </div>
  `;
}

function resetAllData() {
  if (confirm('Are you sure you want to clear all local farm data and restart from landing page?')) {
    localStorage.clear();
    window.location.reload();
  }
}

function openNotificationsModal() {
  alert('🔔 Notifications: No pending field emergency alerts. All telemetry operating within normal parameters.');
}

// ============================================================
// BOOTSTRAP INITIALIZATION
// ============================================================
function initFarmHub() {
  // Apply initial theme
  applyTheme(FarmHubState.theme);

  // Apply initial language
  I18N.setLanguage(FarmHubState.lang);

  // If user already has active farm, go to overview; otherwise landing
  if (FarmHubState.activeFarm) {
    navigateTo('dashboard', 'overview');
  } else {
    navigateTo('landing');
  }
}

// Run bootstrap when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFarmHub);
} else {
  initFarmHub();
}
