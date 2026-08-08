import { env } from './config/env.js';
import { createApp } from './app.js';

// config/env.js loads dotenv and asserts the secrets exist, so a misconfigured
// deployment fails here at boot rather than at the first login attempt.
createApp().listen(env.port, () => {
  console.log(`Red Express API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  console.log(`SMS provider: ${env.sms.provider} | Push provider: ${env.push.provider}`);
});
