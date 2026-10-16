import { buildApp } from './bootstrap';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp();
app.listen(config.port, config.host, () => {
  console.log(`API on http://${config.host}:${config.port} (provider: ${config.provider})`);
});
