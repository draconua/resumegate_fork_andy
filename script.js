// тут был <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-8LE4CP86M9');
// тут был </script>
// тут был <script>
const LEMON_URL = 'https://theresumegate.lemonsqueezy.com/checkout/buy/2cc21afc-e128-4293-b2d0-4af55db2df4f';
let lastRewrittenText = '';
let currentAnalysisResults = null; // Добавь это: здесь мы будем хранить данные анализа
// Настройка Supabase
const supabaseUrl = 'https://zcbvqystbanooiczjqop.supabase.co';
const supabaseKey = 'sb_publishable_Kq07S3DxE59y4pHNocwaUA_7M7I6-kL';
// МЫ ПОМЕНЯЛИ ИМЯ ПЕРЕМЕННОЙ НА sb
const sb = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

let currentUser = null;

// Функция для мгновенной проверки сессии при загрузке
async function checkInitialSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    // Мы не вызываем здесь отрисовку вручную, 
    // так как onAuthStateChange все равно сработает сам, 
    // но теперь переменная currentUser будет заполнена сразу.
  }
}

checkInitialSession();

const loadingMessages = [
  'Parsing document structure...',
  'Checking ATS compatibility...',
  'Scanning keyword density...',
  'Evaluating formatting rules...',
  'Rewriting your resume with AI...',
];
let loadingInterval;

function startLoading() {
  let i = 0;
  const el = document.getElementById('loadingMsg');
  el.textContent = loadingMessages[0];
  loadingInterval = setInterval(() => {
    i = (i + 1) % loadingMessages.length;
    el.textContent = loadingMessages[i];
  }, 1800);
}

function stopLoading() { clearInterval(loadingInterval); }

function reset() {
  document.getElementById('results').classList.remove('visible');
  document.getElementById('rewriteBox').classList.remove('active');
  document.getElementById('loadingState').classList.remove('active');
  document.getElementById('errorMsg').classList.remove('active');
  document.getElementById('analyzeBtn').disabled = false;
    
  // ОБНУЛЯЕМ РЕЗУЛЬТАТЫ, чтобы для нового резюме кнопка снова требовала анализ
  currentAnalysisResults = null; 
  lastRewrittenText = '';
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function analyzeCV() {
  // 1. Проверяем Pro-статус через базу (твоя логика)
  let isPro = false;
  if (currentUser) {
    const { data } = await sb
      .from('profiles')
      .select('is_pro')
      .eq('id', currentUser.id)
      .maybeSingle();
    
    if (data && data.is_pro) {
      isPro = true;
    }
  }

  // 2. Валидация полей (как у тебя было)
  const cv = document.getElementById('cvText').value.trim();
  const job = document.getElementById('jobText').value.trim();
  const errEl = document.getElementById('errorMsg');
  errEl.classList.remove('active');

  if (!cv || cv.length < 100) {
    errEl.textContent = '⚠ Please paste your CV text (at least a few sentences) before analyzing.';
    errEl.classList.add('active');
    return;
  }

  // 3. Подготовка экрана (лоадеры)
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('results').classList.remove('visible');
  document.getElementById('rewriteBox').classList.remove('active');
  document.getElementById('loadingState').classList.add('active');
  startLoading();
  document.getElementById('loadingState').scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    // 4. Получаем токен сессии для бэкенда
    const session = await sb.auth.getSession();
    const token = session.data.session ? session.data.session.access_token : null;

    // 5. ОТПРАВЛЯЕМ ЗАПРОС
    const response = await fetch('https://resumegate.vercel.app/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        cvText: cv, 
        jobText: job,
        token: token 
      })
    });

    const data = await response.json(); // Теперь получаем объект { content: "..." } или { error: "..." }

    // 6. ПРОВЕРКА ЛИМИТА ОТ СЕРВЕРА
    if (response.status === 403 && data.error === "LIMIT_EXCEEDED") {
      stopLoading();
      document.getElementById('loadingState').classList.remove('active');
      document.getElementById('analyzeBtn').disabled = false;
      
      showNotice("You've reached your free limit. Upgrade to Pro for unlimited scans!");
      document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Если сервер вернул ошибку Gemini или базы
    if (!response.ok || data.error) throw new Error(data.error || 'Server error');

    // --- РАСПАКОВКА РЕЗУЛЬТАТОВ ---
    // Сервер прислал JSON внутри строки content, превращаем её в объект
    const result = JSON.parse(data.content); 
    
    // Сохраняем результаты для рерайта
    currentAnalysisResults = result; 
    
    stopLoading();
    document.getElementById('loadingState').classList.remove('active');
    renderResults(result); // Передаем объект с баллами в функцию отрисовки

  } catch (e) {
    stopLoading();
    document.getElementById('loadingState').classList.remove('active');
    document.getElementById('analyzeBtn').disabled = false;
    // Выводим более понятную ошибку
    errEl.textContent = '⚠ ' + e.message;
    errEl.classList.add('active');
    console.error("Full error:", e);
  }
}
  
