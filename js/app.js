/*
  AralLoop Campus
  Online web application using Supabase for authentication and persistence.
*/

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS = ['scheduled', 'in-progress', 'completed', 'missed'];
const TASK_STATUS = ['todo', 'doing', 'review', 'done'];
const DIFFICULTY = { easy: 1, moderate: 2, difficult: 3 };

const supabaseClient = window.supabase.createClient(
  window.ARALLOOP_CONFIG.SUPABASE_URL,
  window.ARALLOOP_CONFIG.SUPABASE_ANON_KEY
);

let authUser = null;
let selectedPortalRole = 'Student';
const portalMode = document.body?.dataset?.portal === 'admin' ? 'admin' : 'public';
let app = defaultApp();
let saveTimer = null;
let focusTimer = {
  running: false,
  mode: 'Focus',
  total: 25 * 60,
  left: 25 * 60,
  interval: null
};

function defaultApp() {
  return {
    currentUserId: '',
    activePage: 'dashboard',
    ui: {
      revealedCardId: '',
      activeQuizId: '',
      quizAnswers: {},
      toast: '',
      sidebarCollapsed: false,
      mobileSidebarOpen: false
    },
    users: [],
    subjects: [],
    plannerEvents: [],
    schedules: [],
    reviewers: [],
    flashcards: [],
    quizzes: [],
    projects: [],
    posts: [],
    mindMaps: [],
    codeSnippets: [],
    studyLogs: [],
    focusLogs: []
  };
}

async function loadApp() {
  if (!authUser) {
    app = defaultApp();
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id, name, role, course, active, created_at')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile && profile.active === false) {
    await supabaseClient.auth.signOut();
    authUser = null;
    app = defaultApp();
    throw new Error('This account is deactivated. Contact the AralLoop administrator.');
  }

  const { data: stateRow, error: stateError } = await supabaseClient
    .from('app_states')
    .select('state')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (stateError) throw stateError;

  app = { ...defaultApp(), ...(stateRow?.state || {}) };
  const user = profile ? {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    course: profile.course || '',
    createdAt: profile.created_at
  } : {
    id: authUser.id,
    name: authUser.email?.split('@')[0] || 'Student',
    role: 'Student',
    course: '',
    createdAt: new Date().toISOString()
  };
  app.users = [user];
  app.currentUserId = authUser.id;
}

function saveApp() {
  if (!authUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const state = { ...app, users: [] };
    const { error } = await supabaseClient
      .from('app_states')
      .upsert({
        user_id: authUser.id,
        state,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) console.error('Could not save AralLoop data to Supabase.', error);
  }, 250);
}

async function bootApp() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) console.warn(error.message);
  authUser = data?.user || null;
  if (authUser) {
    try { await loadApp(); } catch (error) { console.error(error); }
  }
  render();
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function datePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function formatBytes(bytes = 0) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function normalizeLink(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch (error) {
    return '';
  }
}

function renderAttachmentFields(label = 'Optional resources') {
  return `
    <div class="attachment-box">
      <div class="attachment-title">📎 ${escapeHtml(label)}</div>
      <p class="help-text">Add a Google Drive link, resource link, or a small local file. Attachment limit: ${formatBytes(MAX_ATTACHMENT_BYTES)} per file.</p>
      <div class="form-row two">
        <div>
          <label>Google Drive / resource link</label>
          <input name="resourceLink" type="url" placeholder="https://drive.google.com/..." />
        </div>
        <div>
          <label>Upload file</label>
          <input name="attachmentFile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp" />
        </div>
      </div>
    </div>
  `;
}

function renderAttachments(attachment) {
  if (!attachment || (!attachment.link && !attachment.file)) return '';
  const parts = [];
  const link = normalizeLink(attachment.link);
  if (link) {
    const isDrive = /drive\.google\.com|docs\.google\.com/i.test(link);
    parts.push(`<a class="attachment-chip" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">🔗 ${isDrive ? 'Open Google Drive link' : 'Open resource link'}</a>`);
  }
  if (attachment.file?.dataUrl) {
    parts.push(`<a class="attachment-chip" href="${escapeHtml(attachment.file.dataUrl)}" download="${escapeHtml(attachment.file.name || 'attachment')}">📎 ${escapeHtml(attachment.file.name || 'Attachment')} <span>${escapeHtml(formatBytes(attachment.file.size))}</span></a>`);
  }
  return parts.length ? `<div class="attachments">${parts.join('')}</div>` : '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the attachment file.'));
    reader.readAsDataURL(file);
  });
}

async function collectAttachment(form) {
  const linkInput = form?.querySelector('[name="resourceLink"]');
  const fileInput = form?.querySelector('[name="attachmentFile"]');
  const link = normalizeLink(linkInput?.value || '');
  const file = fileInput?.files?.[0];
  const attachment = {};

  if (link) attachment.link = link;
  if (file) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is too large. Please use a Google Drive link or upload a file under ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    }
    attachment.file = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl: await fileToDataUrl(file),
      uploadedAt: new Date().toISOString()
    };
  }
  return Object.keys(attachment).length ? attachment : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(dateValue) {
  const target = parseDate(dateValue);
  if (!target) return 9999;
  const start = new Date(todayISO());
  const diff = target.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function currentUser() {
  return app.users.find(user => user.id === app.currentUserId) || null;
}

function userName(id) {
  return app.users.find(user => user.id === id)?.name || 'Unassigned';
}

function subjectName(id) {
  return app.subjects.find(s => s.id === id)?.name || 'No subject';
}

function subjectById(id) {
  return app.subjects.find(s => s.id === id) || null;
}

function setPage(page) {
  app.activePage = page;
  app.ui.mobileSidebarOpen = false;
  saveApp();
  render();
}

function toggleSidebar() {
  app.ui.sidebarCollapsed = !app.ui.sidebarCollapsed;
  saveApp();
  render();
}

function toggleMobileSidebar(force) {
  app.ui.mobileSidebarOpen = typeof force === 'boolean' ? force : !app.ui.mobileSidebarOpen;
  saveApp();
  render();
}

function toast(message) {
  app.ui.toast = message;
  saveApp();
  renderToast();
  setTimeout(() => {
    app.ui.toast = '';
    saveApp();
    renderToast();
  }, 2800);
}

function renderToast() {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  if (!app.ui.toast) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = app.ui.toast;
  document.body.appendChild(node);
}

function navItems() {
  const role = currentUser()?.role || 'Student';
  const items = [
    ['dashboard', '🏡', 'Dashboard'],
    ['focus', '⏱️', 'Focus Loop'],
    ['scheduler', '🗓️', 'Public/Private Scheduler'],
    ['planner', '✅', 'Personal Planner'],
    ['subjects', '📚', 'Subjects'],
    ['reviewers', '📝', 'Reviewers'],
    ['mindmaps', '🗺️', 'Mind Maps'],
    ['coding', '💻', 'Coding Workspace'],
    ['flashcards', '🧠', 'Flashcards'],
    ['quizzes', '🧪', 'Quizzes'],
    ['projects', '🤝', 'Projects'],
    ['community', '📣', 'Community'],
    ['analytics', '📊', 'Analytics'],
    ['settings', '⚙️', 'Backup/Settings']
  ];
  if (role === 'Admin') items.push(['admin', '🛡️', 'Admin CMS']);
  return items;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  if (!currentUser()) {
    root.innerHTML = renderWelcome();
    bindWelcome();
    renderToast();
    return;
  }

  const user = currentUser();
  const collapsedClass = app.ui.sidebarCollapsed ? 'is-collapsed' : '';
  const mobileOpenClass = app.ui.mobileSidebarOpen ? 'mobile-open' : '';
  root.innerHTML = `
    <div class="layout ${collapsedClass} ${mobileOpenClass}">
      <button class="mobile-menu-btn no-print" type="button" data-action="toggleMobileSidebar" aria-label="Open menu">☰</button>
      <div class="sidebar-scrim no-print" data-action="closeMobileSidebar"></div>
      <aside class="sidebar" aria-label="Main navigation">
        <button class="sidebar-toggle no-print" type="button" data-action="toggleSidebar" title="${app.ui.sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}" aria-label="${app.ui.sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}">
          ${app.ui.sidebarCollapsed ? '☰' : '⟨'}
        </button>
        <div class="logo-card">
          <div class="logo-row">
            <div class="logo-mark">A</div>
            <div class="logo-text">
              <div class="logo-title">AralLoop Campus</div>
              <div class="logo-sub">Plan. Review. Collaborate.</div>
            </div>
          </div>
          <div class="profile-pill"><span>${escapeHtml(user.name)}</span><span>${escapeHtml(user.role)}</span></div>
        </div>
        <nav class="nav">
          ${navItems().map(([page, icon, label]) => `
            <button class="${app.activePage === page ? 'active' : ''}" data-page="${page}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
              <span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>
            </button>
          `).join('')}
        </nav>
      </aside>
      <main class="main">
        ${renderTopbar()}
        ${renderPage()}
      </main>
    </div>
  `;

  bindGlobal();
  bindPage();
  renderToast();
  updateTimerFace();
}

function renderWelcome() {
  if (portalMode === 'admin') {
    return `
      <main class="main content-narrow">
        <section class="card soft mt-28">
          <div class="eyebrow">Restricted system administration</div>
          <h1>AralLoop Administration</h1>
          <p class="muted">Authorized administrators only. There is no public Admin registration.</p>
          <div class="card compact mt-16">
            <h2>Admin sign in</h2>
            <form id="signInForm">
              <div class="form-row"><label>Admin Email</label><input name="email" type="email" required /></div>
              <div class="form-row"><label>Password</label><input name="password" type="password" minlength="6" required /></div>
              <div class="form-row"><label>Admin Access Code</label><input name="adminCode" type="password" autocomplete="off" required /><div class="help-text">Enter the administrator access code.</div></div>
              <button class="btn" type="submit">Sign In as Admin</button>
              <button class="btn ghost" type="button" id="forgotPasswordBtn">Forgot Password?</button>
            </form>
          </div>
        </section>
      </main>`;
  }

  return `
    <main class="main content-narrow">
      <section class="card soft mt-28">
        <div class="eyebrow">Online student productivity web application</div>
        <h1>AralLoop Campus</h1>
        <p class="muted">Choose the portal that matches your account.</p>
        <div class="portal-choice actions mt-16">
          <button class="btn ${selectedPortalRole === 'Student' ? '' : 'ghost'}" type="button" data-portal-role="Student">Student Portal</button>
          <button class="btn ${selectedPortalRole === 'Teacher' ? '' : 'ghost'}" type="button" data-portal-role="Teacher">Teacher Portal</button>
        </div>
        <div class="grid two mt-16">
          <div class="card compact">
            <h2>${selectedPortalRole} sign in</h2>
            <form id="signInForm">
              <div class="form-row"><label>Email</label><input name="email" type="email" required /></div>
              <div class="form-row"><label>Password</label><input name="password" type="password" minlength="6" required /></div>
              <button class="btn" type="submit">Sign In</button>
              <button class="btn ghost" type="button" id="forgotPasswordBtn">Forgot Password?</button>
            </form>
          </div>
          <div class="card compact">
            <h2>Create ${selectedPortalRole} account</h2>
            <form id="signUpForm">
              <input type="hidden" name="role" value="${selectedPortalRole}" />
              <div class="form-row"><label>Name</label><input name="name" required /></div>
              <div class="form-row"><label>Email</label><input name="email" type="email" required /></div>
              <div class="form-row"><label>Password</label><input name="password" type="password" minlength="6" required /></div>
              <div class="form-row"><label>Confirm Password</label><input name="confirmPassword" type="password" minlength="6" required /></div>
              ${selectedPortalRole === 'Teacher' ? `<div class="form-row"><label>Teacher Access Code</label><input name="teacherCode" type="password" autocomplete="off" required /><div class="help-text">Enter the teacher code issued by the school/system administrator.</div></div>` : ''}
              <div class="form-row"><label>${selectedPortalRole === 'Teacher' ? 'Department / Faculty' : 'Course / Section'}</label><input name="course" /></div>
              <button class="btn secondary" type="submit">Create ${selectedPortalRole} Account</button>
            </form>
          </div>
        </div>
      </section>
    </main>`;
}

function bindWelcome() {
  document.querySelectorAll('[data-portal-role]').forEach(button => {
    button.addEventListener('click', () => {
      selectedPortalRole = button.dataset.portalRole;
      render();
    });
  });

  bindForm('signInForm', async data => {
    const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) throw error;
    authUser = authData.user;
    await loadApp();
    const actualRole = currentUser()?.role;
    const expectedRole = portalMode === 'admin' ? 'Admin' : selectedPortalRole;
    if (portalMode === 'admin') {
      const { data: codeValid, error: codeError } = await supabaseClient.rpc('verify_admin_access_code', { admin_code: data.adminCode });
      if (codeError || !codeValid) {
        await supabaseClient.auth.signOut();
        authUser = null;
        app = defaultApp();
        render();
        throw new Error('Invalid Admin Access Code.');
      }
    }
    if (actualRole !== expectedRole) {
      await supabaseClient.auth.signOut();
      authUser = null;
      app = defaultApp();
      render();
      throw new Error(`This account is not authorized for the ${expectedRole} portal.`);
    }
    if (portalMode === 'admin') app.activePage = 'admin';
    render();
    toast(`Signed in as ${expectedRole}.`);
  });

  document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
    const email = prompt('Enter your registered email address:');
    if (!email) return;
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) return toast(error.message);
    toast('Password recovery email sent. Check your inbox.');
  });

  bindForm('signUpForm', async data => {
    if (portalMode === 'admin') throw new Error('Admin registration is not available.');
    if (data.password !== data.confirmPassword) throw new Error('Passwords do not match.');
    const requestedRole = selectedPortalRole;
    const { data: authData, error } = await supabaseClient.auth.signUp({ email: data.email, password: data.password });
    if (error) throw error;
    if (!authData.user) throw new Error('Account could not be created.');

    // All public sign-ups begin as Student at the database policy layer.
    const { error: profileError } = await supabaseClient.from('profiles').upsert({
      id: authData.user.id, name: data.name, role: 'Student', course: data.course || ''
    });
    if (profileError) throw profileError;

    if (requestedRole === 'Teacher') {
      if (!authData.session) {
        toast('Teacher account started. Confirm your email, sign in to the Student portal once, then complete teacher verification. For classroom testing, disable email confirmation in Supabase Auth.');
        return;
      }
      const { data: verified, error: verifyError } = await supabaseClient.rpc('claim_teacher_role', { teacher_code: data.teacherCode });
      if (verifyError || !verified) {
        await supabaseClient.auth.signOut();
        throw new Error('Invalid Teacher Access Code. The account was not granted Teacher access.');
      }
    }

    if (!authData.session) {
      toast('Account created. Check your email to confirm the account, then sign in.');
      return;
    }
    authUser = authData.user;
    await loadApp();
    seedStarterData(authUser.id);
    saveApp();
    render();
    toast(`Welcome to the ${requestedRole} Portal.`);
  });
}

