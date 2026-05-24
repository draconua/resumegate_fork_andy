/* === 1. ПЕРЕМЕННЫЕ И НАСТРОЙКИ === */
const LEMON_URL = 'https://theresumegate.lemonsqueezy.com/checkout/buy/2cc21afc-e128-4293-b2d0-4af55db2df4f';
let lastRewrittenText = '';
let currentAnalysisResults = null; 
let currentUser = null;

const supabaseUrl = 'https://zcbvqystbanooiczjqop.supabase.co';
const supabaseKey = 'sb_publishable_Kq07S3DxE59y4pHNocwaUA_7M7I6-kL';
const sb = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* === 2. УВЕДОМЛЕНИЯ И ПОДСКАЗКИ === */

function showNotice(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 5000);
}

function showLoginHint(message) {
  const authSection = document.getElementById('auth-section');
  if (!authSection) return;
  const oldHint = authSection.querySelector('.login-hint');
  if (oldHint) oldHint.remove();

  const hint = document.createElement('div');
  hint.className = 'login-hint';
  hint.textContent = message;
  authSection.style.position = 'relative';
  authSection.appendChild(hint);
  setTimeout(() => { if (hint.parentNode) hint.remove(); }, 5000);
}

/* === 3. ЛОГИКА КНОПОК === */

function handleUpgrade() {
  if (!currentUser) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      showLoginHint("Please Sign In with Google first to link your purchase to your account.");
    }, 600);
    return;
  }
  const checkoutUrl = LEMON_URL + "?checkout[email]=" + encodeURIComponent(currentUser.email);
  window.open(checkoutUrl, '_blank');
}

function reset() {
  document.getElementById('results').classList.remove('visible');
  document.getElementById('rewriteBox').classList.remove('active');
  document.getElementById('loadingState').classList.remove('active');
  document.getElementById('errorMsg').classList.remove('active');
  document.getElementById('analyzeBtn').disabled = false;
  currentAnalysisResults = null; 
  lastRewrittenText = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* === 4. АНАЛИЗ (ШАГ 1) === */

async function analyzeCV() {
  let isPro = false;
  if (currentUser) {
    const { data } = await sb.from('profiles').select('is_pro').eq('id', currentUser.id).maybeSingle();
    if (data && data.is_pro) isPro = true;
  }

  const cv = document.getElementById('cvText').value.trim();
  const job = document.getElementById('jobText').value.trim();
  const errEl = document.getElementById('errorMsg');
  
  if (!cv || cv.length < 100) {
    errEl.textContent = '⚠ Please paste your CV text (at least 100 characters) before analyzing.';
    errEl.classList.add('active');
    return;
  }

  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('results').classList.remove('visible');
  document.getElementById('loadingState').classList.add('active');
  startLoading();

  try {
    const session = await sb.auth.getSession();
    const token = session.data.session ? session.data.session.access_token : null;

    const response = await fetch('https://resumegate.vercel.app/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText: cv, jobText: job, token: token })
    });

    const data = await response.json();
// 6. ПРОВЕРКА ЛИМИТА ОТ СЕРВЕРА
    if (response.status === 403 && data.error === "LIMIT_EXCEEDED") {
      stopLoading();
      document.getElementById('loadingState').classList.remove('active');
      document.getElementById('analyzeBtn').disabled = false;

      // СНАЧАЛА: Плавный скролл вверх к кнопке логина
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // ЗАТЕМ: Запускаем таймер, чтобы подсказка выскочила после завершения скролла
      setTimeout(() => {
        showLoginHint("Free limit reached. Sign In or Upgrade to Pro to continue!");
      }, 600); 

      return; // Выходим из функции
    }

    if (!response.ok || data.error) throw new Error(data.error || 'Server error');
    const result = JSON.parse(data.content);
    currentAnalysisResults = result; 
    stopLoading();
    document.getElementById('loadingState').classList.remove('active');
    renderResults(result);
  } catch (e) {
    stopLoading();
    document.getElementById('loadingState').classList.remove('active');
    document.getElementById('analyzeBtn').disabled = false;
    errEl.textContent = '⚠ ' + e.message;
    errEl.classList.add('active');
  }
}