function renderResults(r) {
  // 1. Баллы (Score)
  document.getElementById('scoreNum').textContent = r.score;

  const circumference = 2 * Math.PI * 62;
  const arc = document.getElementById('scoreArc');
  const color = r.score >= 75 ? '#2e7d52' : r.score >= 50 ? '#b5620e' : '#b52e2e';
  if (arc) {
    arc.style.stroke = color;
    setTimeout(() => {
      arc.style.strokeDasharray = `${(r.score / 100) * circumference} ${circumference}`;
      arc.style.transition = 'stroke-dasharray 1.2s ease';
    }, 100);
  }

  // 2. Вердикт и Суммари
  document.getElementById('scoreVerdict').textContent = r.verdict;
  document.getElementById('scoreSummary').textContent = r.summary;

  // 3. Полоски (Sub-scores) — БЕЗОПАСНЫЙ РЕНДЕР
  const bars = document.getElementById('scoreBars');
  bars.innerHTML = ''; // Очищаем один раз
  Object.entries(r.subScores || {}).forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    
    const name = document.createElement('span');
    name.className = 'bar-name';
    name.textContent = k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ');

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = '0%'; // Сначала 0 для анимации
    
    const val = document.createElement('span');
    val.className = 'bar-val';
    val.textContent = v;

    track.appendChild(fill);
    row.append(name, track, val);
    bars.appendChild(row);

    // Запускаем анимацию полоски
    setTimeout(() => { fill.style.width = v + '%'; fill.style.transition = 'width 1s ease'; }, 200);
  });

  // 4. Ключевые слова — БЕЗОПАСНЫЙ РЕНДЕР
  const renderKeywords = (containerId, keywords, className) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    (keywords || []).forEach(word => {
      const span = document.createElement('span');
      span.className = `kw-tag ${className}`;
      span.textContent = word; // Вставляем как чистый текст
      container.appendChild(span);
    });
  };
  renderKeywords('kwFound', r.keywordsFound, 'kw-found');
  renderKeywords('kwMissing', r.keywordsMissing, 'kw-missing');

  // 5. Ошибки (Issues) — БЕЗОПАСНЫЙ РЕНДЕР
  const issuesContainer = document.getElementById('issuesList');
  issuesContainer.innerHTML = '';
  (r.issues || []).forEach(iss => {
    const div = document.createElement('div');
    const cls = iss.severity === 'critical' ? 'issue-critical' : iss.severity === 'warning' ? 'issue-warning' : 'issue-info';
    div.className = `issue-item ${cls}`;
    
    const dot = document.createElement('div');
    dot.className = 'issue-dot';
    
    const text = document.createElement('span');
    text.textContent = iss.text;

    div.append(dot, text);
    issuesContainer.appendChild(div);
  });

  // 6. Рекомендации (Recommendations)
  const recoContainer = document.getElementById('recoList');
  recoContainer.innerHTML = '';
  (r.recommendations || []).forEach((rec, i) => {
    const item = document.createElement('div');
    item.className = 'reco-item';
    
    const num = document.createElement('div');
    num.className = 'reco-num';
    num.textContent = i + 1;

    const content = document.createElement('div');
    content.className = 'reco-text';
    
    const title = document.createElement('strong');
    title.textContent = rec.title + ". ";
    
    const detail = document.createTextNode(rec.detail); // Безопасный текст после заголовка

    content.append(title, detail);
    item.append(num, content);
    recoContainer.appendChild(item);
  });

  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('results').classList.add('visible');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function showRewrite() {
  const btn = document.getElementById('rewrite-btn');

  // 1. Проверка: был ли сделан анализ
  if (!currentAnalysisResults) {
    showNotice("Please analyze your CV first!");
    return;
  }

  // 2. Проверка: залогинен ли пользователь
  if (!currentUser) {
    showNotice("Please Sign In with Google to access Pro features.");
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Меняем текст на кнопке, чтобы пользователь видел процесс
  const originalText = btn.innerHTML;
  btn.innerHTML = `⏳ AI is rewriting (takes ~30s)...`;
  btn.disabled = true;

  try {
    // Получаем токен для проверки на бэкенде
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;

    // 3. ЗАПРОС К ИИ ЗА ТЕКСТОМ РЕРАЙТА
    const response = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvText: document.getElementById('cvText').value,
        jobText: document.getElementById('jobText').value,
        analysisResults: currentAnalysisResults, // Передаем контекст ошибок
        token: token // Передаем паспорт пользователя
      })
    });

    const data = await response.json();

    if (response.ok) {
      // 4. Если всё успешно, сохраняем текст и показываем блок
      lastRewrittenText = data.rewrittenResume;
      document.getElementById('rewrittenContent').textContent = lastRewrittenText;
      document.getElementById('rewriteBox').classList.add('active');
      document.getElementById('rewriteBox').scrollIntoView({ behavior: 'smooth' });
    } else {
      // Если не Pro или другая ошибка
      if (response.status === 403) {
        showNotice("This is a Pro feature. Upgrade to Pro to unlock AI Rewrite.");
        document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      } else {
        showNotice("AI Error: " + (data.error || "Please try again in a moment."));
      }
    }
  } catch (e) {
    console.error(e);
    alert('Connection error. Please try again.');
  } finally {
    // Возвращаем кнопку в нормальное состояние
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function handleUpgrade() {
  if (!currentUser) {
    // 1. Сначала плавно везем пользователя наверх к кнопке
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 2. Через полсекунды показываем подсказку под кнопкой
    setTimeout(() => {
      showLoginHint("Please Sign In with Google first to link your purchase to your account.");
    }, 600);
    
    return; // Выходим из функции
  }
  
  // Если пользователь вошел, формируем ссылку и открываем оплату
  const checkoutUrl = LEMON_URL + "?checkout[email]=" + encodeURIComponent(currentUser.email);
  window.open(checkoutUrl, '_blank');
}
  
function showNotice(message) {
  // 1. Ищем контейнер или создаем его, если это первое уведомление
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  // 2. Создаем сам "тост"
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message; // textContent безопаснее, чем innerHTML

  // 3. Добавляем в контейнер
  container.appendChild(toast);

  // 4. Удаляем уведомление через 3 секунды (когда закончится анимация)
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(lastRewrittenText, 180);
  doc.text(lines, 15, 20);
  doc.save('ResumeGate_Improved.pdf');
}

function showLoginHint(message) {
  const authSection = document.getElementById('auth-section');
  if (!authSection) return;

  // Если старая подсказка уже есть — удаляем, чтобы не плодить их
  const oldHint = authSection.querySelector('.login-hint');
  if (oldHint) oldHint.remove();

  // Создаем элемент подсказки
  const hint = document.createElement('div');
  hint.className = 'login-hint';
  hint.textContent = message;

  // ВАЖНО: Делаем родителя relative, чтобы подсказка прикрепилась к нему
  authSection.style.position = 'relative';
  
  authSection.appendChild(hint);

  // Удаляем через 5 секунд
  setTimeout(() => {
    if (hint.parentNode) hint.remove();
  }, 5000);
}

function downloadDOCX() {
  // 1. Берем текст от нейросети и упаковываем его в HTML-код, который Word понимает
  const source = '<html><head><meta charset="utf-8"></head><body>' + 
                 lastRewrittenText.split('\n').map(line => `<p>${line}</p>`).join('') + 
                 '</body></html>';

  // 2. Создаем "виртуальный файл" в памяти браузера
  const blob = new Blob(['\ufeff', source], { type: 'application/msword' });

  // 3. А ВОТ ТУТ МЫ ИСПОЛЬЗУЕМ ТО, ЧТО ТЫ НАШЛА:
  const url = URL.createObjectURL(blob); // Создаем временный адрес для этого файла
  const a = document.createElement("a"); // Создаем тот самый тег <a> из твоего гугла
  a.href = url;                          // Присваиваем ему адрес нашего текста
  a.download = "ResumeGate_Improved.doc"; // Используем атрибут download, который ты нашла!
  
  // 4. Имитируем нажатие на эту ссылку, чтобы началась загрузка
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
// File upload
document.getElementById('fileUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const area = document.getElementById('cvText');
  area.value = 'Reading file... ⏳';

  if (file.name.toLowerCase().endsWith('.txt')) {
    area.value = await file.text();
  } else if (file.name.toLowerCase().endsWith('.docx')) {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      area.value = result.value.trim();
    } catch { area.value = '⚠ Error reading DOCX. Please paste text manually.'; }
  } else if (file.name.toLowerCase().endsWith('.pdf')) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let pageText = content.items.map(item => item.str).join(' ');
        pageText = pageText.replace(/\s{2,}/g, ' ');
        text += pageText + '\n\n';
      }
      area.value = text.trim();
    } catch { area.value = '⚠ Error reading PDF. Please paste text manually.'; }
  }
  e.target.value = '';
});
  
