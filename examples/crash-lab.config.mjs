// Run with: npx webhook-crash-lab run examples/crash-lab.config.mjs --html report.html
// Point `target` at your local dev server and `adapter` at your test database.
import { demoConfig } from 'webhook-crash-lab';

export default demoConfig('fixed');
