import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  try {
    const { cvText, jobText, token } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    let canScan = true;
    let userIdentifier = null;

    // 1. Проверка лимитов (тихая)
    try {
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userIdentifier = { type: 'member', id: user.id };
          const { data: profile } = await supabase.from('profiles').select('is_pro, scans_count').eq('id', user.id).maybeSingle();
          if (profile && !profile.is_pro && (profile.scans_count || 0) >= 3) canScan = false;
        }
      } else {
        const { data: anonData } = await supabase.from('anonymous_scans').select('scans_count').eq('ip_address', userIP).maybeSingle();
        userIdentifier = { type: 'anon', ip: userIP, count: anonData ? anonData.scans_count : 0 };
        if (anonData && anonData.scans_count >= 3) canScan = false;
      }
    } catch (e) { console.log("DB check skipped"); }

    if (!canScan) {
      return res.status(403).json({ error: "LIMIT_EXCEEDED", message: "Free limit reached." });
    }

    // 2. Запрос к Gemini 2.5 Flash
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const systemPrompt = `You are an expert ATS specialist. Date: ${today}. Analyze the CV. Return ONLY valid JSON.`;
    const userPrompt = `CV: ${cvText}\nJob: ${jobText}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
      })
    });

    const aiData = await response.json();
    if (aiData.error) throw new Error(aiData.error.message);

    // Очищаем ответ от возможных маркдаун-тегов ```json
    let cleanJson = aiData.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();

    // 3. Увеличение счетчика в фоне
    if (userIdentifier) {
      if (userIdentifier.type === 'member') {
        supabase.rpc('increment_scan_count', { user_id: userIdentifier.id }).then(()=>{});
      } else {
        supabase.from('anonymous_scans').upsert({ ip_address: userIdentifier.ip, scans_count: userIdentifier.count + 1 }).then(()=>{});
      }
    }

    // Отправляем чистый JSON (фронтенд его распарсит)
    res.status(200).json({ content: cleanJson });
    
  } catch (error) {
    console.error("API ERROR:", error.message);
    res.status(200).json({ error: error.message }); // Возвращаем 200, чтобы не падать, но с текстом ошибки
  }
}