// 1. Функция входа
async function signInWithGoogle() {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) showNotice("Login Error: " + error.message);
}

// 2. Функция выхода
async function signOut() {
  await sb.auth.signOut();
  window.location.reload();
}

// 3. Следим за пользователем
// Единая функция для обновления внешнего вида сайта в зависимости от логина и PRO
async function updateUI(session) {
  const authSection = document.getElementById('auth-section');
  const pricingSection = document.getElementById('pricing');
  const pricingLink = document.getElementById('nav-pricing'); // Убедись, что этот ID есть в HTML

  if (session && session.user) {
    currentUser = session.user;

    // 1. Проверяем Pro-статус в базе
    const { data: profile } = await sb
      .from('profiles')
      .select('is_pro')
      .eq('id', currentUser.id)
      .maybeSingle();

    const isPro = profile?.is_pro || false;

    // 2. УМНАЯ ЛОГИКА ДЛЯ PRICING (скрываем блок, меняем ссылку)
    if (isPro) {
      // Скрываем только большой блок с ценами внизу
      if (pricingSection) pricingSection.style.display = 'none';
      
      // Кнопку в меню НЕ скрываем, а меняем её смысл
      if (pricingLink) {
        pricingLink.style.display = 'block';
        pricingLink.textContent = 'Manage Plan';
        pricingLink.href = 'https://theresumegate.lemonsqueezy.com/billing';
        pricingLink.target = '_blank'; // Открывать в новой вкладке
      }
    } else {
      // Если вошел, но не PRO (обычный пользователь)
      if (pricingSection) pricingSection.style.display = 'block';
      if (pricingLink) {
        pricingLink.style.display = 'block';
        pricingLink.textContent = 'Pricing';
        pricingLink.href = '#pricing';
        pricingLink.target = '_self';
      }
    }

   // 3. Рисуем меню пользователя (PRO + имя + выход)
    authSection.innerHTML = '';
    
    const userWrapper = document.createElement('div');
    userWrapper.style.display = 'flex';
    userWrapper.style.alignItems = 'center';

    // СНАЧАЛА СОЗДАЕМ ПЛАШКУ PRO (если пользователь PRO)
    if (isPro) {
      const proTag = document.createElement('span');
      proTag.className = 'pro-tag';
      proTag.textContent = 'PRO';
      userWrapper.appendChild(proTag); // КЛАДЕМ ПЕРВОЙ
    }

    // ЗАТЕМ ДОБАВЛЯЕМ ИМЯ
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-size:13px; color:var(--ink-2); font-weight:600;';
    nameSpan.textContent = `Hi, ${currentUser.user_metadata.full_name.split(' ')[0]}`;
    userWrapper.appendChild(nameSpan); // КЛАДЕМ ВТОРОЙ

    const logoutBtn = document.createElement('button');
    logoutBtn.onclick = signOut;
    logoutBtn.style.cssText = 'background:none; border:none; color:var(--ink-4); cursor:pointer; font-size:12px; text-decoration:underline; margin-left:15px;';
    logoutBtn.textContent = 'Log Out';

    authSection.append(userWrapper, logoutBtn);

  } else {
    // 4. Если пользователь НЕ залогинен (гость)
    currentUser = null;
    if (pricingSection) pricingSection.style.display = 'block';
    if (pricingLink) {
      pricingLink.style.display = 'block';
      pricingLink.textContent = 'Pricing';
      pricingLink.href = '#pricing';
    }
    authSection.innerHTML = `<button class="nav-cta" onclick="signInWithGoogle()">Sign In with Google</button>`;
  }
}

// Слушатель событий авторизации
sb.auth.onAuthStateChange((event, session) => {
  console.log("Auth event:", event);
  updateUI(session);
});

// Мгновенная проверка при самой загрузке (чтобы не ждать события)
async function initSession() {
  const { data: { session } } = await sb.auth.getSession();
  updateUI(session);
}
initSession();
// тут был </script>
