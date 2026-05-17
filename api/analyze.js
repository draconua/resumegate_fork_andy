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

    const systemPrompt = `You are an expert ATS optimizer. Analyze the CV against the job description. You MUST respond ONLY with a raw JSON object containing these keys: score (number 0-100), feedback (string), missingKeywords (array of strings). Do not include markdown code blocks like \\\`\\\`\\\`json.`;
    const userPrompt = `CV Text:\n${cvText}\n\nJob Description:\n${jobText || 'General ATS Scan'}`;

    // Делаем запрос к официальному API Replicate для модели Llama 3
    const response = await fetch('https://api.replicate.com/v1/models/meta/meta-llama-3-70b-instruct/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          prompt: `${systemPrompt}\n\nUser Request:\n${userPrompt}`,
          max_tokens: 1000,
          temperature: 0.3
        }
      })
    });

    const prediction = await response.json();

    if (prediction.error) {
      return res.status(400).json({ error: prediction.error });
    }

    // Ждем, пока Replicate завершит генерацию (обычно 2-3 секунды)
let finalPrediction = prediction;

while (finalPrediction.status !== 'succeeded' && finalPrediction.status !== 'failed') {
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Запрашиваем статус напрямую по ID предсказания
  const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
    headers: { 'Authorization': `Token ${token}` }
  });
  finalPrediction = await checkRes.json();
}

    // Собираем текст ответа
    const rawOutput = Array.isArray(finalPrediction.output) ? finalPrediction.output.join('') : finalPrediction.output;
    const cleaned = rawOutput.replace(/```json|```/g, '').trim();

    // Отправляем сайту в формате, который он ожидает
    res.status(200).json({
      choices: [{
        message: {
          content: cleaned
        }
      }]
    });

  } catch (error) {
    const errorJson = { score: 0, feedback: `Replicate Server Error: ${error.message}`, missingKeywords: [] };
    res.status(200).json({ choices: [{ message: { content: JSON.stringify(errorJson) } }] });
  }
}
