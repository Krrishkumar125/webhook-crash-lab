// Used by the "GitHub Action" CI job: the broken demo handler must make the action fail.
import { demoConfig } from 'webhook-crash-lab';

export default demoConfig('broken');