/* === 5. РЕРАЙТ (ШАГ 2) === */

async function showRewrite() {
  const btn = document.getElementById('rewrite-btn');
  if (!currentAnalysisResults) { showNotice("Please analyze your CV first!"); return; }
  if (!currentUser) { showNotice("Please Sign In first."); return; }

  const originalText = btn.innerHTML;
  btn.innerHTML = `⏳ AI is rewriting...`;
  btn.disabled = true;

  try {
    const { data: sess } = await sb.auth.getSession();
    const response = await fetch('https://resumegate.vercel.app/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvText: document.getElementById('cvText').value,
        jobText: document.getElementById('jobText').value,
        analysisResults: currentAnalysisResults,
        token: sess.session?.access_token
      })
    });
    const data = await response.json();
    if (response.ok) {
      lastRewrittenText = data.rewrittenResume;
      document.getElementById('rewrittenContent').textContent = lastRewrittenText;
      document.getElementById('rewriteBox').classList.add('active');
      document.getElementById('rewriteBox').scrollIntoView({ behavior: 'smooth' });
    } else {
      showNotice(data.error || "Error during rewrite");
    }
  } catch (e) { showNotice("Connection error"); } 
  finally { btn.innerHTML = originalText; btn.disabled = false; }
}

/* === 6. ОТРИСОВКА РЕЗУЛЬТАТОВ (БЕЗОПАСНАЯ) === */

