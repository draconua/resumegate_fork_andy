import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Твои проверенные CORS заголовки
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Инициализация Supabase (ключи берутся из настроек Vercel)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Получаем IP пользователя для контроля анонимных сканов
  const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const { cvText, jobText, token } = req.body; // Получаем текст и паспорт пользователя (token)
    const apiKey = process.env.GEMINI_API_KEY;

    let canScan = false;
    let userIdentifier = null;

    // --- ШАГ 1: ПРОВЕРКА ЛИМИТОВ В БАЗЕ ДАННЫХ ---
    if (token) {
      // Если пользователь залогинен: проверяем в таблице profiles
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (user && !authError) {
        userIdentifier = { type: 'member', id: user.id };
        const { data: profile } = await supabase.from('profiles').select('is_pro, scans_count').eq('id', user.id).single();
        
        // Если Pro или сканов меньше 3
        if (profile.is_pro || (profile.scans_count || 0) < 3) {
          canScan = true;
        }
      }
    } else {
      // Если аноним: проверяем в таблице anonymous_scans по IP
      userIdentifier = { type: 'anon', ip: userIP };
      const { data: anonData } = await supabase.from('anonymous_scans').select('scans_count').eq('ip_address', userIP).maybeSingle();
      
      if (!anonData || (anonData.scans_count || 0) < 3) {
        canScan = true;
        userIdentifier.currentCount = anonData ? anonData.scans_count : 0;
      }
    }

    // Если лимит исчерпан — не пускаем к ИИ
    if (!canScan) {
      return res.status(403).json({ 
        error: "LIMIT_EXCEEDED", 
        message: "You've reached your free limit of 3 scans. Please sign in or upgrade to Pro to continue." 
      });
    }

    // --- ШАГ 2: РАБОТА С GEMINI (твой оригинальный код) ---
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const currentYear = new Date().getFullYear();
    
    const systemPrompt = `You are an expert ATS (Applicant Tracking System) specialist and career coach. 
IMPORTANT CONTEXT: Today's date is ${today}. Do NOT flag employment dates up to ${currentYear} as being in the future.

YOUR TASK: Analyze the CV against the job description for ATS compatibility, keyword density, and professional impact.

Return ONLY valid JSON with this exact structure:
{
  "score": 85,
  "verdict": "Strong ATS performance",
  "summary": "Your explanation.",
  "subScores": { "formatting": 90, "keywords": 80, "readability": 85, "completeness": 90 },
  "keywordsFound": ["kw1"],
  "keywordsMissing": ["kw2"],
  "issues": [ { "severity": "warning", "text": "description" } ],
  "recommendations": [ { "title": "Action", "detail": "Advice" } ]
}
Return ONLY JSON. No markdown.`;

    const userPrompt = `CV: ${cvText || 'Empty'}\n\nJob Description: ${jobText || 'General Scan'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser Request:\n${userPrompt}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3
        }
      })
    });

    const data = await response.json();
    
    if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
    if (!data.candidates || !data.candidates[0]) throw new Error("Empty response from AI");
    
    const rawOutput = data.candidates[0].content.parts[0].text.trim();

    // --- ШАГ 3: УВЕЛИЧИВАЕМ СЧЕТЧИК В БАЗЕ (после успешного ответа) ---
    if (userIdentifier.type === 'member') {
      // Для зарегистрированных используем SQL функцию, которую мы создали
      await supabase.rpc('increment_scan_count', { user_id: userIdentifier.id });
    } else {
      // Для анонимов обновляем по IP
      await supabase.from('anonymous_scans').upsert({ 
        ip_address: userIdentifier.ip, 
        scans_count: (userIdentifier.currentCount || 0) + 1,
        last_scan: new Date()
      });
    }

    res.status(200).json({ choices: [{ message: { content: rawOutput } }] });
    
  } catch (error) {
    console.error("API Error:", error);
    const errorJson = { 
      score: 0, verdict: "Error", summary: `Error: ${error.message}`, 
      subScores: { formatting: 0, keywords: 0, readability: 0, completeness: 0 },
      keywordsFound: [], keywordsMissing: [], issues: [], recommendations: []
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