function bindGlobal() {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => handleDelete(button.dataset.delete, button.dataset.id));
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', event => {
      if (button.dataset.action === 'toggleSidebar') return toggleSidebar();
      if (button.dataset.action === 'toggleMobileSidebar') return toggleMobileSidebar();
      if (button.dataset.action === 'closeMobileSidebar') return toggleMobileSidebar(false);
      return handleAction(event, button.dataset.action, button);
    });
  });
}

function renderTopbar() {
  const notifications = notificationList();
  return `
    <div class="topbar">
      <div>
        <div class="eyebrow">${escapeHtml(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
        <h1>${pageTitle(app.activePage)}</h1>
        <p class="muted">${pageSubtitle(app.activePage)}</p>
      </div>
      <div class="actions no-print">
        <button class="btn secondary" data-action="generate-daily-plan">✨ Generate Today's Plan</button>
        <button class="btn ghost" data-page="settings">🔔 ${notifications.length} reminders</button>
        <button class="btn ghost" data-action="switch-user">Switch Profile</button>
      </div>
    </div>
  `;
}

function pageTitle(page) {
  const map = {
    dashboard: 'Dashboard', focus: 'Focus Loop', scheduler: 'Public/Private Scheduler', planner: 'Personal Planner', subjects: 'Subjects', reviewers: 'Reviewers', mindmaps: 'Study Mind Maps', coding: 'Coding Workspace', flashcards: 'Flashcards', quizzes: 'Quizzes', projects: 'Group Projects', community: 'Class Community', analytics: 'Analytics', settings: 'Backup & Settings'
  };
  return map[page] || 'AralLoop';
}

function pageSubtitle(page) {
  const map = {
    dashboard: 'See what to study first, what is due soon, and what needs attention.',
    focus: 'Start small, beat procrastination, and keep a No Zero Day streak.',
    scheduler: 'Separate private life plans from public school availability for group meetings.',
    planner: 'Track deadlines, exams, quizzes, study sessions, meetings, and personal commitments.',
    subjects: 'Organize subjects and difficulty so the system can prioritize your study plan.',
    reviewers: 'Write or paste notes, then create flashcards, quizzes, and printable reviewers.',
    mindmaps: 'Create visual concept maps and mark weak topics for focused review.',
    coding: 'Save, explain, and organize code snippets for BSIT subjects without running unsafe code.',
    flashcards: 'Review due cards using a simple spaced repetition schedule.',
    quizzes: 'Take quick rule-based quizzes generated from your reviewer notes.',
    projects: 'Manage group tasks using a simple Monday/Trello-style board.',
    community: 'Post class announcements, updates, resources, and reminders.',
    analytics: 'Check completion, focus time, quiz scores, and review consistency.',
    settings: 'Export/import backup data and manage local prototype profiles.'
  };
  return map[page] || '';
}

function renderPage() {
  const pages = {
    dashboard: renderDashboard,
    focus: renderFocus,
    scheduler: renderScheduler,
    planner: renderPlanner,
    subjects: renderSubjects,
    reviewers: renderReviewers,
    mindmaps: renderMindMaps,
    coding: renderCodingWorkspace,
    flashcards: renderFlashcards,
    quizzes: renderQuizzes,
    projects: renderProjects,
    community: renderCommunity,
    analytics: renderAnalytics,
    settings: renderSettings,
    admin: renderAdminCMS
  };
  return (pages[app.activePage] || renderDashboard)();
}