function renderResults(r) {
  document.getElementById('scoreNum').textContent = r.score;
  const arc = document.getElementById('scoreArc');
  if (arc) {
    const circumference = 2 * Math.PI * 62;
    arc.style.stroke = r.score >= 75 ? '#2e7d52' : r.score >= 50 ? '#b5620e' : '#b52e2e';
    setTimeout(() => { arc.style.strokeDasharray = `${(r.score / 100) * circumference} ${circumference}`; }, 100);
  }
  document.getElementById('scoreVerdict').textContent = r.verdict;
  document.getElementById('scoreSummary').textContent = r.summary;

  const bars = document.getElementById('scoreBars');
  bars.innerHTML = '';
  Object.entries(r.subScores || {}).forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<span class="bar-name">${k.replace('_', ' ')}</span><div class="bar-track"><div class="bar-fill" style="width:${v}%"></div></div><span class="bar-val">${v}</span>`;
    bars.appendChild(row);
  });

  const renderKW = (id, list, cls) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    (list || []).forEach(w => {
      const s = document.createElement('span'); s.className = `kw-tag ${cls}`; s.textContent = w; el.appendChild(s);
    });
  };
  renderKW('kwFound', r.keywordsFound, 'kw-found');
  renderKW('kwMissing', r.keywordsMissing, 'kw-missing');

  const issuesCont = document.getElementById('issuesList');
  issuesCont.innerHTML = '';
  (r.issues || []).forEach(iss => {
    const d = document.createElement('div');
    d.className = `issue-item issue-${iss.severity === 'critical' ? 'critical' : iss.severity === 'warning' ? 'warning' : 'info'}`;
    const dot = document.createElement('div'); dot.className = 'issue-dot';
    const txt = document.createElement('span'); txt.textContent = iss.text;
    d.append(dot, txt);
    issuesCont.appendChild(d);
  });

  const recoCont = document.getElementById('recoList');
  recoCont.innerHTML = '';
  (r.recommendations || []).forEach((rec, i) => {
    const it = document.createElement('div');
    it.className = 'reco-item';
    const num = document.createElement('div'); num.className = 'reco-num'; num.textContent = i + 1;
    const content = document.createElement('div'); content.className = 'reco-text';
    const strong = document.createElement('strong'); strong.textContent = rec.title + ". ";
    content.append(strong, document.createTextNode(rec.detail));
    it.append(num, content);
    recoCont.appendChild(it);
  });

  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('results').classList.add('visible');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* === 7. ФАЙЛЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ === */

const fileInput = document.getElementById('fileUpload');
if (fileInput) {
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const area = document.getElementById('cvText');
    area.value = 'Reading file... ⏳';
    try {
      if (file.name.toLowerCase().endsWith('.txt')) area.value = await file.text();
      else if (file.name.toLowerCase().endsWith('.docx')) {
        const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        area.value = res.value.trim();
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        area.value = text.trim();
      }
    } catch (err) { area.value = '⚠ Error reading file.'; }
    e.target.value = '';
  });
}

const loadingMessages = ['Parsing document...', 'Checking ATS...', 'Scanning keywords...', 'Rewriting...'];
let loadingInterval;
function startLoading() {
  let i = 0; const el = document.getElementById('loadingMsg');
  if (el) {
    el.textContent = loadingMessages[0];
    loadingInterval = setInterval(() => { i = (i + 1) % loadingMessages.length; el.textContent = loadingMessages[i]; }, 1800);
  }
}
function stopLoading() { clearInterval(loadingInterval); }

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(lastRewrittenText, 180);
  doc.text(lines, 15, 20);
  doc.save('ResumeGate_Improved.pdf');
}

function downloadDOCX() {
  const source = '<html><head><meta charset="utf-8"></head><body>' + lastRewrittenText.split('\n').map(l => `<p>${l}</p>`).join('') + '</body></html>';
  const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ResumeGate_Improved.doc";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* === 8. АВТОРИЗАЦИЯ И UI === */

async function signInWithGoogle() {
  await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

async function signOut() {
  await sb.auth.signOut();
  window.location.reload();
}

async function updateUI(session) {
  const authSection = document.getElementById('auth-section');
  const pricingSection = document.getElementById('pricing');
  const pricingLink = document.getElementById('nav-pricing');
  if (!authSection) return;

  if (session && session.user) {
    currentUser = session.user;
    const { data: profile } = await sb.from('profiles').select('is_pro').eq('id', currentUser.id).maybeSingle();
    const isPro = profile?.is_pro || false;

    if (isPro) {
      if (pricingSection) pricingSection.style.display = 'none';
      if (pricingLink) { pricingLink.textContent = 'Manage Plan'; pricingLink.href = 'https://theresumegate.lemonsqueezy.com/billing'; pricingLink.target = '_blank'; }
    } else {
      if (pricingSection) pricingSection.style.display = 'block';
      if (pricingLink) { pricingLink.textContent = 'Pricing'; pricingLink.href = '#pricing'; pricingLink.target = '_self'; }
    }

    authSection.innerHTML = '';
    const userWrapper = document.createElement('div');
    userWrapper.style.display = 'flex'; userWrapper.style.alignItems = 'center';
    if (isPro) {
      const proTag = document.createElement('span'); proTag.className = 'pro-tag'; proTag.textContent = 'PRO';
      userWrapper.appendChild(proTag);
    }
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-size:13px; color:var(--ink-2); font-weight:600;';
    nameSpan.textContent = `Hi, ${currentUser.user_metadata.full_name.split(' ')[0]}`;
    userWrapper.appendChild(nameSpan);
    const logoutBtn = document.createElement('button');
    logoutBtn.onclick = signOut;
    logoutBtn.style.cssText = 'background:none; border:none; color:var(--ink-4); cursor:pointer; font-size:12px; text-decoration:underline; margin-left:15px;';
    logoutBtn.textContent = 'Log Out';
    authSection.append(userWrapper, logoutBtn);
  } else {
    currentUser = null;
    if (pricingSection) pricingSection.style.display = 'block';
    if (pricingLink) { pricingLink.textContent = 'Pricing'; pricingLink.href = '#pricing'; }
    authSection.innerHTML = `<button class="nav-cta" onclick="signInWithGoogle()">Sign In with Google</button>`;
  }
}

/* === 9. ИНИЦИАЛИЗАЦИЯ === */
sb.auth.onAuthStateChange((event, session) => { updateUI(session); });

async function initSession() {
  const { data: { session } } = await sb.auth.getSession();
  updateUI(session);
}
initSession();
