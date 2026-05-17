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
    const token = process.env.REPLICATE_API_TOKEN;

    const systemPrompt = "You are an expert ATS optimizer. Analyze the CV against the job description. You MUST respond ONLY with a raw JSON object containing these keys: score (number 0-100), feedback (string), missingKeywords (array of strings). Do not include markdown code blocks like ```json.";
    const userPrompt = `CV Text:\n${cvText}\n\nJob Description:\n${jobText || 'General ATS Scan'}`;

    // Делаем один прямой запрос к быстрой модели Llama 3 8B Instruct
    const response = await fetch('[https://api.replicate.com/v1/models/meta/meta-llama-3-8b-instruct/predictions](https://api.replicate.com/v1/models/meta/meta-llama-3-8b-instruct/predictions)', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
        // Этот заголовок заставляет Replicate удерживать запрос и вернуть результат СРАЗУ, без циклов ожидания!
        'Prefer': 'wait' 
      },
      body: JSON.stringify({
        input: {
          prompt: userPrompt,
          system_prompt: systemPrompt,
          max_new_tokens: 1000,
          temperature: 0.2
        }
      })
    });

    const prediction = await response.json();

    if (prediction.error) {
      throw new Error(prediction.error);
    }

    // Извлекаем готовый текст ответа
    const rawOutput = Array.isArray(prediction.output) ? prediction.output.join('') : (prediction.output || '');
    const cleaned = rawOutput.replace(/```json|```/g, '').trim();

    // Отправляем на сайт
    res.status(200).json({
      choices: [{
        message: {
          content: cleaned
        }
      }]
    });

  } catch (error) {
    const errorJson = { 
      score: 0, 
      feedback: `Ошибка анализа: ${error.message}. Попробуйте еще раз через 10 секунд.`, 
      missingKeywords: [] 
    };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
