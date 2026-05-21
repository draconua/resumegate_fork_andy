import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = req.body;
    const eventName = body.meta.event_name;
    // Принудительно переводим email в нижний регистр для точности
    const userEmail = body.data.attributes.user_email.toLowerCase();

    console.log(`[Webhook] Event: ${eventName}, User: ${userEmail}`);

    if (eventName === 'order_created' || eventName === 'subscription_created') {
      
      // Пытаемся обновить профиль и просим вернуть данные измененной строки
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('email', userEmail)
        .select();

      if (error) {
        console.error('[Webhook DB Error]:', error.message);
        throw error;
      }

      // Проверяем, нашел ли запрос хоть одну строку для обновления
      if (data && data.length > 0) {
        console.log(`[Webhook Success] User ${userEmail} is now PRO!`);
      } else {
        // Это случится, если пользователь оплатил, но еще ни разу не входил через Google
        console.warn(`[Webhook Warning] User ${userEmail} paid, but has no profile in DB yet.`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Webhook Critical Error]:', err.message);
    res.status(400).json({ error: err.message });
  }
}
