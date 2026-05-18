export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    const { cvText, jobText } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Перенесли твой детальный промпт на сервер (это безопаснее!)
    const systemPrompt = `You are an expert ATS (Applicant Tracking System) specialist and career coach. Analyze the CV against the job description. Return ONLY valid JSON with this exact structure:
{
  "score": 85,
  "verdict": "Strong ATS performance",
  "summary": "Your 2 sentences explaining the score.",
  "subScores": {
    "formatting": 90,
    "keywords": 80,
    "readability": 85,
    "completeness": 90
  },
  "keywordsFound": ["keyword1", "keyword2"],
  "keywordsMissing": ["missing1", "missing2"],
  "issues": [
    {"severity": "warning", "text": "Issue description here"}
  ],
  "recommendations": [
    {"title": "Action title", "detail": "Actionable advice"}
  ]
}
Return ONLY the JSON object, no markdown, no explanation.`;

    const userPrompt = `CV: ${cvText || 'Empty'}\n\nJob Description: ${jobText || 'General Scan'}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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
    if (data.error) throw new Error(data.error.message);
    
    const rawOutput = data.candidates[0].content.parts[0].text.trim();
    
    // Отправляем фронтенду
    res.status(200).json({ choices: [{ message: { content: rawOutput } }] });
    
  } catch (error) {
    // Безопасный фоллбэк, если что-то пойдет не так, чтобы сайт не завис
    const errorJson = { 
      score: 0, 
      verdict: "Error", 
      summary: `Ошибка API: ${error.message}`, 
      subScores: { formatting: 0, keywords: 0, readability: 0, completeness: 0 },
      keywordsFound: [], keywordsMissing: [], issues: [], recommendations: [] 
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
