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

    const systemPrompt = "You are an expert ATS optimizer. Analyze the CV against the job description. You MUST respond ONLY with a raw JSON object containing these exact keys: score (number 0-100), feedback (string), missingKeywords (array of strings). Do not include markdown code blocks like ```json.";
    const userPrompt = `CV Text:\n${cvText}\n\nJob Description:\n${jobText || 'General ATS Scan'}`;

    // Делаем прямой запрос к официальному API Google Gemini 1.5 Flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nUser Request:\n${userPrompt}` }]
        }],
        generationConfig: {
          // Включаем строгий JSON режим на стороне Google
          responseMimeType: "application/json",
          temperature: 0.3
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    // Извлекаем текст из структуры ответа Gemini
    const rawOutput = data.candidates[0].content.parts[0].text.trim();

    // Отправляем фронтенду в том формате, который ожидает index.html
    res.status(200).json({
      choices: [{
        message: {
          content: rawOutput
        }
      }]
    });

  } catch (error) {
    const errorJson = { 
      score: 0, 
      feedback: `Ошибка Gemini API: ${error.message}`, 
      missingKeywords: [] 
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