function renderDashboard() {
  const k = dashboardStats();
  const priorities = smartPriorities().slice(0, 5);
  const riskProfile = academicRiskProfile();
  const topRiskRows = procrastinationRiskRows().slice(0, 3);
  const reminders = notificationList().slice(0, 6);
  const dueCards = dueFlashcards().slice(0, 4);
  const plan = generateDailyPlan(false);

  return `
    <section class="grid four">
      <div class="kpi"><div class="kpi-value">${k.dueToday}</div><div class="kpi-label">Due today</div></div>
      <div class="kpi"><div class="kpi-value">${k.overdue}</div><div class="kpi-label">Overdue</div></div>
      <div class="kpi"><div class="kpi-value">${k.flashcardsDue}</div><div class="kpi-label">Flashcards due</div></div>
      <div class="kpi"><div class="kpi-value">${k.streak}</div><div class="kpi-label">No Zero Day streak</div></div>
    </section>

    <section class="grid two mt-16">
      <div class="card soft">
        <h2>Academic Risk Prediction</h2>
        <p class="help-text">Research feature: estimates academic risk using overdue tasks, missed items, quiz performance, due flashcards, focus consistency, and subject difficulty.</p>
        <div class="item">
          <div class="item-head">
            <div>
              <div class="item-title">${escapeHtml(riskProfile.level)}</div>
              <div class="item-meta">Estimated passing probability: ${riskProfile.passingProbability}% • Study consistency: ${riskProfile.focusMins} focus minutes in 7 days</div>
            </div>
            <span class="tag ${scoreBand(riskProfile.risk)}">Risk ${riskProfile.risk}</span>
          </div>
          <div class="priority-bar mt-10"><span style="width:${riskProfile.risk}%"></span></div>
          <div class="item-meta mt-10">${escapeHtml(riskProfile.interventions[0])}</div>
        </div>
        <div class="list mt-10">
          ${topRiskRows.length ? topRiskRows.map(row => `
            <div class="item compact-row">
              <span>${escapeHtml(row.subject.name)}</span>
              <span class="tag ${scoreBand(row.profile.risk)}">${row.profile.risk}</span>
            </div>
          `).join('') : `<div class="empty">Add subjects and planner data to calculate risk.</div>`}
        </div>
      </div>

      <div class="card soft">
        <h2>Smart Study Priority</h2>
        <p class="help-text">This recommends what to study first using deadline urgency, subject difficulty, pending tasks, quiz scores, and flashcards due.</p>
        <div class="list">
          ${priorities.length ? priorities.map(item => `
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">${escapeHtml(item.subject.name)}</div>
                  <div class="item-meta">${escapeHtml(item.reason)}</div>
                </div>
                <span class="tag ${item.score >= 70 ? 'red' : item.score >= 40 ? 'yellow' : 'green'}">${item.score} pts</span>
              </div>
              <div class="priority-row mt-10">
                <div class="priority-bar"><span style="width:${Math.min(100, item.score)}%"></span></div>
                <button class="btn tiny ghost" data-page="focus">Start</button>
              </div>
            </div>
          `).join('') : `<div class="empty">Add subjects and planner items to see recommendations.</div>`}
        </div>
      </div>

      <div class="card blue">
        <h2>Today's Suggested Study Plan</h2>
        <p class="help-text">Generated from your current tasks and review needs. You can adjust it manually.</p>
        <div class="list">
          ${plan.length ? plan.map(p => `
            <div class="item">
              <div class="item-title">${escapeHtml(p.time)} — ${escapeHtml(p.title)}</div>
              <div class="item-meta">${escapeHtml(p.note)}</div>
            </div>
          `).join('') : `<div class="empty">No plan yet. Add subjects, tasks, or flashcards due.</div>`}
        </div>
      </div>
    </section>

    <section class="grid three mt-16">
      <div class="card">
        <h2>Reminders</h2>
        <div class="list">
          ${reminders.length ? reminders.map(n => `
            <div class="item">
              <span class="tag ${n.kind}">${escapeHtml(n.label)}</span>
              <div class="item-title mt-8">${escapeHtml(n.title)}</div>
              <div class="item-meta">${escapeHtml(n.message)}</div>
            </div>
          `).join('') : `<div class="empty">No urgent reminders right now.</div>`}
        </div>
      </div>
      <div class="card lavender">
        <h2>No Zero Day</h2>
        <p class="help-text">Do one small action today. Small progress is still progress.</p>
        ${renderNoZeroButtons()}
      </div>
      <div class="card">
        <h2>Due Flashcards</h2>
        <div class="list">
          ${dueCards.length ? dueCards.map(c => `
            <div class="item">
              <div class="item-title">${escapeHtml(c.front)}</div>
              <div class="item-meta">${escapeHtml(subjectName(c.subjectId))} • Due ${escapeHtml(c.nextReview)}</div>
            </div>
          `).join('') : `<div class="empty">No flashcards due today. Good job.</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderFocus() {
  const streak = noZeroStreak();
  const totalMinutes = app.focusLogs.filter(l => l.userId === app.currentUserId).reduce((sum, l) => sum + l.minutes, 0);
  return `
    <section class="grid two">
      <div class="card soft">
        <h2>Focus Loop Study Timer</h2>
        <p class="help-text">For procrastination: start with a small block. Even 10 to 25 minutes is enough to build momentum.</p>
        <div class="form-row two no-print">
          <div>
            <label>Focus duration</label>
            <select id="focusDuration">
              <option value="10">10 minutes - start small</option>
              <option value="15">15 minutes - light focus</option>
              <option value="25" selected>25 minutes - classic focus</option>
              <option value="45">45 minutes - deep work</option>
            </select>
          </div>
          <div>
            <label>Subject/Task</label>
            <input id="focusTask" placeholder="Example: Review Math flashcards" />
          </div>
        </div>
        <div class="timer-face" id="timerFace" style="--progress:0%">
          <div>
            <div class="timer-time" id="timerText">${formatSeconds(focusTimer.left)}</div>
            <div class="timer-label" id="timerLabel">${escapeHtml(focusTimer.mode)} session</div>
          </div>
        </div>
        <div class="actions no-print justify-center">
          <button class="btn" data-action="start-focus">Start</button>
          <button class="btn secondary" data-action="pause-focus">Pause</button>
          <button class="btn ghost" data-action="reset-focus">Reset</button>
          <button class="btn warn" data-action="complete-focus">Mark Complete</button>
        </div>
      </div>
      <div class="card lavender">
        <h2>No Zero Day Challenge</h2>
        <p class="help-text">Current streak: <strong>${streak} day(s)</strong>. Choose one small action when you feel stuck.</p>
        ${renderNoZeroButtons()}
        <hr class="soft-line">
        <h3>Task Breakdown Assistant</h3>
        <p class="help-text">Type a big task, then let the app split it into beginner-friendly steps.</p>
        <div class="form-row">
          <input id="breakdownTask" placeholder="Example: Finish research paper" />
        </div>
        <div class="actions">
          <button class="btn secondary" data-action="breakdown-task">Break into small steps</button>
        </div>
        <div id="breakdownResult" class="list mt-12"></div>
      </div>
    </section>

    <section class="grid three mt-16">
      <div class="kpi"><div class="kpi-value">${streak}</div><div class="kpi-label">No Zero Day streak</div></div>
      <div class="kpi"><div class="kpi-value">${totalMinutes}</div><div class="kpi-label">Total focus minutes</div></div>
      <div class="kpi"><div class="kpi-value">${app.studyLogs.filter(l => l.userId === app.currentUserId && l.date === todayISO()).length}</div><div class="kpi-label">Small actions today</div></div>
    </section>
  `;
}

function renderNoZeroButtons() {
  const todayActions = app.studyLogs.filter(l => l.userId === app.currentUserId && l.date === todayISO()).map(l => l.action);
  const actions = [
    ['flashcards5', 'Review 5 flashcards'],
    ['study10', 'Study for 10 minutes'],
    ['task1', 'Complete 1 small task'],
    ['read1', 'Read 1 page of notes']
  ];
  return `
    <div class="nozero-grid no-print">
      ${actions.map(([key, label]) => `
        <button class="nozero-btn ${todayActions.includes(key) ? 'done' : ''}" data-action="nozero" data-nozero="${key}">
          ${todayActions.includes(key) ? '✅' : '⬜'} ${escapeHtml(label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderScheduler() {
  const visibleSchedules = app.schedules.filter(s => s.userId === app.currentUserId || s.visibility === 'public');
  const projects = app.projects.filter(p => p.memberIds.includes(app.currentUserId) || p.ownerId === app.currentUserId);
  return `
    <section class="grid two">
      <form id="scheduleForm" class="card soft">
        <h2>Add Weekly Schedule Block</h2>
        <p class="help-text">Use private for work/family/personal plans. Use public availability to help group leaders find meeting times.</p>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Available, Work, Family time, Study block" /></div>
          <div><label>Day</label><select name="day">${DAYS.map(d => `<option>${d}</option>`).join('')}</select></div>
        </div>
        <div class="form-row three">
          <div><label>Start</label><input name="start" type="time" required value="18:00" /></div>
          <div><label>End</label><input name="end" type="time" required value="19:00" /></div>
          <div><label>Visibility</label><select name="visibility"><option value="private">Private</option><option value="public">Public</option></select></div>
        </div>
        <div class="form-row two">
          <div><label>Type</label><select name="type"><option value="available">Available for meeting</option><option value="busy">Busy / not available</option><option value="study">Study block</option><option value="work">Work/family/personal</option></select></div>
          <div><label>Notes</label><input name="notes" placeholder="Optional" /></div>
        </div>
        <button class="btn" type="submit">Save Schedule Block</button>
      </form>

      <div class="card blue">
        <h2>Group Meeting Time Finder</h2>
        <p class="help-text">Finds common time from public availability. Private schedule details are not shown to the group.</p>
        <div class="form-row two">
          <div><label>Project</label><select id="meetingProject"><option value="all">All local profiles</option>${projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
          <div><label>Day</label><select id="meetingDay">${DAYS.map(d => `<option>${d}</option>`).join('')}</select></div>
        </div>
        <div class="form-row two">
          <div><label>Duration</label><select id="meetingDuration"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></div>
          <div><label>Earliest time</label><input id="meetingEarliest" type="time" value="07:00" /></div>
        </div>
        <div class="actions"><button class="btn secondary" data-action="find-meeting">Find Common Free Time</button></div>
        <div id="meetingResults" class="list mt-12"></div>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Weekly Availability View</h2>
      <div class="week-grid">
        ${DAYS.map(day => `
          <div class="day-card">
            <div class="day-title">${day}</div>
            ${visibleSchedules.filter(s => s.day === day).sort((a,b) => a.start.localeCompare(b.start)).map(s => `
              <div class="event-chip ${s.type === 'available' ? 'done' : s.type === 'busy' ? 'missed' : 'doing'}">
                <strong>${escapeHtml(s.start)}-${escapeHtml(s.end)}</strong><br>
                ${s.userId === app.currentUserId ? escapeHtml(s.title) : (s.type === 'available' ? 'Available' : 'Public block')}<br>
                <span class="muted">${escapeHtml(userName(s.userId))} • ${escapeHtml(s.visibility)}</span>
                ${s.userId === app.currentUserId ? `<div class="actions mt-8"><button class="btn tiny ghost" data-delete="schedule" data-id="${s.id}">Delete</button></div>` : ''}
              </div>
            `).join('') || '<div class="help-text">No visible block.</div>'}
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderPlanner() {
  const events = app.plannerEvents.filter(e => e.userId === app.currentUserId).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  return `
    <section class="grid two">
      <form id="plannerForm" class="card soft">
        <h2>Add Task / Deadline</h2>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Example: Submit database activity" /></div>
          <div><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
        </div>
        <div class="form-row three">
          <div><label>Type</label><select name="type"><option>Task</option><option>Deadline</option><option>Exam</option><option>Quiz</option><option>Study Session</option><option>Meeting</option><option>Personal</option></select></div>
          <div><label>Due date</label><input name="dueDate" type="date" value="${todayISO()}" /></div>
          <div><label>Status</label><select name="status">${STATUS.map(s => `<option value="${s}">${labelStatus(s)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row two">
          <div><label>Priority</label><select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
          <div><label>Estimated minutes</label><input name="minutes" type="number" min="5" step="5" value="30" /></div>
        </div>
        <div class="form-row"><label>Notes</label><textarea name="notes" placeholder="Add details or requirements"></textarea></div>
        ${renderAttachmentFields('Planner attachment / Drive link')}
        <button class="btn" type="submit">Save Planner Item</button>
      </form>

      <div class="card lavender">
        <h2>Color Progress Guide</h2>
        <p class="help-text">This follows your idea: color the block when a task is done or in progress.</p>
        <div class="list">
          <div class="item"><span class="tag gray">Gray</span> Not started / scheduled</div>
          <div class="item"><span class="tag blue">Blue</span> In progress</div>
          <div class="item"><span class="tag green">Green</span> Completed</div>
          <div class="item"><span class="tag red">Red</span> Missed / overdue</div>
        </div>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Planner List</h2>
      <div class="list">
        ${events.length ? events.map(e => `
          <div class="item">
            <div class="item-head">
              <div>
                <span class="tag ${statusTag(e.status)}">${escapeHtml(labelStatus(e.status))}</span>
                <span class="tag ${dueTag(e.dueDate)}">${escapeHtml(dueLabel(e.dueDate))}</span>
                <div class="item-title mt-8">${escapeHtml(e.title)}</div>
                <div class="item-meta">${escapeHtml(e.type)} • ${escapeHtml(subjectName(e.subjectId))} • ${escapeHtml(e.dueDate || 'No date')} • ${escapeHtml(e.minutes || 0)} min</div>
                ${e.notes ? `<div class="help-text">${escapeHtml(e.notes)}</div>` : ''}
                ${renderAttachments(e.attachment)}
              </div>
              <div class="actions">
                ${STATUS.map(s => `<button class="btn tiny ${e.status === s ? '' : 'ghost'}" data-action="set-event-status" data-id="${e.id}" data-status="${s}">${labelStatus(s)}</button>`).join('')}
                <button class="btn tiny danger" data-delete="planner" data-id="${e.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('') : `<div class="empty">No planner items yet.</div>`}
      </div>
    </section>
  `;
}

function renderSubjects() {
  return `
    <section class="grid two">
      <form id="subjectForm" class="card soft">
        <h2>Add Subject</h2>
        <div class="form-row two">
          <div><label>Subject name</label><input name="name" required placeholder="Example: Information Management" /></div>
          <div><label>Code</label><input name="code" placeholder="Example: IM101" /></div>
        </div>
        <div class="form-row three">
          <div><label>Instructor</label><input name="instructor" placeholder="Optional" /></div>
          <div><label>Difficulty</label><select name="difficulty"><option value="easy">Easy</option><option value="moderate" selected>Moderate</option><option value="difficult">Difficult</option></select></div>
          <div><label>Soft color</label><input name="color" type="color" value="#7aa874" /></div>
        </div>
        <button class="btn" type="submit">Save Subject</button>
      </form>
      <div class="card blue">
        <h2>Why difficulty matters</h2>
        <p class="help-text">The Smart Study Priority Score gives more weight to difficult subjects, especially if exams or deadlines are near.</p>
      </div>
    </section>

    <section class="grid three mt-16">
      ${app.subjects.filter(s => s.userId === app.currentUserId).map(s => `
        <div class="card compact">
          <div class="item-head">
            <div>
              <div class="item-title">${escapeHtml(s.name)}</div>
              <div class="item-meta">${escapeHtml(s.code || 'No code')} • ${escapeHtml(s.instructor || 'No instructor')}</div>
            </div>
            <span class="tag" style="background:${escapeHtml(s.color)}22;color:${escapeHtml(s.color)};">${escapeHtml(s.difficulty)}</span>
          </div>
          <div class="actions mt-12"><button class="btn tiny danger" data-delete="subject" data-id="${s.id}">Delete</button></div>
        </div>
      `).join('') || `<div class="empty">No subjects yet. Add your first subject.</div>`}
    </section>
  `;
}

function renderReviewers() {
  const reviewers = app.reviewers.filter(r => r.userId === app.currentUserId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <section class="grid two">
      <form id="reviewerForm" class="card soft">
        <h2>Create Reviewer / Module</h2>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Example: Chapter 1 Reviewer" /></div>
          <div><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
        </div>
        <div class="form-row"><label>Notes / Reviewer Content</label><textarea name="content" required placeholder="Paste or type your lesson notes here. Use short sentences for better rule-based flashcards and quizzes."></textarea></div>
        ${renderAttachmentFields('Reviewer source file / Drive link')}
        <button class="btn" type="submit">Save Reviewer</button>
      </form>

      <div class="card lavender">
        <h2>Free AI Workflow</h2>
        <p class="help-text">No paid API needed. Copy your notes, paste into Gemini/ChatGPT manually, then paste the output back here.</p>
        <button class="btn secondary" data-action="copy-ai-template">Copy Gemini/ChatGPT Prompt Template</button>
        <hr class="soft-line">
        <h3>Prompt idea</h3>
        <p class="help-text">Ask AI to create: summary, 15 flashcards, 10 multiple choice questions, and a 7-day study plan.</p>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Saved Reviewers</h2>
      <div class="list">
        ${reviewers.length ? reviewers.map(r => `
          <div class="item">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(r.title)}</div>
                <div class="item-meta">${escapeHtml(subjectName(r.subjectId))} • ${escapeHtml(new Date(r.createdAt).toLocaleString())}</div>
                <p class="help-text">${escapeHtml(r.content.slice(0, 220))}${r.content.length > 220 ? '...' : ''}</p>
                ${renderAttachments(r.attachment)}
              </div>
              <div class="actions">
                <button class="btn tiny secondary" data-action="generate-cards" data-id="${r.id}">Generate Flashcards</button>
                <button class="btn tiny secondary" data-action="generate-quiz" data-id="${r.id}">Generate Quiz</button>
                <button class="btn tiny ghost" data-action="print-reviewer" data-id="${r.id}">Print/PDF</button>
                <button class="btn tiny danger" data-delete="reviewer" data-id="${r.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('') : `<div class="empty">No reviewers yet.</div>`}
      </div>
    </section>
  `;
}


function renderMindMaps() {
  const maps = app.mindMaps.filter(m => m.userId === app.currentUserId);
  return `
    <section class="grid two">
      <form id="mindMapForm" class="card soft">
        <h2>Create Study Mind Map</h2>
        <p class="help-text">Use this to visually break down lessons into topics and subtopics. Each node can have a mastery level so weak areas can be prioritized.</p>
        <div class="form-row two">
          <div><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
          <div><label>Mind Map Title</label><input name="title" required placeholder="Example: Database Normalization" /></div>
        </div>
        <div class="form-row">
          <label>Nodes / concepts</label>
          <textarea name="nodes" required placeholder="Write one concept per line. Use > for subtopics. Example:\nDatabase Management\n> ERD\n> SQL\n> Normalization\n>> 1NF\n>> 2NF\n>> 3NF"></textarea>
        </div>
        <div class="form-row two">
          <div><label>Weak Topic / Focus Node</label><input name="weakNode" placeholder="Example: 3NF" /></div>
          <div><label>Linked Reviewer</label><select name="reviewerId"><option value="">None</option>${reviewerOptions()}</select></div>
        </div>
        <button class="btn" type="submit">Save Mind Map</button>
      </form>

      <div class="card blue">
        <h2>How Students Use It</h2>
        <p class="help-text">Students create a visual summary of a subject, color weak areas, then connect concepts to reviewers, flashcards, quizzes, and code notes.</p>
        <div class="mindmap-sample">
          <div class="map-node root">Database Management</div>
          <div class="map-children">
            <div class="map-node mastered">ERD</div>
            <div class="map-node mastered">SQL</div>
            <div class="map-node weak">Normalization</div>
          </div>
          <div class="map-children small">
            <div class="map-node">1NF</div><div class="map-node weak">2NF</div><div class="map-node weak">3NF</div>
          </div>
        </div>
        <p class="help-text"><strong>Legend:</strong> Green = mastered, Yellow = needs review, Red = weak topic.</p>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Saved Study Mind Maps</h2>
      <div class="list">
        ${maps.length ? maps.map(map => renderMindMapCard(map)).join('') : `<div class="empty">No mind maps yet. Create one from your subject lessons.</div>`}
      </div>
    </section>
  `;
}

function renderMindMapCard(map) {
  const nodes = parseMindMapNodes(map.nodes || '');
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(map.title)}</div>
          <div class="item-meta">${escapeHtml(subjectName(map.subjectId))} • Weak focus: ${escapeHtml(map.weakNode || 'None')} • ${map.reviewerId ? 'Linked to reviewer' : 'No linked reviewer'}</div>
        </div>
        <button class="btn tiny danger" data-delete="mindmap" data-id="${map.id}">Delete</button>
      </div>
      <div class="mindmap-tree">
        ${nodes.map(n => `<div class="map-line level-${n.level}"><span class="map-node ${map.weakNode && n.text.toLowerCase().includes(String(map.weakNode).toLowerCase()) ? 'weak' : n.level === 0 ? 'root' : 'review'}">${escapeHtml(n.text)}</span></div>`).join('')}
      </div>
      <div class="actions mt-10">
        <button class="btn tiny secondary" data-action="create-mindmap-flashcards" data-id="${map.id}">Create Flashcards from Nodes</button>
        <button class="btn tiny ghost" data-page="reviewers">Open Reviewers</button>
        <button class="btn tiny ghost" data-page="quizzes">Open Quizzes</button>
      </div>
    </div>
  `;
}

function renderCodingWorkspace() {
  const snippets = app.codeSnippets.filter(c => c.userId === app.currentUserId);
  const languages = ['Java', 'Python', 'C++', 'JavaScript', 'SQL', 'HTML/CSS', 'PHP', 'Other'];
  return `
    <section class="grid two">
      <form id="codeSnippetForm" class="card soft">
        <h2>Save Code Snippet</h2>
        <p class="help-text">This is a coding notebook, not a compiler. It helps BSIT students store, explain, and review code safely.</p>
        <div class="form-row two">
          <div><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
          <div><label>Language</label><select name="language">${languages.map(l => `<option>${l}</option>`).join('')}</select></div>
        </div>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Example: Binary Search" /></div>
          <div><label>Topic / Category</label><input name="topic" placeholder="Example: Searching Algorithms" /></div>
        </div>
        <div class="form-row"><label>Code</label><textarea name="code" required class="code-input" placeholder="Paste your code here"></textarea></div>
        <div class="form-row"><label>Explanation / Notes</label><textarea name="notes" placeholder="Explain what the code does, important steps, and common errors."></textarea></div>
        <button class="btn" type="submit">Save Code Note</button>
      </form>

      <div class="card blue">
        <h2>BSIT Learning Use</h2>
        <div class="list">
          <div class="item"><div class="item-title">Code Notebook</div><div class="item-meta">Save Java, Python, C++, JavaScript, SQL, HTML/CSS, PHP, and other snippets.</div></div>
          <div class="item"><div class="item-title">Code Notes</div><div class="item-meta">Explain syntax, logic, variables, loops, conditions, database queries, and algorithms.</div></div>
          <div class="item"><div class="item-title">Connected Study Flow</div><div class="item-meta">Link code topics to subjects, mind maps, reviewers, flashcards, and quizzes.</div></div>
        </div>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Saved Code Workspace</h2>
      <div class="list">
        ${snippets.length ? snippets.map(sn => `
          <div class="item code-card">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(sn.title)}</div>
                <div class="item-meta">${escapeHtml(subjectName(sn.subjectId))} • ${escapeHtml(sn.language)} • ${escapeHtml(sn.topic || 'No category')}</div>
              </div>
              <div class="actions"><button class="btn tiny secondary" data-action="create-code-flashcard" data-id="${sn.id}">Make Flashcard</button><button class="btn tiny danger" data-delete="code" data-id="${sn.id}">Delete</button></div>
            </div>
            <pre class="code-block"><code>${escapeHtml(sn.code)}</code></pre>
            ${sn.notes ? `<div class="code-note"><strong>Notes:</strong> ${escapeHtml(sn.notes)}</div>` : ''}
          </div>
        `).join('') : `<div class="empty">No code snippets yet. Save reusable code for your programming subjects.</div>`}
      </div>
    </section>
  `;
}

function renderFlashcards() {
  const due = dueFlashcards();
  const allCards = app.flashcards.filter(c => c.userId === app.currentUserId).sort((a,b) => (a.nextReview || '').localeCompare(b.nextReview || ''));
  const current = due[0];
  return `
    <section class="grid two">
      <form id="flashcardForm" class="card soft">
        <h2>Add Flashcard</h2>
        <div class="form-row"><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
        <div class="form-row"><label>Front / Question</label><textarea name="front" required placeholder="Question or term"></textarea></div>
        <div class="form-row"><label>Back / Answer</label><textarea name="back" required placeholder="Answer or explanation"></textarea></div>
        <button class="btn" type="submit">Save Flashcard</button>
      </form>
      <div class="card blue">
        <h2>Spaced Repetition Review</h2>
        ${current ? `
          <div class="flashcard">${app.ui.revealedCardId === current.id ? escapeHtml(current.back) : escapeHtml(current.front)}</div>
          <div class="actions justify-center mt-14">
            <button class="btn secondary" data-action="reveal-card" data-id="${current.id}">Reveal Answer</button>
            <button class="btn ghost" data-action="review-card" data-id="${current.id}" data-rating="hard">Hard: tomorrow</button>
            <button class="btn ghost" data-action="review-card" data-id="${current.id}" data-rating="good">Good: 3 days</button>
            <button class="btn ghost" data-action="review-card" data-id="${current.id}" data-rating="easy">Easy: 7 days</button>
          </div>
        ` : `<div class="empty">No cards due today. You can add more cards or generate from reviewers.</div>`}
      </div>
    </section>

    <section class="card mt-16">
      <h2>All Flashcards</h2>
      <div class="list">
        ${allCards.length ? allCards.map(c => `
          <div class="item">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(c.front)}</div>
                <div class="item-meta">${escapeHtml(subjectName(c.subjectId))} • Next review: ${escapeHtml(c.nextReview)} • Reviewed: ${c.reviewedCount || 0}</div>
              </div>
              <button class="btn tiny danger" data-delete="flashcard" data-id="${c.id}">Delete</button>
            </div>
          </div>
        `).join('') : `<div class="empty">No flashcards yet.</div>`}
      </div>
    </section>
  `;
}

function renderQuizzes() {
  const quizzes = app.quizzes.filter(q => q.userId === app.currentUserId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const active = quizzes.find(q => q.id === app.ui.activeQuizId) || quizzes[0];
  return `
    <section class="grid two">
      <form id="manualQuizForm" class="card soft">
        <h2>Create Manual Quiz</h2>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Example: Midterm Practice Quiz" /></div>
          <div><label>Subject</label><select name="subjectId">${subjectOptions()}</select></div>
        </div>
        <div class="form-row"><label>Questions</label><textarea name="questions" placeholder="One question per line. Example: What is DBMS?"></textarea></div>
        <button class="btn" type="submit">Create Quiz</button>
      </form>
      <div class="card blue">
        <h2>Take Quiz</h2>
        ${active ? renderQuizTaking(active) : `<div class="empty">No quiz yet. Generate one from a reviewer or create manually.</div>`}
      </div>
    </section>

    <section class="card mt-16">
      <h2>Saved Quizzes</h2>
      <div class="list">
        ${quizzes.length ? quizzes.map(q => `
          <div class="item">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(q.title)}</div>
                <div class="item-meta">${escapeHtml(subjectName(q.subjectId))} • ${q.questions.length} question(s) • Best score: ${q.bestScore ?? 'Not taken'}</div>
              </div>
              <div class="actions">
                <button class="btn tiny secondary" data-action="open-quiz" data-id="${q.id}">Open</button>
                <button class="btn tiny danger" data-delete="quiz" data-id="${q.id}">Delete</button>
              </div>
            </div>
          </div>
        `).join('') : `<div class="empty">No quizzes yet.</div>`}
      </div>
    </section>
  `;
}

function renderQuizTaking(quiz) {
  return `
    <div class="item-title">${escapeHtml(quiz.title)}</div>
    <div class="item-meta">${escapeHtml(subjectName(quiz.subjectId))}</div>
    <div class="list mt-12">
      ${quiz.questions.map((q, index) => `
        <div class="item">
          <strong>${index + 1}. ${escapeHtml(q.question)}</strong>
          ${q.options.map(opt => `
            <label class="score-choice">
              <input type="radio" name="quiz_${quiz.id}_${index}" value="${escapeHtml(opt)}" ${app.ui.quizAnswers[`${quiz.id}_${index}`] === opt ? 'checked' : ''} data-action="quiz-answer" data-quiz="${quiz.id}" data-index="${index}" data-answer="${escapeHtml(opt)}" />
              ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
      `).join('')}
    </div>
    <div class="actions mt-12">
      <button class="btn" data-action="submit-quiz" data-id="${quiz.id}">Submit Quiz</button>
    </div>
  `;
}

function renderProjects() {
  const projects = app.projects.filter(p => p.ownerId === app.currentUserId || p.memberIds.includes(app.currentUserId));
  const activeProject = projects[0];
  return `
    <section class="grid two">
      <form id="projectForm" class="card soft">
        <h2>Create Group Project</h2>
        <div class="form-row"><label>Project name</label><input name="name" required placeholder="Example: IM Database System Project" /></div>
        <div class="form-row"><label>Description</label><textarea name="description" placeholder="Project goal, requirements, or notes"></textarea></div>
        ${renderAttachmentFields('Project brief / folder link')}
        <div class="form-row"><label>Members</label><select name="members" multiple size="${Math.min(5, Math.max(3, app.users.length))}">${app.users.map(u => `<option value="${u.id}" ${u.id === app.currentUserId ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`).join('')}</select></div>
        <button class="btn" type="submit">Create Project</button>
      </form>
      <form id="projectTaskForm" class="card blue">
        <h2>Add Project Task</h2>
        ${projects.length ? `
          <div class="form-row two">
            <div><label>Project</label><select name="projectId">${projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
            <div><label>Assign to</label><select name="assigneeId">${app.users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
          </div>
          <div class="form-row two">
            <div><label>Task title</label><input name="title" required placeholder="Example: Create ERD" /></div>
            <div><label>Due date</label><input name="dueDate" type="date" value="${datePlus(3)}" /></div>
          </div>
          <div class="form-row two">
            <div><label>Priority</label><select name="priority"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
            <div><label>Status</label><select name="status">${TASK_STATUS.map(s => `<option value="${s}">${taskLabel(s)}</option>`).join('')}</select></div>
          </div>
          ${renderAttachmentFields('Task file / Drive link')}
          <button class="btn" type="submit">Add Task</button>
        ` : `<div class="empty">Create a project first.</div>`}
      </form>
    </section>

    <section class="mt-16">
      ${projects.length ? projects.map(project => renderProjectBoard(project)).join('') : `<div class="card"><div class="empty">No group projects yet. Create one to use the board.</div></div>`}
    </section>
  `;
}

function renderProjectBoard(project) {
  const tasks = project.tasks || [];
  return `
    <div class="card mb-16">
      <div class="item-head">
        <div>
          <h2>${escapeHtml(project.name)}</h2>
          <p class="help-text">${escapeHtml(project.description || 'No description')}</p>
          ${renderAttachments(project.attachment)}
          <div class="actions">
            ${project.memberIds.map(id => `<span class="tag blue">${escapeHtml(userName(id))}</span>`).join('')}
          </div>
        </div>
        <button class="btn tiny danger" data-delete="project" data-id="${project.id}">Delete Project</button>
      </div>
      <div class="kanban mt-16">
        ${TASK_STATUS.map(status => `
          <div class="kanban-col">
            <div class="kanban-title">${taskLabel(status)}</div>
            ${tasks.filter(t => t.status === status).map(t => `
              <div class="task-card">
                <div class="item-title">${escapeHtml(t.title)}</div>
                <div class="item-meta">${escapeHtml(userName(t.assigneeId))} • Due ${escapeHtml(t.dueDate)} • ${escapeHtml(t.priority)}</div>
                ${renderAttachments(t.attachment)}
                <div class="actions mt-10">
                  ${TASK_STATUS.map(s => `<button class="btn tiny ${s === t.status ? '' : 'ghost'}" data-action="set-project-task-status" data-project="${project.id}" data-task="${t.id}" data-status="${s}">${taskLabel(s)}</button>`).join('')}
                  <button class="btn tiny danger" data-action="delete-project-task" data-project="${project.id}" data-task="${t.id}">Delete</button>
                </div>
              </div>
            `).join('') || `<div class="help-text">No task.</div>`}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCommunity() {
  const posts = app.posts.filter(p => p.audience === 'public' || p.userId === app.currentUserId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <section class="grid two">
      <form id="postForm" class="card soft">
        <h2>Post Announcement / Update</h2>
        <div class="form-row two">
          <div><label>Title</label><input name="title" required placeholder="Example: Quiz moved to Friday" /></div>
          <div><label>Audience</label><select name="audience"><option value="public">Public / Class</option><option value="private">Personal note</option></select></div>
        </div>
        <div class="form-row"><label>Message</label><textarea name="message" required placeholder="Write announcement or reminder"></textarea></div>
        ${renderAttachmentFields('Announcement file / Google Drive link')}
        <button class="btn" type="submit">Post Update</button>
      </form>
      <div class="card lavender">
        <h2>Teacher/Community Ideas</h2>
        <p class="help-text">Future version: teachers can create class groups, upload modules, assign deadlines, and monitor progress summaries.</p>
        <div class="list">
          <div class="item">Teacher-created study plan import</div>
          <div class="item">Class announcements and resources</div>
          <div class="item">Student organization project tracking</div>
        </div>
      </div>
    </section>

    <section class="card mt-16">
      <h2>Community Feed</h2>
      <div class="list">
        ${posts.length ? posts.map(p => `
          <div class="item">
            <div class="item-head">
              <div>
                <span class="tag ${p.audience === 'public' ? 'green' : 'gray'}">${escapeHtml(p.audience)}</span>
                <div class="item-title mt-8">${escapeHtml(p.title)}</div>
                <div class="item-meta">Posted by ${escapeHtml(userName(p.userId))} • ${escapeHtml(new Date(p.createdAt).toLocaleString())}</div>
                <p class="help-text">${escapeHtml(p.message)}</p>
                ${renderAttachments(p.attachment)}
              </div>
              ${p.userId === app.currentUserId ? `<button class="btn tiny danger" data-delete="post" data-id="${p.id}">Delete</button>` : ''}
            </div>
          </div>
        `).join('') : `<div class="empty">No posts yet.</div>`}
      </div>
    </section>
  `;
}

function renderAnalytics() {
  const stats = dashboardStats();
  const subjectRows = smartPriorities();
  const riskRows = procrastinationRiskRows();
  const focusMinutes = app.focusLogs.filter(l => l.userId === app.currentUserId).reduce((sum, l) => sum + l.minutes, 0);
  const quizzes = app.quizzes.filter(q => q.userId === app.currentUserId && typeof q.bestScore === 'number');
  const avgQuiz = quizzes.length ? Math.round(quizzes.reduce((s,q) => s + q.bestScore, 0) / quizzes.length) : 0;
  const completedProjectTasks = app.projects.flatMap(p => p.tasks || []).filter(t => t.status === 'done').length;
  return `
    <section class="grid four">
      <div class="kpi"><div class="kpi-value">${stats.completed}</div><div class="kpi-label">Completed planner tasks</div></div>
      <div class="kpi"><div class="kpi-value">${focusMinutes}</div><div class="kpi-label">Focus minutes</div></div>
      <div class="kpi"><div class="kpi-value">${avgQuiz}%</div><div class="kpi-label">Average best quiz score</div></div>
      <div class="kpi"><div class="kpi-value">${completedProjectTasks}</div><div class="kpi-label">Project tasks done</div></div>
    </section>
    <section class="grid two mt-16">
      <div class="card soft">
        <h2>Subject Priority Analytics</h2>
        <div class="list">
          ${subjectRows.length ? subjectRows.map(row => `
            <div class="item">
              <div class="priority-row">
                <div>
                  <div class="item-title">${escapeHtml(row.subject.name)}</div>
                  <div class="item-meta">${escapeHtml(row.reason)}</div>
                  <div class="priority-bar mt-8"><span style="width:${Math.min(100,row.score)}%"></span></div>
                </div>
                <strong>${row.score}</strong>
              </div>
            </div>
          `).join('') : `<div class="empty">Add subjects and tasks to see analytics.</div>`}
        </div>
      </div>
      <div class="card lavender">
        <h2>Procrastination Risk Model</h2>
        <p class="help-text">This is the strongest capstone enhancement: a measurable risk model with recommended interventions per subject.</p>
        <div class="list">
          ${riskRows.length ? riskRows.map(row => `
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">${escapeHtml(row.subject.name)}</div>
                  <div class="item-meta">Pass probability ${row.profile.passingProbability}% • Quiz avg ${row.profile.avgQuiz}% • ${row.profile.dueSoon} due soon • ${row.profile.overdue} overdue</div>
                </div>
                <span class="tag ${scoreBand(row.profile.risk)}">${escapeHtml(row.profile.level)} ${row.profile.risk}</span>
              </div>
              <div class="priority-bar mt-8"><span style="width:${row.profile.risk}%"></span></div>
              <div class="item-meta mt-8">${escapeHtml(row.profile.interventions.join(' '))}</div>
            </div>
          `).join('') : `<div class="empty">Add subjects, tasks, quizzes, and focus logs to activate risk analytics.</div>`}
        </div>
      </div>
      <div class="card blue">
        <h2>Study Reflection</h2>
        <p class="help-text">Use this after a study session to monitor what works and what distracts you.</p>
        <form id="reflectionForm">
          <div class="form-row"><label>What did I finish today?</label><textarea name="finished"></textarea></div>
          <div class="form-row"><label>What distracted me?</label><textarea name="distraction"></textarea></div>
          <div class="form-row"><label>What should I continue tomorrow?</label><textarea name="tomorrow"></textarea></div>
          <button class="btn" type="submit">Save Reflection as Personal Post</button>
        </form>
      </div>
    </section>
  `;
}

function renderSettings() {
  const reminders = notificationList();
  return `
    <section class="grid two">
      <div class="card soft">
        <h2>Notifications / Reminders</h2>
        <div class="list">
          ${reminders.length ? reminders.map(n => `
            <div class="item"><span class="tag ${n.kind}">${escapeHtml(n.label)}</span><div class="item-title mt-8">${escapeHtml(n.title)}</div><div class="item-meta">${escapeHtml(n.message)}</div></div>
          `).join('') : `<div class="empty">No reminders right now.</div>`}
        </div>
      </div>
      <div class="card blue">
        <h2>Backup Data</h2>
        <p class="help-text">Your primary data is stored through Supabase. JSON export/import remains available as an additional user backup option.</p>
        <div class="actions">
          <button class="btn" data-action="export-backup">Export Backup JSON</button>
          <label class="btn secondary" for="importBackup">Import Backup</label>
          <input id="importBackup" type="file" accept="application/json" class="hidden" />
        </div>
        <hr class="soft-line">
        <h3>Profiles</h3>
        <div class="list">
          ${app.users.map(u => `
            <div class="item"><div class="item-head"><div><div class="item-title">${escapeHtml(u.name)}</div><div class="item-meta">${escapeHtml(u.role)} • ${escapeHtml(u.course || 'No course')}</div></div><button class="btn tiny ghost" data-action="select-user" data-id="${u.id}">Use Profile</button></div></div>
          `).join('')}
        </div>

        <hr class="soft-line">
        <button class="btn danger" data-action="reset-all">Reset My Application Data</button>
      </div>
    </section>
  `;
}

function bindLegacyWelcomeUnused() {
  document.getElementById('profileForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const user = {
      id: uid('user'),
      name: form.get('profileName') || document.getElementById('profileName')?.value || 'Student',
      role: document.getElementById('profileRole')?.value || 'Student',
      course: document.getElementById('profileCourse')?.value || '',
      createdAt: new Date().toISOString()
    };
    app.users.push(user);
    app.currentUserId = user.id;
    seedStarterData(user.id);
    saveApp();
    render();
    toast('Welcome to AralLoop Campus.');
  });
}

function bindGlobal() {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => handleDelete(button.dataset.delete, button.dataset.id));
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', event => {
      if (button.dataset.action === 'toggleSidebar') return toggleSidebar();
      if (button.dataset.action === 'toggleMobileSidebar') return toggleMobileSidebar();
      if (button.dataset.action === 'closeMobileSidebar') return toggleMobileSidebar(false);
      return handleAction(event, button.dataset.action, button);
    });
  });
}



function renderAdminCMS() {
  const user = currentUser();
  if (!user || user.role !== 'Admin') return `<section class="card"><h2>Access denied</h2><p class="muted">Administrator access is required.</p></section>`;
  return `
    <section class="page-head"><div><div class="eyebrow">Administration</div><h1>Admin CMS</h1><p class="muted">Manage published AralLoop content and registered profiles.</p></div></section>
    <div class="grid two">
      <section class="card"><h2>Publish announcement</h2>
        <form id="cmsAnnouncementForm">
          <div class="form-row"><label>Title</label><input name="title" required></div>
          <div class="form-row"><label>Audience</label><select name="audience"><option value="all">All users</option><option value="student">Students</option><option value="teacher">Teachers</option></select></div>
          <div class="form-row"><label>Content</label><textarea name="body" rows="5" required></textarea></div>
          <button class="btn" type="submit">Publish</button>
        </form>
      </section>
      <section class="card"><h2>System management</h2><p class="muted">User activation, role changes, password-recovery requests, and account deletion require administrator-authorized Supabase functions. The database and Edge Function scaffolding are included in this project.</p><div id="adminUsers"><p class="muted">Open Supabase or connect the included admin Edge Function to manage users securely.</p></div></section>
    </div>`;
}

function bindPage() {
  bindForm('cmsAnnouncementForm', async data => {
    if (currentUser()?.role !== 'Admin') throw new Error('Administrator access is required.');
    const { error } = await supabaseClient.from('cms_content').insert({
      type: 'announcement', title: data.title, body: data.body, audience: data.audience,
      status: 'published', created_by: authUser.id
    });
    if (error) throw error;
    toast('Announcement published.');
  });
  bindForm('subjectForm', data => {
    app.subjects.push({
      id: uid('subject'), userId: app.currentUserId,
      name: data.name, code: data.code, instructor: data.instructor,
      difficulty: data.difficulty, color: data.color || '#7aa874', createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Subject saved.');
  });

  bindForm('plannerForm', async (data, form) => {
    const attachment = await collectAttachment(form);
    app.plannerEvents.push({
      id: uid('event'), userId: app.currentUserId,
      title: data.title, subjectId: data.subjectId, type: data.type,
      dueDate: data.dueDate, status: data.status, priority: data.priority,
      minutes: Number(data.minutes || 30), notes: data.notes, attachment, createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Planner item saved.');
  });

  bindForm('scheduleForm', data => {
    if (data.end <= data.start) return toast('End time must be after start time.');
    app.schedules.push({
      id: uid('sched'), userId: app.currentUserId,
      title: data.title, day: data.day, start: data.start, end: data.end,
      visibility: data.visibility, type: data.type, notes: data.notes, createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Schedule block saved.');
  });

  bindForm('reviewerForm', async (data, form) => {
    const attachment = await collectAttachment(form);
    app.reviewers.push({
      id: uid('reviewer'), userId: app.currentUserId,
      title: data.title, subjectId: data.subjectId, content: data.content, attachment,
      createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Reviewer saved.');
  });

  bindForm('mindMapForm', data => {
    app.mindMaps.push({ id: uid('mindmap'), userId: app.currentUserId, subjectId: data.subjectId, title: data.title, nodes: data.nodes, weakNode: data.weakNode, reviewerId: data.reviewerId, createdAt: new Date().toISOString() });
    saveApp(); render(); toast('Study mind map saved.');
  });

  bindForm('codeSnippetForm', data => {
    app.codeSnippets.push({ id: uid('code'), userId: app.currentUserId, subjectId: data.subjectId, language: data.language, title: data.title, topic: data.topic, code: data.code, notes: data.notes, createdAt: new Date().toISOString() });
    saveApp(); render(); toast('Code snippet saved.');
  });

  bindForm('flashcardForm', data => {
    app.flashcards.push({
      id: uid('card'), userId: app.currentUserId,
      subjectId: data.subjectId, front: data.front, back: data.back,
      nextReview: todayISO(), reviewedCount: 0, createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Flashcard saved.');
  });

  bindForm('manualQuizForm', data => {
    const lines = String(data.questions || '').split('\n').map(x => x.trim()).filter(Boolean);
    const questions = lines.length ? lines.map(line => ({ question: line, options: ['I know this', 'I need to review this'], correct: 'I know this' })) : [];
    app.quizzes.push({
      id: uid('quiz'), userId: app.currentUserId,
      title: data.title, subjectId: data.subjectId, questions,
      createdAt: new Date().toISOString(), bestScore: null
    });
    saveApp(); render(); toast('Quiz created.');
  });

  bindForm('projectForm', async (data, form) => {
    const attachment = await collectAttachment(form);
    const select = document.querySelector('#projectForm select[name="members"]');
    const memberIds = Array.from(select?.selectedOptions || []).map(o => o.value);
    if (!memberIds.includes(app.currentUserId)) memberIds.push(app.currentUserId);
    app.projects.push({
      id: uid('project'), ownerId: app.currentUserId,
      name: data.name, description: data.description, attachment,
      memberIds, tasks: [], createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Project created.');
  });

  bindForm('projectTaskForm', async (data, form) => {
    const attachment = await collectAttachment(form);
    const project = app.projects.find(p => p.id === data.projectId);
    if (!project) return;
    project.tasks = project.tasks || [];
    project.tasks.push({
      id: uid('ptask'), title: data.title, assigneeId: data.assigneeId,
      dueDate: data.dueDate, priority: data.priority, status: data.status, attachment,
      createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Project task added.');
  });

  bindForm('postForm', async (data, form) => {
    const attachment = await collectAttachment(form);
    app.posts.push({
      id: uid('post'), userId: app.currentUserId,
      title: data.title, audience: data.audience, message: data.message, attachment,
      createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Post saved.');
  });

  bindForm('reflectionForm', data => {
    app.posts.push({
      id: uid('post'), userId: app.currentUserId, audience: 'private',
      title: `Study Reflection - ${todayISO()}`,
      message: `Finished: ${data.finished || 'N/A'}\nDistracted by: ${data.distraction || 'N/A'}\nContinue tomorrow: ${data.tomorrow || 'N/A'}`,
      createdAt: new Date().toISOString()
    });
    saveApp(); render(); toast('Reflection saved as a private note.');
  });

  document.querySelectorAll('[data-action="quiz-answer"]').forEach(input => {
    input.addEventListener('change', () => {
      app.ui.quizAnswers[`${input.dataset.quiz}_${input.dataset.index}`] = input.dataset.answer;
      saveApp();
    });
  });

  document.getElementById('importBackup')?.addEventListener('change', importBackup);
}

function bindForm(id, callback) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await callback(data, form);
    } catch (error) {
      toast(error.message || 'Something went wrong. Please try again.');
    }
  });
}

function handleAction(event, action, button) {
  if (action === 'sign-out') {
    supabaseClient.auth.signOut().then(() => {
      authUser = null;
      app = defaultApp();
      render();
    });
    return;
  }
  if (action === 'switch-user') {
    app.activePage = 'settings'; saveApp(); render(); return;
  }
  if (action === 'generate-daily-plan') {
    const plan = generateDailyPlan(true);
    toast(plan.length ? 'Today\'s study plan generated in your planner.' : 'Add tasks or flashcards first to generate a study plan.');
    return;
  }
  if (action === 'start-focus') return startFocus();
  if (action === 'pause-focus') return pauseFocus();
  if (action === 'reset-focus') return resetFocus();
  if (action === 'complete-focus') return completeFocus();
  if (action === 'nozero') return completeNoZero(button.dataset.nozero);
  if (action === 'breakdown-task') return breakdownTask();
  if (action === 'find-meeting') return findMeetingTimes();
  if (action === 'set-event-status') return setEventStatus(button.dataset.id, button.dataset.status);
  if (action === 'create-mindmap-flashcards') return createMindMapFlashcards(button.dataset.id);
  if (action === 'create-code-flashcard') return createCodeFlashcard(button.dataset.id);
  if (action === 'generate-cards') return generateCardsFromReviewer(button.dataset.id);
  if (action === 'generate-quiz') return generateQuizFromReviewer(button.dataset.id);
  if (action === 'print-reviewer') return printReviewer(button.dataset.id);
  if (action === 'copy-ai-template') return copyAiTemplate();
  if (action === 'reveal-card') { app.ui.revealedCardId = button.dataset.id; saveApp(); render(); return; }
  if (action === 'review-card') return reviewCard(button.dataset.id, button.dataset.rating);
  if (action === 'open-quiz') { app.ui.activeQuizId = button.dataset.id; saveApp(); render(); return; }
  if (action === 'submit-quiz') return submitQuiz(button.dataset.id);
  if (action === 'set-project-task-status') return setProjectTaskStatus(button.dataset.project, button.dataset.task, button.dataset.status);
  if (action === 'delete-project-task') return deleteProjectTask(button.dataset.project, button.dataset.task);
  if (action === 'export-backup') return exportBackup();
  if (action === 'reset-all') return resetAll();
}

function handleDelete(type, id) {
  if (!confirm('Delete this item?')) return;
  const maps = {
    subject: 'subjects', planner: 'plannerEvents', schedule: 'schedules', reviewer: 'reviewers', mindmap: 'mindMaps', code: 'codeSnippets', flashcard: 'flashcards', quiz: 'quizzes', project: 'projects', post: 'posts'
  };
  const key = maps[type];
  if (!key) return;
  app[key] = app[key].filter(item => item.id !== id);
  saveApp(); render(); toast('Deleted.');
}


function reviewerOptions() {
  const reviewers = app.reviewers.filter(r => r.userId === app.currentUserId);
  return reviewers.map(r => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join('');
}

function parseMindMapNodes(text = '') {
  return String(text).split('\n').map(line => {
    const raw = line.trim();
    if (!raw) return null;
    const marker = raw.match(/^>+/)?.[0] || '';
    return { level: Math.min(marker.length, 4), text: raw.replace(/^>+\s*/, '') };
  }).filter(Boolean);
}

function createMindMapFlashcards(id) {
  const map = app.mindMaps.find(m => m.id === id);
  if (!map) return;
  const nodes = parseMindMapNodes(map.nodes).filter(n => n.text);
  const created = nodes.slice(0, 20).map(n => ({
    id: uid('card'), userId: app.currentUserId, subjectId: map.subjectId,
    front: `Explain the concept: ${n.text}`,
    back: `${n.text} is part of ${map.title}. Add your own explanation from class notes.`,
    nextReview: todayISO(), reviewedCount: 0, createdAt: new Date().toISOString()
  }));
  app.flashcards.push(...created);
  saveApp(); render(); toast(`${created.length} flashcards created from the mind map.`);
}

function createCodeFlashcard(id) {
  const sn = app.codeSnippets.find(c => c.id === id);
  if (!sn) return;
  app.flashcards.push({
    id: uid('card'), userId: app.currentUserId, subjectId: sn.subjectId,
    front: `What does this ${sn.language} snippet do? ${sn.title}`,
    back: sn.notes || `Review the saved code snippet for ${sn.title}.`,
    nextReview: todayISO(), reviewedCount: 0, createdAt: new Date().toISOString()
  });
  saveApp(); render(); toast('Flashcard created from code snippet.');
}

function subjectOptions() {
  const subjects = app.subjects.filter(s => s.userId === app.currentUserId);
  if (!subjects.length) return '<option value="">No subject yet</option>';
  return subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function labelStatus(status) {
  return ({ scheduled: 'Scheduled', 'in-progress': 'In Progress', completed: 'Completed', missed: 'Missed' })[status] || status;
}

function statusTag(status) {
  return ({ scheduled: 'gray', 'in-progress': 'blue', completed: 'green', missed: 'red' })[status] || 'gray';
}

function taskLabel(status) {
  return ({ todo: 'To Do', doing: 'Doing', review: 'For Review', done: 'Done' })[status] || status;
}

function dueLabel(date) {
  const d = daysUntil(date);
  if (d < 0) return 'Overdue';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d <= 7) return 'This week';
  return 'Upcoming';
}

function dueTag(date) {
  const d = daysUntil(date);
  if (d < 0) return 'red';
  if (d <= 1) return 'yellow';
  if (d <= 7) return 'blue';
  return 'gray';
}

function dashboardStats() {
  const events = app.plannerEvents.filter(e => e.userId === app.currentUserId);
  return {
    dueToday: events.filter(e => daysUntil(e.dueDate) === 0 && e.status !== 'completed').length,
    overdue: events.filter(e => daysUntil(e.dueDate) < 0 && e.status !== 'completed').length,
    completed: events.filter(e => e.status === 'completed').length,
    flashcardsDue: dueFlashcards().length,
    streak: noZeroStreak()
  };
}

function notificationList() {
  const notes = [];
  const events = app.plannerEvents.filter(e => e.userId === app.currentUserId && e.status !== 'completed');
  events.forEach(e => {
    const d = daysUntil(e.dueDate);
    if (d < 0) notes.push({ kind: 'red', label: 'Overdue', title: e.title, message: `${e.type} for ${subjectName(e.subjectId)} was due ${Math.abs(d)} day(s) ago.` });
    else if (d === 0) notes.push({ kind: 'yellow', label: 'Due Today', title: e.title, message: `${e.type} for ${subjectName(e.subjectId)} is due today.` });
    else if (d === 1) notes.push({ kind: 'blue', label: 'Tomorrow', title: e.title, message: `${e.type} for ${subjectName(e.subjectId)} is due tomorrow.` });
  });
  const dueCards = dueFlashcards();
  if (dueCards.length) notes.push({ kind: 'purple', label: 'Flashcards', title: `${dueCards.length} card(s) due`, message: 'Review your due flashcards today to maintain memory.' });
  const todayActions = app.studyLogs.filter(l => l.userId === app.currentUserId && l.date === todayISO()).length;
  if (!todayActions) notes.push({ kind: 'green', label: 'No Zero Day', title: 'Do one small action', message: 'Review 5 flashcards or study for 10 minutes to keep momentum.' });
  return notes;
}

function dueFlashcards() {
  return app.flashcards
    .filter(c => c.userId === app.currentUserId && (!c.nextReview || c.nextReview <= todayISO()))
    .sort((a, b) => (a.nextReview || '').localeCompare(b.nextReview || ''));
}

function noZeroStreak() {
  const logs = app.studyLogs.filter(l => l.userId === app.currentUserId).map(l => l.date);
  const unique = [...new Set(logs)];
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = datePlus(-i);
    if (unique.includes(d)) streak += 1;
    else break;
  }
  return streak;
}


function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function scoreBand(score, inverse = false) {
  const value = clamp(score);
  if (inverse) return value >= 75 ? 'green' : value >= 50 ? 'yellow' : 'red';
  return value >= 70 ? 'red' : value >= 40 ? 'yellow' : 'green';
}

function average(values, fallback = 0) {
  const nums = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : fallback;
}

function userPlannerEvents(userId = app.currentUserId) {
  return app.plannerEvents.filter(e => e.userId === userId);
}

function subjectQuizAverage(subjectId) {
  const scores = app.quizzes
    .filter(q => q.userId === app.currentUserId && q.subjectId === subjectId && typeof q.bestScore === 'number')
    .map(q => q.bestScore);
  return average(scores, null);
}

function recentFocusMinutes(days = 7) {
  const dates = new Set(Array.from({ length: days }, (_, i) => datePlus(-i)));
  return app.focusLogs
    .filter(l => l.userId === app.currentUserId && dates.has((l.createdAt || '').slice(0, 10)))
    .reduce((sum, l) => sum + Number(l.minutes || 0), 0);
}

function academicRiskProfile(subjectId = '') {
  const subjects = subjectId
    ? app.subjects.filter(s => s.userId === app.currentUserId && s.id === subjectId)
    : app.subjects.filter(s => s.userId === app.currentUserId);
  const events = userPlannerEvents().filter(e => !subjectId || e.subjectId === subjectId);
  const activeEvents = events.filter(e => e.status !== 'completed');
  const overdue = activeEvents.filter(e => daysUntil(e.dueDate) < 0).length;
  const dueSoon = activeEvents.filter(e => daysUntil(e.dueDate) >= 0 && daysUntil(e.dueDate) <= 3).length;
  const missed = events.filter(e => e.status === 'missed').length;
  const scheduled = events.filter(e => e.status === 'scheduled' || e.status === 'in-progress').length;
  const completed = events.filter(e => e.status === 'completed').length;
  const completionRate = events.length ? completed / events.length : 0.5;
  const avgDifficulty = average(subjects.map(s => DIFFICULTY[s.difficulty] || 2), 2);
  const dueCards = dueFlashcards().filter(c => !subjectId || c.subjectId === subjectId).length;
  const quizAverages = subjects.map(s => subjectQuizAverage(s.id)).filter(v => v !== null);
  const avgQuiz = average(quizAverages, 85);
  const focusMins = recentFocusMinutes(7);
  const inactivityPenalty = focusMins < 60 ? 12 : focusMins < 120 ? 6 : 0;

  const risk = clamp(
    overdue * 18 +
    missed * 12 +
    dueSoon * 8 +
    scheduled * 2 +
    Math.max(0, (1 - completionRate) * 20) +
    Math.max(0, (75 - avgQuiz) * 0.7) +
    dueCards * 2 +
    avgDifficulty * 6 +
    inactivityPenalty
  );

  const passingProbability = clamp(100 - risk + Math.min(12, completionRate * 12) + Math.min(8, focusMins / 30), 5, 99);
  const level = risk >= 70 ? 'High Risk' : risk >= 40 ? 'Moderate Risk' : 'Low Risk';
  const interventions = [];
  if (overdue) interventions.push('Clear overdue academic tasks first.');
  if (dueSoon) interventions.push('Reserve a focused review block for items due within 3 days.');
  if (avgQuiz < 75) interventions.push('Retake quizzes and review weak topics before adding new material.');
  if (dueCards) interventions.push('Complete due flashcards to reduce memory decay.');
  if (focusMins < 60) interventions.push('Complete at least two 25-minute Focus Loop sessions this week.');
  if (!interventions.length) interventions.push('Maintain your current study rhythm and review schedule.');

  return {
    risk: Math.round(risk),
    passingProbability: Math.round(passingProbability),
    level,
    overdue,
    missed,
    dueSoon,
    dueCards,
    avgQuiz: Math.round(avgQuiz),
    focusMins,
    completionRate: Math.round(completionRate * 100),
    interventions
  };
}

function procrastinationRiskRows() {
  return app.subjects
    .filter(s => s.userId === app.currentUserId)
    .map(subject => ({ subject, profile: academicRiskProfile(subject.id) }))
    .sort((a, b) => b.profile.risk - a.profile.risk);
}

function adaptiveReviewRecommendation(card) {
  const reviewed = Number(card.reviewedCount || 0);
  const interval = Math.max(1, Number(card.interval || 1));
  const overdueDays = Math.max(0, -daysUntil(card.nextReview));
  const subject = subjectById(card.subjectId);
  const difficulty = DIFFICULTY[subject?.difficulty] || 2;
  const risk = academicRiskProfile(card.subjectId).risk;
  const intensity = clamp((risk * 0.35) + (difficulty * 10) + (overdueDays * 6) - (reviewed * 3));
  const nextInterval = intensity >= 70 ? 1 : intensity >= 45 ? Math.max(2, Math.round(interval * 1.2)) : Math.max(3, Math.round(interval * 1.8));
  return { intensity: Math.round(intensity), nextInterval };
}

function meetingOptimizationScore(slot, memberIds, project) {
  const availabilityScore = memberIds.length ? (slot.availableMembers.length / memberIds.length) * 70 : 0;
  const tasks = project?.tasks || [];
  const nearestDue = tasks
    .filter(t => t.status !== 'done' && t.dueDate)
    .map(t => daysUntil(t.dueDate))
    .sort((a, b) => a - b)[0];
  const deadlineScore = nearestDue === undefined ? 5 : nearestDue < 0 ? 20 : nearestDue <= 2 ? 18 : nearestDue <= 7 ? 12 : 6;
  const workloadScore = Math.min(10, tasks.filter(t => t.status !== 'done').length * 2);
  return Math.round(clamp(availabilityScore + deadlineScore + workloadScore));
}

function smartPriorities() {
  const subjects = app.subjects.filter(s => s.userId === app.currentUserId);
  return subjects.map(subject => {
    const events = app.plannerEvents.filter(e => e.userId === app.currentUserId && e.subjectId === subject.id && e.status !== 'completed');
    const dueSoon = events.filter(e => daysUntil(e.dueDate) >= 0 && daysUntil(e.dueDate) <= 7).length;
    const overdue = events.filter(e => daysUntil(e.dueDate) < 0).length;
    const difficultyScore = (DIFFICULTY[subject.difficulty] || 2) * 12;
    const dueScore = dueSoon * 12;
    const overdueScore = overdue * 25;
    const pendingScore = Math.min(20, events.length * 5);
    const cardScore = Math.min(15, dueFlashcards().filter(c => c.subjectId === subject.id).length * 3);
    const quizScores = app.quizzes.filter(q => q.userId === app.currentUserId && q.subjectId === subject.id && typeof q.bestScore === 'number').map(q => q.bestScore);
    const avgQuiz = quizScores.length ? quizScores.reduce((a,b) => a + b, 0) / quizScores.length : 100;
    const lowQuizScore = avgQuiz < 75 ? Math.round((75 - avgQuiz) / 2) : 0;
    const score = Math.min(100, Math.round(difficultyScore + dueScore + overdueScore + pendingScore + cardScore + lowQuizScore));
    const reasons = [];
    if (overdue) reasons.push(`${overdue} overdue`);
    if (dueSoon) reasons.push(`${dueSoon} due this week`);
    if (subject.difficulty === 'difficult') reasons.push('difficult subject');
    if (cardScore) reasons.push('flashcards due');
    if (lowQuizScore) reasons.push('low quiz score');
    return { subject, score, reason: reasons.join(' • ') || 'low urgency' };
  }).sort((a, b) => b.score - a.score);
}

function generateDailyPlan(saveToPlanner = false) {
  const plan = [];
  const priorities = smartPriorities();
  const dueCards = dueFlashcards();
  const urgentEvents = app.plannerEvents
    .filter(e => e.userId === app.currentUserId && e.status !== 'completed' && daysUntil(e.dueDate) <= 3)
    .sort((a,b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));

  let hour = 18;
  function slot(minutes, title, note, subjectId = '') {
    const start = `${String(hour).padStart(2,'0')}:00`;
    const endMinute = minutes >= 60 ? '00' : String(minutes).padStart(2, '0');
    const time = minutes >= 60 ? `${start}-${String(hour + Math.floor(minutes / 60)).padStart(2,'0')}:00` : `${start}-${String(hour).padStart(2,'0')}:${endMinute}`;
    plan.push({ time, title, note, minutes, subjectId });
    hour += minutes >= 60 ? Math.floor(minutes / 60) : 1;
  }

  if (dueCards.length) slot(25, `Review ${Math.min(10, dueCards.length)} flashcards`, 'Spaced repetition review due today.', dueCards[0].subjectId);
  urgentEvents.slice(0, 2).forEach(e => slot(Math.min(45, Number(e.minutes || 30)), e.title, `${dueLabel(e.dueDate)} • ${subjectName(e.subjectId)}`, e.subjectId));
  priorities.slice(0, 2).forEach(p => slot(25, `Study ${p.subject.name}`, `Priority score ${p.score}: ${p.reason}`, p.subject.id));

  if (saveToPlanner && plan.length) {
    plan.forEach(p => {
      app.plannerEvents.push({
        id: uid('event'), userId: app.currentUserId,
        title: p.title, subjectId: p.subjectId, type: 'Study Session',
        dueDate: todayISO(), status: 'scheduled', priority: 'medium', minutes: p.minutes,
        notes: `${p.time}. ${p.note}`, createdAt: new Date().toISOString()
      });
    });
    saveApp(); render();
  }
  return plan;
}

function completeNoZero(action) {
  const exists = app.studyLogs.some(l => l.userId === app.currentUserId && l.date === todayISO() && l.action === action);
  if (!exists) {
    app.studyLogs.push({ id: uid('log'), userId: app.currentUserId, date: todayISO(), action, createdAt: new Date().toISOString() });
    saveApp(); render(); toast('Small action completed. No Zero Day saved.');
  } else {
    toast('You already completed this action today.');
  }
}

function startFocus() {
  const duration = Number(document.getElementById('focusDuration')?.value || 25);
  if (!focusTimer.running && focusTimer.left === focusTimer.total) {
    focusTimer.total = duration * 60;
    focusTimer.left = focusTimer.total;
  }
  focusTimer.running = true;
  clearInterval(focusTimer.interval);
  focusTimer.interval = setInterval(() => {
    focusTimer.left = Math.max(0, focusTimer.left - 1);
    updateTimerFace();
    if (focusTimer.left <= 0) {
      clearInterval(focusTimer.interval);
      focusTimer.running = false;
      completeFocus();
    }
  }, 1000);
  updateTimerFace();
}

function pauseFocus() {
  focusTimer.running = false;
  clearInterval(focusTimer.interval);
  updateTimerFace();
}

function resetFocus() {
  pauseFocus();
  const duration = Number(document.getElementById('focusDuration')?.value || 25);
  focusTimer.total = duration * 60;
  focusTimer.left = focusTimer.total;
  updateTimerFace();
}

function completeFocus() {
  pauseFocus();
  const completedMinutes = Math.max(1, Math.round((focusTimer.total - focusTimer.left) / 60));
  const task = document.getElementById('focusTask')?.value || 'Focus session';
  app.focusLogs.push({ id: uid('focus'), userId: app.currentUserId, date: todayISO(), task, minutes: completedMinutes, createdAt: new Date().toISOString() });
  if (!app.studyLogs.some(l => l.userId === app.currentUserId && l.date === todayISO() && l.action === 'study10')) {
    app.studyLogs.push({ id: uid('log'), userId: app.currentUserId, date: todayISO(), action: 'study10', createdAt: new Date().toISOString() });
  }
  const duration = Number(document.getElementById('focusDuration')?.value || 25);
  focusTimer.total = duration * 60;
  focusTimer.left = focusTimer.total;
  saveApp(); render(); toast(`Focus session saved: ${completedMinutes} minute(s).`);
}

function updateTimerFace() {
  const text = document.getElementById('timerText');
  const face = document.getElementById('timerFace');
  const label = document.getElementById('timerLabel');
  if (text) text.textContent = formatSeconds(focusTimer.left);
  if (label) label.textContent = focusTimer.running ? 'Focus running' : 'Focus session';
  if (face) {
    const done = focusTimer.total ? ((focusTimer.total - focusTimer.left) / focusTimer.total) * 100 : 0;
    face.style.setProperty('--progress', `${Math.max(0, Math.min(100, done))}%`);
  }
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function breakdownTask() {
  const task = document.getElementById('breakdownTask')?.value.trim();
  const result = document.getElementById('breakdownResult');
  if (!task || !result) return toast('Type a big task first.');
  const steps = [
    `Clarify the exact requirement for: ${task}`,
    'Gather needed notes, files, rubrics, or references.',
    'Create a simple outline or checklist.',
    'Work for one 25-minute Focus Loop session.',
    'Review what is missing or unclear.',
    'Finalize the output and prepare for submission.',
    'Mark the task completed in your planner.'
  ];
  result.innerHTML = steps.map((s, i) => `<div class="item"><strong>Step ${i + 1}:</strong> ${escapeHtml(s)}</div>`).join('');
}

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function findMeetingTimes() {
  const projectId = document.getElementById('meetingProject')?.value || 'all';
  const day = document.getElementById('meetingDay')?.value || 'Mon';
  const duration = Number(document.getElementById('meetingDuration')?.value || 60);
  const earliest = timeToMinutes(document.getElementById('meetingEarliest')?.value || '07:00');
  const result = document.getElementById('meetingResults');
  if (!result) return;

  let memberIds = app.users.map(u => u.id);
  if (projectId !== 'all') {
    const project = app.projects.find(p => p.id === projectId);
    memberIds = project ? project.memberIds : memberIds;
  }

  const slots = [];
  for (let start = earliest; start <= 22 * 60 - duration; start += 30) {
    const end = start + duration;
    const availableMembers = memberIds.filter(id => {
      return app.schedules.some(s =>
        s.userId === id && s.day === day && s.visibility === 'public' && s.type === 'available' &&
        timeToMinutes(s.start) <= start && timeToMinutes(s.end) >= end
      );
    });
    if (availableMembers.length) {
      const project = projectId !== 'all' ? app.projects.find(p => p.id === projectId) : null;
      slots.push({ start, end, availableMembers, score: meetingOptimizationScore({ start, end, availableMembers }, memberIds, project) });
    }
  }

  const top = slots.sort((a,b) => b.score - a.score || b.availableMembers.length - a.availableMembers.length).slice(0, 6);
  result.innerHTML = top.length ? top.map(slot => `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${minutesToTime(slot.start)}-${minutesToTime(slot.end)}</div>
          <div class="item-meta">Available: ${slot.availableMembers.length}/${memberIds.length} • Meeting optimization score: ${slot.score}</div>
        </div>
        <span class="tag ${scoreBand(slot.score, true)}">${slot.score}</span>
      </div>
      <div class="actions mt-8">${slot.availableMembers.map(id => `<span class="tag green">${escapeHtml(userName(id))}</span>`).join('')}</div>
    </div>
  `).join('') : `<div class="empty">No common public availability found. Ask members to add public available blocks.</div>`;
}

function setEventStatus(id, status) {
  const event = app.plannerEvents.find(e => e.id === id);
  if (!event) return;
  event.status = status;
  if (status === 'completed' && !app.studyLogs.some(l => l.userId === app.currentUserId && l.date === todayISO() && l.action === 'task1')) {
    app.studyLogs.push({ id: uid('log'), userId: app.currentUserId, date: todayISO(), action: 'task1', createdAt: new Date().toISOString() });
  }
  saveApp(); render(); toast('Status updated.');
}

function generateCardsFromReviewer(id) {
  const reviewer = app.reviewers.find(r => r.id === id);
  if (!reviewer) return;
  const sentences = extractSentences(reviewer.content).slice(0, 12);
  let count = 0;
  sentences.forEach(sentence => {
    const termMatch = sentence.match(/^(.{3,55}?)\s+(is|are|refers to|means|is defined as)\s+(.+)/i);
    let front = `Explain: ${sentence.slice(0, 80)}${sentence.length > 80 ? '...' : ''}`;
    let back = sentence;
    if (termMatch) {
      front = `What ${termMatch[2].toLowerCase() === 'are' ? 'are' : 'is'} ${termMatch[1].trim()}?`;
      back = termMatch[3].trim();
    }
    app.flashcards.push({
      id: uid('card'), userId: app.currentUserId, subjectId: reviewer.subjectId,
      front, back, nextReview: todayISO(), reviewedCount: 0, createdAt: new Date().toISOString(), sourceReviewerId: reviewer.id
    });
    count++;
  });
  saveApp(); render(); toast(`${count} flashcard(s) generated from reviewer.`);
}

function generateQuizFromReviewer(id) {
  const reviewer = app.reviewers.find(r => r.id === id);
  if (!reviewer) return;
  const sentences = extractSentences(reviewer.content).slice(0, 10);
  const terms = sentences.map(s => s.split(/\s+/).slice(0, 4).join(' '));
  const questions = sentences.map((sentence, index) => {
    const correct = 'True';
    const options = ['True', 'False'];
    let question = `${sentence}`;
    const termMatch = sentence.match(/^(.{3,55}?)\s+(is|are|refers to|means|is defined as)\s+(.+)/i);
    if (termMatch) {
      const wrong = terms[(index + 1) % Math.max(1, terms.length)] || 'another concept';
      question = `Which statement best describes ${termMatch[1].trim()}?`;
      return { question, options: [termMatch[3].trim(), `It mainly refers to ${wrong}.`, 'It is unrelated to the lesson.', 'It is only a personal opinion.'], correct: termMatch[3].trim() };
    }
    return { question: `True or False: ${question}`, options, correct };
  });
  app.quizzes.push({
    id: uid('quiz'), userId: app.currentUserId, subjectId: reviewer.subjectId,
    title: `${reviewer.title} - Generated Quiz`, questions,
    createdAt: new Date().toISOString(), bestScore: null
  });
  saveApp(); render(); toast('Quiz generated from reviewer.');
}

function extractSentences(text) {
  return String(text)
    .replace(/\n+/g, '. ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 18 && s.split(/\s+/).length >= 4);
}

function printReviewer(id) {
  const reviewer = app.reviewers.find(r => r.id === id);
  if (!reviewer) return;
  const html = `
    <html><head><title>${escapeHtml(reviewer.title)}</title><style>
      body{font-family:Arial,sans-serif;line-height:1.6;padding:32px;color:#24302a} h1{color:#4f6f52} .meta{color:#66736b;margin-bottom:24px} pre{white-space:pre-wrap;font-family:inherit}
    </style></head><body>
      <h1>${escapeHtml(reviewer.title)}</h1>
      <div class="meta">${escapeHtml(subjectName(reviewer.subjectId))} • Generated from AralLoop Campus</div>
      <pre>${escapeHtml(reviewer.content)}</pre>
    </body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function copyAiTemplate() {
  const prompt = `Act as a helpful tutor. Turn my lesson notes into:\n\n1. A clear student-friendly reviewer\n2. 15 flashcards with Front and Back\n3. 10 multiple-choice questions with answer key\n4. A 7-day study plan\n5. Key terms and definitions\n\nUse simple language and make it easy for a student to review.\n\nLesson notes:\n[PASTE NOTES HERE]`;
  navigator.clipboard?.writeText(prompt).then(() => toast('Prompt template copied.'), () => toast('Copy not available. Please copy manually.'));
}

function reviewCard(id, rating) {
  const card = app.flashcards.find(c => c.id === id);
  if (!card) return;
  const days = rating === 'hard' ? 1 : rating === 'good' ? 3 : 7;
  card.nextReview = datePlus(days);
  card.reviewedCount = (card.reviewedCount || 0) + 1;
  card.lastRating = rating;
  card.lastReviewedAt = new Date().toISOString();
  app.ui.revealedCardId = '';
  if (!app.studyLogs.some(l => l.userId === app.currentUserId && l.date === todayISO() && l.action === 'flashcards5') && card.reviewedCount >= 1) {
    app.studyLogs.push({ id: uid('log'), userId: app.currentUserId, date: todayISO(), action: 'flashcards5', createdAt: new Date().toISOString() });
  }
  saveApp(); render(); toast(`Card scheduled after ${days} day(s).`);
}

function submitQuiz(id) {
  const quiz = app.quizzes.find(q => q.id === id);
  if (!quiz) return;
  let correct = 0;
  quiz.questions.forEach((q, index) => {
    if (app.ui.quizAnswers[`${quiz.id}_${index}`] === q.correct) correct++;
  });
  const score = quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) : 0;
  quiz.bestScore = Math.max(score, quiz.bestScore || 0);
  quiz.lastScore = score;
  quiz.lastTakenAt = new Date().toISOString();
  saveApp(); render(); toast(`Quiz submitted. Score: ${score}%`);
}

function setProjectTaskStatus(projectId, taskId, status) {
  const project = app.projects.find(p => p.id === projectId);
  const task = project?.tasks?.find(t => t.id === taskId);
  if (!task) return;
  task.status = status;
  saveApp(); render(); toast('Project task updated.');
}

function deleteProjectTask(projectId, taskId) {
  const project = app.projects.find(p => p.id === projectId);
  if (!project) return;
  project.tasks = (project.tasks || []).filter(t => t.id !== taskId);
  saveApp(); render(); toast('Project task deleted.');
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(app, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aralloop-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      app = { ...defaultApp(), ...data };
      saveApp(); render(); toast('Backup imported.');
    } catch (error) {
      toast('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

async function resetAll() {
  if (!authUser || !confirm('This will erase your AralLoop application data from Supabase. Continue?')) return;
  const { error } = await supabaseClient.from('app_states').delete().eq('user_id', authUser.id);
  if (error) return toast(error.message);
  app = defaultApp();
  app.currentUserId = authUser.id;
  app.users = [{ id: authUser.id, name: authUser.email?.split('@')[0] || 'Student', role: 'Student', course: '', createdAt: new Date().toISOString() }];
  render();
  toast('Your AralLoop data was reset.');
}

function seedStarterData(userId) {
  const subjectId = uid('subject');
  app.subjects.push({ id: subjectId, userId, name: 'Sample Subject: Information Management', code: 'IM101', instructor: 'Instructor', difficulty: 'moderate', color: '#7aa874', createdAt: new Date().toISOString() });
  app.plannerEvents.push({ id: uid('event'), userId, title: 'Create project proposal outline', subjectId, type: 'Task', dueDate: datePlus(2), status: 'scheduled', priority: 'high', minutes: 30, notes: 'Break into small steps before starting.', attachment: { link: 'https://drive.google.com/' }, createdAt: new Date().toISOString() });
  app.reviewers.push({ id: uid('reviewer'), userId, subjectId, title: 'Sample Reviewer: Database Basics', content: 'A database is an organized collection of data. A DBMS is software used to create, manage, and retrieve data from a database. Normalization is the process of organizing data to reduce redundancy and improve integrity. A primary key uniquely identifies each record in a table.', attachment: null, createdAt: new Date().toISOString() });
  app.schedules.push({ id: uid('sched'), userId, title: 'Available for group meeting', day: 'Sat', start: '15:00', end: '17:00', visibility: 'public', type: 'available', notes: '', createdAt: new Date().toISOString() });
  app.mindMaps.push({ id: uid('mindmap'), userId, subjectId, title: 'Database Management Overview', nodes: 'Database Management\n> ERD\n> SQL\n> Normalization\n>> 1NF\n>> 2NF\n>> 3NF', weakNode: 'Normalization', reviewerId: '', createdAt: new Date().toISOString() });
  app.codeSnippets.push({ id: uid('code'), userId, subjectId, language: 'SQL', title: 'Basic SELECT Query', topic: 'SQL Fundamentals', code: 'SELECT student_id, full_name FROM students WHERE status = \'Active\';', notes: 'This query retrieves active students from the students table.', createdAt: new Date().toISOString() });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

bootApp();
